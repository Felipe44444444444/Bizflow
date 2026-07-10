import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const META = 'https://graph.facebook.com/v22.0'

const MONTH_NAMES: Record<number, string> = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
}

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

interface MetaClient {
  id:                 string
  name:               string
  meta_access_token:  string
  meta_ad_account_id: string | null
}

async function loadClient(clientId: string): Promise<MetaClient> {
  const { data, error } = await db()
    .from('clients')
    .select('id, name, meta_access_token, meta_ad_account_id')
    .eq('id', clientId)
    .single()
  if (error || !data) throw new Error('Cliente no encontrado')
  if (!data.meta_access_token)   throw new Error('El cliente no tiene token de Meta. Conéctalo primero.')
  if (!data.meta_ad_account_id) throw new Error('El cliente no tiene cuenta publicitaria configurada.')
  return data as MetaClient
}

// ── Meta API ──────────────────────────────────────────────────────────────────

interface CampaignInsights {
  spend:            string
  impressions:      string
  reach:            string
  clicks:           string
  ctr:              string
  cpc:              string
  cpm:              string
  frequency:        string
  actions?:         Array<{ action_type: string; value: string }>
  results?:         Array<{ indicator: string; values?: Array<{ value: string }> }>
  cost_per_result?: Array<{ indicator: string; values?: Array<{ value: string }> }>
}

interface MetaCampaign {
  id:               string
  name:             string
  status:           string
  objective:        string
  daily_budget?:    string
  lifetime_budget?: string
  insights?:        { data?: CampaignInsights[] }
}

// ── Result metrics helpers ────────────────────────────────────────────────────

const INDICATOR_LABELS: Record<string, string> = {
  'actions:onsite_conversion.messaging_conversation_started_7d': 'Conversación iniciada',
  'actions:onsite_conversion.total_messaging_connection':         'Conexión de mensajes',
  'actions:onsite_conversion.messaging_first_reply':              'Primera respuesta',
  'actions:lead':                                                 'Lead generado',
  'actions:onsite_conversion.lead_grouped':                       'Lead generado',
  'actions:purchase':                                             'Compra',
  'actions:offsite_conversion.fb_pixel_purchase':                 'Compra (pixel)',
  'actions:link_click':                                           'Click al enlace',
  'actions:post_engagement':                                      'Interacción',
  'actions:page_engagement':                                      'Interacción de página',
  'actions:click_to_call_native_20s_call_connect':               'Llamada conectada',
  'reach':                                                        'Persona alcanzada',
}

const OBJECTIVE_LABELS: Record<string, string> = {
  'OUTCOME_MESSAGES':   'Mensaje iniciado',
  'OUTCOME_LEADS':      'Lead generado',
  'OUTCOME_ENGAGEMENT': 'Interacción',
  'OUTCOME_SALES':      'Compra',
  'OUTCOME_TRAFFIC':    'Click al enlace',
  'OUTCOME_AWARENESS':  'Persona alcanzada',
}

function getResultMetrics(campaign: MetaCampaign): {
  result: number; costPerResult: number; resultLabel: string
} {
  const ins = campaign.insights?.data?.[0]
  if (!ins) return { result: 0, costPerResult: 0, resultLabel: OBJECTIVE_LABELS[campaign.objective] ?? 'Resultado' }

  const resultEntry  = ins.results?.[0]
  const costEntry    = ins.cost_per_result?.[0]

  const result        = parseFloat(resultEntry?.values?.[0]?.value ?? '0')
  const costPerResult = parseFloat(costEntry?.values?.[0]?.value   ?? '0')

  const indicator = resultEntry?.indicator ?? ''
  const resultLabel =
    INDICATOR_LABELS[indicator] ??
    OBJECTIVE_LABELS[campaign.objective] ??
    'Resultado'

  return { result, costPerResult, resultLabel }
}

async function fetchCampaigns(
  accountId:    string,
  token:        string,
  insightParam: string,   // e.g. 'date_preset(last_30d)' or 'time_range({"since":"...","until":"..."})'
): Promise<MetaCampaign[]> {
  const insightFields = [
    'spend', 'impressions', 'reach', 'clicks',
    'ctr', 'cpc', 'cpm', 'frequency', 'actions',
    'results', 'cost_per_result',
  ].join(',')

  const fields = [
    'id', 'name', 'status', 'objective', 'daily_budget', 'lifetime_budget',
    `insights.${insightParam}{${insightFields}}`,
  ].join(',')

  const url = new URL(`${META}/act_${accountId}/campaigns`)
  url.searchParams.set('fields',        fields)
  url.searchParams.set('limit',         '100')
  url.searchParams.set('access_token',  token)

  const res  = await fetch(url.toString())
  const data = await res.json() as { data?: MetaCampaign[]; error?: { message: string } }
  if (!res.ok || data.error) throw new Error(data.error?.message ?? 'Error al obtener campañas de Meta')
  return data.data ?? []
}

// ── Totals ────────────────────────────────────────────────────────────────────

interface Totals {
  spend:       number
  impressions: number
  reach:       number
  clicks:      number
  avgCTR:      number
  avgCPC:      number
  avgCPM:      number
  conversions: number
  campaigns:   number
}

function calcTotals(campaigns: MetaCampaign[]): Totals {
  let spend = 0, impressions = 0, reach = 0, clicks = 0, conversions = 0

  for (const c of campaigns) {
    const ins = c.insights?.data?.[0]
    if (!ins) continue
    spend       += parseFloat(ins.spend       ?? '0')
    impressions += parseInt(ins.impressions   ?? '0', 10)
    reach       += parseInt(ins.reach         ?? '0', 10)
    clicks      += parseInt(ins.clicks        ?? '0', 10)
    conversions += getResultMetrics(c).result
  }

  return {
    spend,
    impressions,
    reach,
    clicks,
    avgCTR:      clicks && impressions ? (clicks / impressions) * 100 : 0,
    avgCPC:      clicks ? spend / clicks : 0,
    avgCPM:      impressions ? (spend / impressions) * 1000 : 0,
    conversions: Math.round(conversions),
    campaigns:   campaigns.length,
  }
}

// ── Claude ────────────────────────────────────────────────────────────────────

interface CampaignAnalysis {
  nombre:   string
  decision: 'mantener' | 'optimizar' | 'pausar' | 'escalar'
  razon:    string
  accion:   string
  score:    number
}

interface ReportAnalysis {
  resumen:               string
  rendimiento_general:   'excellent' | 'good' | 'average' | 'poor'
  campanas:              CampaignAnalysis[]
  observaciones:         string[]
  oportunidades:         string[]
  proximos_pasos:        string[]
  advertencias:          string[]
}

async function analyzeWithClaude(
  campaigns: MetaCampaign[],
  totals:    Totals,
  client:    MetaClient,
  monthName: string,
  year:      number,
  since:     string,
  until:     string,
): Promise<ReportAnalysis> {
  const campData = campaigns.map(c => {
    const ins = c.insights?.data?.[0]
    const rm  = getResultMetrics(c)
    return {
      nombre:              c.name,
      objetivo:            c.objective,
      gasto:               ins ? parseFloat(ins.spend).toFixed(2) : '0',
      impresiones:         ins?.impressions ?? '0',
      alcance:             ins?.reach       ?? '0',
      clicks:              ins?.clicks      ?? '0',
      ctr:                 ins?.ctr         ? `${parseFloat(ins.ctr).toFixed(2)}%`  : '0%',
      cpc:                 ins?.cpc         ? `$${parseFloat(ins.cpc).toFixed(2)}`  : '$0',
      cpm:                 ins?.cpm         ? `$${parseFloat(ins.cpm).toFixed(2)}`  : '$0',
      frecuencia:          ins?.frequency   ? parseFloat(ins.frequency).toFixed(1)  : '0',
      resultados:          rm.result,
      tipo_resultado:      rm.resultLabel,
      costo_por_resultado: rm.costPerResult > 0 ? `$${rm.costPerResult.toFixed(2)}` : '$0',
    }
  })

  const prompt = `Eres consultor senior de Meta Ads.
Analiza estas campañas del período ${monthName}.

CLIENTE: ${client.name}
PERÍODO: ${since} al ${until}

CAMPAÑAS CON GASTO REAL (cada una incluye su resultado primario según el objetivo de Meta):
${JSON.stringify(campData, null, 2)}

TOTALES DEL PERÍODO:
Gasto total: $${totals.spend.toFixed(2)} MXN
Alcance: ${totals.reach.toLocaleString()} personas
Clicks: ${totals.clicks.toLocaleString()}
CTR promedio: ${totals.avgCTR.toFixed(2)}%
CPC promedio: $${totals.avgCPC.toFixed(2)}
CPM promedio: $${totals.avgCPM.toFixed(2)}
Total resultados: ${totals.conversions}

NOTA: El campo "resultados" y "costo_por_resultado" de cada campaña ya están calculados correctamente según el objetivo real de Meta (conversación iniciada, lead, compra, etc.). Úsalos como la métrica de eficiencia principal.

Genera análisis ejecutivo en español con este JSON exacto (sin markdown, sin comentarios):
{
  "resumen": "2-3 oraciones del panorama general del período con números reales (gasto, resultados, costo por resultado)",
  "rendimiento_general": "excellent|good|average|poor",
  "campanas": [
    {
      "nombre": "nombre exacto de la campaña",
      "decision": "mantener|optimizar|pausar|escalar",
      "razon": "razón específica con los números de resultados y costo_por_resultado de esta campaña",
      "accion": "acción concreta a tomar esta semana",
      "score": 8.5
    }
  ],
  "observaciones": [
    "observación 1 con dato específico y número",
    "observación 2",
    "observación 3"
  ],
  "oportunidades": [
    "oportunidad de mejora 1 accionable",
    "oportunidad 2"
  ],
  "proximos_pasos": [
    "paso prioritario 1 esta semana",
    "paso 2",
    "paso 3"
  ],
  "advertencias": []
}
Devuelve SOLO el JSON. Sin markdown. Sin texto antes o después.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 2000,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) throw new Error(`Claude error ${res.status}`)
  const data = await res.json() as { content?: Array<{ text: string }> }
  const text = (data.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(text) as ReportAnalysis
  } catch {
    // Fallback si Claude no devuelve JSON limpio
    return {
      resumen:             'Análisis no disponible. Revisa los datos de las campañas.',
      rendimiento_general: 'average',
      campanas:            campaigns.map(c => ({
        nombre:   c.name,
        decision: 'mantener' as const,
        razon:    'Sin análisis disponible',
        accion:   'Revisar métricas manualmente',
        score:    5,
      })),
      observaciones:  ['Sin observaciones disponibles'],
      oportunidades:  [],
      proximos_pasos: ['Revisar el reporte manualmente'],
      advertencias:   ['El análisis de IA no pudo procesarse correctamente'],
    }
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

// Etiquetas legibles para los presets de Meta
const PRESET_LABELS: Record<string, string> = {
  last_30d:   'Últimos 30 días',
  last_7d:    'Últimos 7 días',
  last_90d:   'Últimos 90 días',
  last_month: 'Mes anterior',
  this_month: 'Este mes',
  yesterday:  'Ayer',
  today:      'Hoy',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      client_id?:   string
      date_preset?: string
      month?:       number
      year?:        number
      since?:       string
      until?:       string
    }

    const { client_id } = body
    if (!client_id) return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 })

    const client = await loadClient(client_id)

    // Quitar prefijo 'act_' si ya viene incluido en el valor almacenado
    const rawAccountId = client.meta_ad_account_id!
    const accountId    = rawAccountId.startsWith('act_') ? rawAccountId.slice(4) : rawAccountId

    // ── Construir insightParam y metadatos del período ─────────────────────────
    let insightParam: string
    let since:        string
    let until:        string
    let monthName:    string
    let periodMonth:  number | undefined

    if (body.date_preset) {
      // Modo preset — Meta calcula las fechas internamente
      insightParam = `date_preset(${body.date_preset})`
      monthName    = PRESET_LABELS[body.date_preset] ?? body.date_preset
      // Aproximar since/until para mostrar en el PDF (solo informativo)
      const today  = new Date()
      until = today.toISOString().split('T')[0]
      if (body.date_preset === 'last_30d') {
        const d = new Date(today); d.setDate(d.getDate() - 30); since = d.toISOString().split('T')[0]
      } else if (body.date_preset === 'last_7d') {
        const d = new Date(today); d.setDate(d.getDate() - 7); since = d.toISOString().split('T')[0]
      } else if (body.date_preset === 'last_90d') {
        const d = new Date(today); d.setDate(d.getDate() - 90); since = d.toISOString().split('T')[0]
      } else if (body.date_preset === 'last_month') {
        const d = new Date(today.getFullYear(), today.getMonth(), 1)
        d.setDate(0) // último día del mes anterior
        until = d.toISOString().split('T')[0]
        const s = new Date(d.getFullYear(), d.getMonth(), 1)
        since = s.toISOString().split('T')[0]
      } else if (body.date_preset === 'this_month') {
        const s = new Date(today.getFullYear(), today.getMonth(), 1)
        since = s.toISOString().split('T')[0]
      } else {
        since = until // fallback
      }

    } else if (body.since && body.until) {
      // Modo rango personalizado
      since        = body.since
      until        = body.until
      insightParam = `time_range({"since":"${since}","until":"${until}"})`
      const d      = new Date(since + 'T00:00:00')
      const dUntil = new Date(until + 'T00:00:00')
      monthName    = `${since} al ${until}` // simple, sin duplicar año
      // Si el rango es un mes exacto, detectarlo
      const isFullMonth =
        d.getDate() === 1 &&
        dUntil.getMonth() === d.getMonth() &&
        dUntil.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      if (isFullMonth) {
        monthName   = `${MONTH_NAMES[d.getMonth() + 1]} ${d.getFullYear()}`
        periodMonth = d.getMonth() + 1
      }

    } else {
      // Modo mes/año
      const month = body.month ?? (new Date().getMonth() + 1)
      const year  = body.year  ?? new Date().getFullYear()
      if (month < 1 || month > 12) return NextResponse.json({ error: 'Mes inválido (1-12)' }, { status: 400 })
      periodMonth  = month
      monthName    = `${MONTH_NAMES[month]} ${year}`
      since        = `${year}-${String(month).padStart(2, '0')}-01`
      until        = new Date(year, month, 0).toISOString().split('T')[0]
      insightParam = `time_range({"since":"${since}","until":"${until}"})`
    }

    // ── Llamada a Meta API ──────────────────────────────────────────────────────
    const allCampaigns = await fetchCampaigns(accountId, client.meta_access_token, insightParam)

    // Filtrar solo las que tienen gasto real > 0
    const campaigns = allCampaigns.filter(c =>
      parseFloat(c.insights?.data?.[0]?.spend ?? '0') > 0,
    )

    if (!campaigns.length) {
      return NextResponse.json({
        error:     `No hay campañas con gasto real en el período: ${monthName}. Se encontraron ${allCampaigns.length} campañas pero ninguna con gasto.`,
        all_count: allCampaigns.length,
        campaigns: [],
        totals:    null,
        analysis:  null,
        client:    { id: client.id, name: client.name },
        period:    { month: periodMonth, year: body.year, monthName, since, until },
      })
    }

    const year     = body.year ?? new Date(since + 'T00:00:00').getFullYear()
    const totals   = calcTotals(campaigns)
    const analysis = await analyzeWithClaude(campaigns, totals, client, monthName, year, since, until)

    return NextResponse.json({
      client:    { id: client.id, name: client.name },
      period:    { month: periodMonth, year, monthName, since, until },
      campaigns,
      totals,
      analysis,
    })

  } catch (err) {
    console.error('META_REPORT_ERROR:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
