import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const META = 'https://graph.facebook.com/v22.0'

// ── DB ────────────────────────────────────────────────────────────────────────

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

interface MetaClient {
  id:                  string
  name:                string
  meta_access_token:   string
  meta_ad_account_id:  string | null
}

async function loadClient(clientId: string): Promise<MetaClient> {
  const { data, error } = await db()
    .from('clients')
    .select('id, name, meta_access_token, meta_ad_account_id')
    .eq('id', clientId)
    .single()
  if (error || !data) throw new Error('Cliente no encontrado')
  if (!data.meta_access_token) throw new Error('El cliente no tiene token de Meta. Conéctalo primero.')
  if (!data.meta_ad_account_id) throw new Error('El cliente no tiene cuenta publicitaria configurada.')
  return data as MetaClient
}

// ── Meta API ──────────────────────────────────────────────────────────────────

interface CampaignInsights {
  spend:       string
  impressions: string
  reach:       string
  clicks:      string
  ctr:         string
  cpc:         string
  cpm:         string
  frequency:   string
  actions?:    Array<{ action_type: string; value: string }>
}

interface MetaCampaign {
  id:           string
  name:         string
  status:       string
  objective:    string
  created_time: string
  insights?:    { data?: CampaignInsights[] }
}

async function fetchActiveCampaigns(accountId: string, token: string, period: string): Promise<MetaCampaign[]> {
  const insightFields = [
    'spend', 'impressions', 'reach', 'clicks',
    'ctr', 'cpc', 'cpm', 'actions', 'cost_per_action_type', 'frequency',
  ].join(',')

  const fields = `id,name,status,objective,created_time,insights.date_preset(${period}){${insightFields}}`

  const filtering = JSON.stringify([
    { field: 'effective_status', operator: 'IN', value: ['ACTIVE'] },
  ])

  const url = new URL(`${META}/act_${accountId}/campaigns`)
  url.searchParams.set('fields',       fields)
  url.searchParams.set('filtering',    filtering)
  url.searchParams.set('limit',        '50')
  url.searchParams.set('access_token', token)

  const res  = await fetch(url.toString())
  const data = await res.json() as { data?: MetaCampaign[]; error?: { message: string } }

  if (!res.ok || data.error) throw new Error(data.error?.message ?? 'Error al obtener campañas de Meta')

  return data.data ?? []
}

// ── Claude analysis ───────────────────────────────────────────────────────────

async function analyzeWithClaude(campaigns: MetaCampaign[], clientName: string, period: string): Promise<string> {
  const campaignsWithSpend = campaigns.map(c => {
    const ins = c.insights?.data?.[0]
    return {
      nombre:      c.name,
      objetivo:    c.objective,
      gasto:       ins ? `$${parseFloat(ins.spend).toFixed(2)} MXN` : '$0',
      impresiones: ins?.impressions ?? '0',
      alcance:     ins?.reach ?? '0',
      clicks:      ins?.clicks ?? '0',
      ctr:         ins?.ctr ? `${parseFloat(ins.ctr).toFixed(2)}%` : '0%',
      cpc:         ins?.cpc ? `$${parseFloat(ins.cpc).toFixed(2)}` : '$0',
      cpm:         ins?.cpm ? `$${parseFloat(ins.cpm).toFixed(2)}` : '$0',
      frecuencia:  ins?.frequency ? parseFloat(ins.frequency).toFixed(1) : '0',
    }
  })

  const analysisPrompt = `Eres un experto en Meta Ads y marketing digital.
Analiza estas campañas publicitarias del cliente "${clientName}" y genera un reporte ejecutivo:

CAMPAÑAS ACTIVAS CON GASTO REAL (período: ${period}):
${JSON.stringify(campaignsWithSpend, null, 2)}

Genera un análisis en español con estas secciones:

1. RESUMEN EJECUTIVO (3-4 líneas)
   - Gasto total del período
   - Alcance total
   - Campaña con mejor rendimiento
   - Campaña que más necesita atención

2. ANÁLISIS POR CAMPAÑA
   Para cada campaña:
   - Nombre y objetivo
   - Gasto, alcance, CTR, CPC
   - CTR: bueno si >1%, excelente si >3%
   - CPC: evalúa vs benchmark de la industria
   - Diagnóstico: qué está funcionando y qué no
   - Acción recomendada: optimizar / escalar / pausar

3. CAMPAÑAS SUGERIDAS (oportunidades detectadas)
   Basado en los objetivos y brechas detectadas:
   - Máximo 3 sugerencias concretas y accionables
   - Formato: [Nombre] — [Objetivo] — [Presupuesto sugerido]

4. MÉTRICAS CLAVE DEL PERÍODO
   Resumen de todas las campañas activas

5. PRÓXIMOS PASOS PRIORITARIOS
   3 acciones ordenadas por impacto

Sé específico con los números. Usa los datos reales.
Formato: texto claro y profesional, sin markdown excesivo, listo para PDF.`

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
      messages:   [{ role: 'user', content: analysisPrompt }],
    }),
  })

  if (!res.ok) throw new Error(`Claude error: ${res.status}`)
  const data = await res.json() as { content?: Array<{ text: string }> }
  return data.content?.[0]?.text ?? ''
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { client_id?: string; period?: string }
    const { client_id, period = 'last_30d' } = body

    if (!client_id) {
      return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 })
    }

    // 1. Cargar cliente y token
    const client = await loadClient(client_id)

    // 2. Obtener campañas desde Meta API
    const allCampaigns = await fetchActiveCampaigns(
      client.meta_ad_account_id!,
      client.meta_access_token,
      period,
    )

    // 3. Filtrar solo campañas con gasto real > 0
    const campaignsWithSpend = allCampaigns.filter(c => {
      const spend = parseFloat(c.insights?.data?.[0]?.spend ?? '0')
      return spend > 0
    })

    if (!campaignsWithSpend.length) {
      return NextResponse.json({
        error: `No hay campañas con gasto real en los últimos ${period === 'last_30d' ? '30 días' : period}. ${allCampaigns.length} campañas tienen status ACTIVE pero gasto $0.`,
        campaigns: [],
        totalSpend: 0,
      }, { status: 200 })
    }

    // 4. Calcular métricas agregadas
    const totalSpend = campaignsWithSpend.reduce(
      (s, c) => s + parseFloat(c.insights?.data?.[0]?.spend ?? '0'), 0,
    )
    const totalReach = campaignsWithSpend.reduce(
      (s, c) => s + parseInt(c.insights?.data?.[0]?.reach ?? '0', 10), 0,
    )
    const ctrs = campaignsWithSpend
      .map(c => parseFloat(c.insights?.data?.[0]?.ctr ?? '0'))
      .filter(v => v > 0)
    const avgCTR = ctrs.length ? (ctrs.reduce((a, b) => a + b, 0) / ctrs.length).toFixed(2) : '0'

    // 5. Análisis con Claude
    const analysis = await analyzeWithClaude(campaignsWithSpend, client.name, period)

    return NextResponse.json({
      analysis,
      campaigns:  campaignsWithSpend,
      client:     { id: client.id, name: client.name },
      period,
      totalSpend: totalSpend.toFixed(2),
      totalReach,
      avgCTR,
      activeSinceGasto: campaignsWithSpend.length,
      activeSinGasto:   allCampaigns.length - campaignsWithSpend.length,
    })

  } catch (err) {
    console.error('ACTIVE_REPORT_ERROR:', err)
    return NextResponse.json(
      { error: (err as Error).message ?? 'Error al generar el reporte' },
      { status: 500 },
    )
  }
}
