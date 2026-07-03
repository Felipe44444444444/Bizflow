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

async function metaGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${META}${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res  = await fetch(url.toString())
  const data = await res.json() as Record<string, unknown>
  if (!res.ok || data.error) {
    const e = data.error as Record<string, unknown> | undefined
    throw new Error(String(e?.message ?? `Meta API error: ${path}`))
  }
  return data
}

async function paginateAll(path: string, token: string, params: Record<string, string> = {}) {
  const allItems: Record<string, unknown>[] = []
  let after: string | null = null
  let pages = 0

  while (pages < 10) {
    const q = { ...params, limit: '200', ...(after ? { after } : {}) }
    const data = await metaGet(path, token, q)
    const items = (data.data as Record<string, unknown>[]) ?? []
    allItems.push(...items)
    const nextCursor = (data.paging as Record<string, unknown> | undefined)?.cursors as Record<string, string> | undefined
    after = nextCursor?.after ?? null
    const hasNext = Boolean((data.paging as Record<string, unknown> | undefined)?.next)
    if (!hasNext || !after) break
    pages++
  }
  return allItems
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const clientId   = searchParams.get('client_id') ?? ''
    const datePreset = searchParams.get('date_preset') ?? 'last_30d'

    // Load client token + ad account
    const { data: clientRow, error: clientErr } = await db()
      .from('clients')
      .select('id, name, meta_access_token, meta_ad_account_id')
      .eq('id', clientId)
      .single()

    if (clientErr || !clientRow?.meta_access_token) {
      return NextResponse.json({ error: 'Cliente sin token de Meta Ads. Conéctalo primero.' }, { status: 400 })
    }

    const token = clientRow.meta_access_token as string
    const accId = clientRow.meta_ad_account_id as string | null

    if (!accId) {
      return NextResponse.json({ error: 'El cliente no tiene cuenta publicitaria configurada.' }, { status: 400 })
    }

    const insightFields = 'impressions,reach,clicks,ctr,cpc,cpm,spend,frequency,actions,cost_per_action_type,campaign_name,campaign_id,adset_name,ad_name,date_start,date_stop'

    // Fetch all data in parallel
    const [campaigns, insights, daily, demographics, placements] = await Promise.all([
      paginateAll(`/act_${accId}/campaigns`, token, {
        fields: 'id,name,status,objective,daily_budget,start_time,stop_time',
      }),
      paginateAll(`/act_${accId}/insights`, token, {
        fields:      insightFields,
        date_preset: datePreset,
        level:       'campaign',
      }),
      paginateAll(`/act_${accId}/insights`, token, {
        fields:         insightFields,
        date_preset:    datePreset,
        level:          'campaign',
        time_increment: '1',
      }).catch(() => [] as Record<string, unknown>[]),
      paginateAll(`/act_${accId}/insights`, token, {
        fields:      'campaign_name,impressions,clicks,ctr,spend',
        date_preset: datePreset,
        level:       'campaign',
        breakdowns:  'age,gender',
      }).catch(() => [] as Record<string, unknown>[]),
      paginateAll(`/act_${accId}/insights`, token, {
        fields:      'campaign_name,impressions,clicks,ctr,spend',
        date_preset: datePreset,
        level:       'campaign',
        breakdowns:  'publisher_platform,platform_position',
      }).catch(() => [] as Record<string, unknown>[]),
    ])

    // Load local campaigns from DB for fallback
    const { data: localCamps } = await db()
      .from('campaigns')
      .select('id, campaign_name, status, objective, budget_monthly, platform, metrics, meta_campaign_id')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      campaigns,
      adsets:          [],
      ads:             [],
      insights,
      daily,
      demographics,
      placements,
      local_campaigns: localCamps ?? [],
      date_range:      datePreset,
      exported_at:     new Date().toISOString(),
      account_id:      accId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
