import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const META = 'https://graph.facebook.com/v22.0'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// ── Meta API helpers ──────────────────────────────────────────────────────────

async function metaGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${META}${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  const data = await res.json() as Record<string, unknown>
  if (!res.ok || data.error) {
    const e = data.error as Record<string, unknown> | undefined
    throw new Error(String(e?.message ?? `Meta API error: ${path}`))
  }
  return data
}

async function metaPostJson(path: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`${META}${path}?access_token=${token}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok || data.error) {
    const e = data.error as Record<string, unknown> | undefined
    throw new Error(String(e?.message ?? `Meta API error: POST ${path}`))
  }
  return data
}

async function metaPostForm(path: string, token: string, form: FormData) {
  const res = await fetch(`${META}${path}?access_token=${token}`, {
    method: 'POST',
    body:   form,
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok || data.error) {
    const e = data.error as Record<string, unknown> | undefined
    throw new Error(String(e?.message ?? `Meta API error: POST form ${path}`))
  }
  return data
}

// ── DB helpers ────────────────────────────────────────────────────────────────

interface MetaClient {
  id: string
  name: string
  meta_access_token: string
  meta_ad_account_id: string | null
  meta_page_id: string | null
}

async function loadClient(clientId: string): Promise<MetaClient> {
  const { data, error } = await db()
    .from('clients')
    .select('id, name, meta_access_token, meta_ad_account_id, meta_page_id')
    .eq('id', clientId)
    .single()
  if (error || !data) throw new Error('Cliente no encontrado')
  if (!data.meta_access_token) throw new Error('El cliente no tiene token de Meta Ads. Conéctalo primero desde Clientes → editar.')
  return data as MetaClient
}

async function loadClientByMetaCampaignId(metaCampId: string): Promise<MetaClient> {
  const { data } = await db()
    .from('campaigns')
    .select('client_id')
    .eq('meta_campaign_id', metaCampId)
    .limit(1)
    .maybeSingle()
  if (!data) throw new Error('No se encontró la campaña en la base de datos local.')
  return loadClient(data.client_id as string)
}

async function loadClientByMetaAdsetId(metaAdsetId: string): Promise<MetaClient> {
  const { data } = await db()
    .from('campaigns')
    .select('client_id')
    .eq('meta_adset_id', metaAdsetId)
    .limit(1)
    .maybeSingle()
  if (!data) throw new Error('No se encontró el Ad Set en la base de datos local.')
  return loadClient(data.client_id as string)
}

// ── Objective mapping ─────────────────────────────────────────────────────────

const OBJECTIVE_MAP: Record<string, string> = {
  'Tráfico':        'OUTCOME_TRAFFIC',
  'Mensajes':       'OUTCOME_ENGAGEMENT',
  'Leads':          'OUTCOME_LEADS',
  'Ventas':         'OUTCOME_SALES',
  'Reconocimiento': 'OUTCOME_AWARENESS',
  'Conversiones':   'OUTCOME_SALES',
  'Engagement':     'OUTCOME_ENGAGEMENT',
  'Consideración':  'OUTCOME_TRAFFIC',
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function actListAccounts(clientId: string) {
  const client = await loadClient(clientId)
  const token  = client.meta_access_token

  const [adAccsRes, pagesRes] = await Promise.all([
    metaGet('/me/adaccounts', token, { fields: 'name,account_id,currency,business_name,account_status' }),
    metaGet('/me/accounts',   token, { fields: 'id,name' }),
  ])

  return NextResponse.json({
    ad_accounts: (adAccsRes.data as unknown[]) ?? [],
    pages:       (pagesRes.data as unknown[])  ?? [],
  })
}

async function actSyncAllCampaigns(clientId: string) {
  const client = await loadClient(clientId)
  const token  = client.meta_access_token
  const accId  = client.meta_ad_account_id
  if (!accId) {
    throw new Error('El cliente no tiene cuenta publicitaria configurada. Usa el picker de cuenta.')
  }

  const metaRes = await metaGet(`/act_${accId}/campaigns`, token, {
    fields: 'id,name,status,objective,daily_budget,start_time,stop_time',
    limit:  '100',
  })
  const metaCampaigns = (metaRes.data as Record<string, unknown>[]) ?? []

  const supabase = db()
  let synced = 0

  for (const mc of metaCampaigns) {
    const metaStatus = String(mc.status ?? '').toUpperCase()
    const dbStatus   = metaStatus === 'ACTIVE' ? 'active' : metaStatus === 'PAUSED' ? 'paused' : 'draft'
    const dailyBudgetCents = Number(mc.daily_budget ?? 0)
    const budgetMonthly    = dailyBudgetCents > 0 ? Math.round((dailyBudgetCents / 100) * 30) : null

    const { data: existing } = await supabase
      .from('campaigns')
      .select('id, metrics')
      .eq('meta_campaign_id', String(mc.id))
      .maybeSingle()

    if (existing) {
      await supabase.from('campaigns').update({
        status:     dbStatus,
        updated_at: new Date().toISOString(),
        metrics:    { ...(existing.metrics as Record<string, unknown> ?? {}), meta_campaign_id: mc.id },
      }).eq('id', existing.id)
    } else {
      await supabase.from('campaigns').insert({
        client_id:        clientId,
        platform:         'Meta Ads',
        campaign_name:    String(mc.name ?? 'Sin nombre'),
        objective:        String(mc.objective ?? ''),
        status:           dbStatus,
        budget_monthly:   budgetMonthly,
        meta_campaign_id: String(mc.id),
        metrics:          { meta_campaign_id: mc.id },
      })
    }
    synced++
  }

  return NextResponse.json({
    success:       true,
    synced,
    total_in_meta: metaCampaigns.length,
  })
}

async function actGetStats(clientId: string, payload: Record<string, unknown>) {
  const client  = await loadClient(clientId)
  const token   = client.meta_access_token
  const campId  = String(payload.campaign_id ?? '')
  const preset  = String(payload.date_preset ?? 'last_30d')

  if (!campId) throw new Error('campaign_id es requerido')

  const res = await metaGet(`/${campId}/insights`, token, {
    fields:      'impressions,reach,clicks,ctr,cpc,cpm,spend,frequency,actions,cost_per_action_type,campaign_name,campaign_id',
    date_preset: preset,
    level:       'campaign',
  })

  return NextResponse.json({ success: true, stats: (res.data as unknown[]) ?? [] })
}

async function actCreateCampaign(clientId: string, payload: Record<string, unknown>) {
  const client = await loadClient(clientId)
  const token  = client.meta_access_token
  const accId  = client.meta_ad_account_id
  if (!accId) throw new Error('El cliente no tiene cuenta publicitaria configurada.')

  const metaObjective = OBJECTIVE_MAP[String(payload.objective ?? '')] ?? 'OUTCOME_TRAFFIC'

  // Convert budget to daily cents for Meta (Meta uses cents)
  const budgetVal = Number(payload.budget_monthly ?? 200)
  const dailyBudgetCents = payload.budget_type === 'Diario'
    ? Math.round(budgetVal * 100)
    : Math.round((budgetVal / 30) * 100)

  // Create campaign (paused to avoid immediate spend)
  const camp = await metaPostJson(`/act_${accId}/campaigns`, token, {
    name:                  String(payload.campaign_name ?? 'Nueva campaña'),
    objective:             metaObjective,
    status:                'PAUSED',
    special_ad_categories: [],
  })

  // Build targeting
  const targeting: Record<string, unknown> = {
    age_min:       Number(payload.age_min ?? 25),
    age_max:       Number(payload.age_max ?? 55),
    geo_locations: { countries: ['MX'] },
  }
  const gender = String(payload.gender ?? 'Todos')
  if (gender === 'Hombre') targeting.genders = [1]
  else if (gender === 'Mujer') targeting.genders = [2]

  const optGoal = metaObjective === 'OUTCOME_TRAFFIC'    ? 'LINK_CLICKS'
                : metaObjective === 'OUTCOME_LEADS'       ? 'LEAD_GENERATION'
                : metaObjective === 'OUTCOME_SALES'       ? 'OFFSITE_CONVERSIONS'
                : 'REACH'

  // Create ad set
  const adset = await metaPostJson(`/act_${accId}/adsets`, token, {
    name:              `${String(payload.campaign_name ?? 'Ad Set')} — Set`,
    campaign_id:       String(camp.id),
    billing_event:     'IMPRESSIONS',
    optimization_goal: optGoal,
    daily_budget:      dailyBudgetCents,
    targeting,
    status:            'PAUSED',
  })

  return NextResponse.json({
    success:     true,
    campaign_id: String(camp.id),
    adset_id:    String(adset.id),
  })
}

async function actCreateAdWithCreative(payload: Record<string, unknown>) {
  const adsetId  = String(payload.adset_id ?? '')
  const imageUrl = String(payload.image_url ?? '')

  if (!adsetId)  throw new Error('adset_id es requerido')
  if (!imageUrl) throw new Error('image_url es requerido')

  const client = await loadClientByMetaAdsetId(adsetId)
  const token  = client.meta_access_token
  const accId  = client.meta_ad_account_id
  if (!accId) throw new Error('Sin cuenta publicitaria para este ad set.')

  // Upload image from URL
  const imgForm = new FormData()
  imgForm.append('filename', 'ad_image')
  imgForm.append('url', imageUrl)
  const imgData = await metaPostForm(`/act_${accId}/adimages`, token, imgForm)

  const images = Object.values((imgData.images as Record<string, Record<string, unknown>>) ?? {})
  const imageHash = String(images[0]?.hash ?? '')
  if (!imageHash) throw new Error('No se pudo subir la imagen a Meta.')

  const pageId = client.meta_page_id ?? ''
  if (!pageId) throw new Error('El cliente no tiene Página de Facebook configurada.')

  // Create ad creative
  const creative = await metaPostJson(`/act_${accId}/adcreatives`, token, {
    name: `Creative — ${String(payload.campaign_name ?? 'Anuncio')}`,
    object_story_spec: {
      page_id:   pageId,
      link_data: {
        image_hash:  imageHash,
        link:        String(payload.website_url ?? 'https://xenttech.com'),
        message:     String(payload.primary_text ?? ''),
        name:        String(payload.headline ?? ''),
        description: String(payload.description ?? ''),
        call_to_action: {
          type:  String(payload.cta ?? 'LEARN_MORE'),
          value: { link: String(payload.website_url ?? 'https://xenttech.com') },
        },
      },
    },
  })

  // Create ad (paused)
  const ad = await metaPostJson(`/act_${accId}/ads`, token, {
    name:      `Ad — ${String(payload.campaign_name ?? 'Anuncio')}`,
    adset_id:  adsetId,
    creative:  { creative_id: String(creative.id) },
    status:    'PAUSED',
  })

  return NextResponse.json({
    ad_id:       String(ad.id),
    creative_id: String(creative.id),
    image_hash:  imageHash,
  })
}

async function actToggleCampaign(payload: Record<string, unknown>) {
  const campId    = String(payload.campaign_id ?? '')
  const adsetId   = String(payload.adset_id ?? '')
  const adId      = String(payload.ad_id ?? '')
  const newStatus = String(payload.status ?? 'PAUSED')

  if (!campId) throw new Error('campaign_id es requerido')

  const client = await loadClientByMetaCampaignId(campId)
  const token  = client.meta_access_token

  await metaPostJson(`/${campId}`, token, { status: newStatus })
  if (adsetId) await metaPostJson(`/${adsetId}`, token, { status: newStatus }).catch(() => null)
  if (adId)    await metaPostJson(`/${adId}`,    token, { status: newStatus }).catch(() => null)

  return NextResponse.json({ success: true, status: newStatus })
}

// ── Main POST handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      action:     string
      client_id?: string
      payload?:   Record<string, unknown>
    }
    const { action, client_id = '', payload = {} } = body

    switch (action) {
      case 'list_accounts':         return await actListAccounts(client_id)
      case 'sync_all_campaigns':    return await actSyncAllCampaigns(client_id)
      case 'get_stats':             return await actGetStats(client_id, payload)
      case 'create_campaign':       return await actCreateCampaign(client_id, payload)
      case 'create_ad_with_creative': return await actCreateAdWithCreative(payload)
      case 'toggle_campaign':       return await actToggleCampaign(payload)
      default:
        return NextResponse.json({ error: `Acción desconocida: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
