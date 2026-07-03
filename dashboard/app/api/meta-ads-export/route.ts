import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const META_SYSTEM_TOKEN = process.env.META_SYSTEM_USER_TOKEN;
const META_SYSTEM_ACCT  = process.env.META_AD_ACCOUNT_ID;
const META_BASE         = 'https://graph.facebook.com/v22.0';

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const datePreset = searchParams.get('date_preset') || 'maximum';
  const clientId   = searchParams.get('client_id');

  let META_ACCESS_TOKEN = META_SYSTEM_TOKEN;
  let META_AD_ACCOUNT_ID = META_SYSTEM_ACCT;

  if (clientId) {
    const { data: client } = await adminSupabase
      .from('clients')
      .select('meta_access_token, meta_ad_account_id, meta_connected')
      .eq('id', clientId)
      .single();
    if (client?.meta_connected && client.meta_access_token) {
      META_ACCESS_TOKEN  = client.meta_access_token as string;
      META_AD_ACCOUNT_ID = (client.meta_ad_account_id as string) || META_SYSTEM_ACCT;
    }
  }

  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    return NextResponse.json({ error: 'Meta API not configured' }, { status: 500 });
  }

  try {
    const [campaignsRes, adsetsRes, adsRes, insightsRes, dailyRes, demoRes, placementRes] =
      await Promise.all([
        fetch(
          `${META_BASE}/act_${META_AD_ACCOUNT_ID}/campaigns?` +
          `fields=id,name,objective,status,daily_budget,lifetime_budget,budget_remaining,created_time,updated_time,start_time,stop_time` +
          `&limit=500&access_token=${META_ACCESS_TOKEN}`
        ),
        fetch(
          `${META_BASE}/act_${META_AD_ACCOUNT_ID}/adsets?` +
          `fields=id,name,campaign_id,status,daily_budget,lifetime_budget,billing_event,optimization_goal,targeting,created_time,start_time,end_time` +
          `&limit=500&access_token=${META_ACCESS_TOKEN}`
        ),
        fetch(
          `${META_BASE}/act_${META_AD_ACCOUNT_ID}/ads?` +
          `fields=id,name,adset_id,campaign_id,status,creative,created_time,updated_time` +
          `&limit=500&access_token=${META_ACCESS_TOKEN}`
        ),
        fetch(
          `${META_BASE}/act_${META_AD_ACCOUNT_ID}/insights?` +
          `fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,` +
          `impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,` +
          `actions,cost_per_action_type,conversions,cost_per_conversion` +
          `&level=ad&date_preset=${datePreset}&limit=500&access_token=${META_ACCESS_TOKEN}`
        ),
        fetch(
          `${META_BASE}/act_${META_AD_ACCOUNT_ID}/insights?` +
          `fields=campaign_name,impressions,clicks,spend,ctr,cpc,reach` +
          `&level=campaign&time_increment=1&date_preset=${datePreset}&limit=1000&access_token=${META_ACCESS_TOKEN}`
        ),
        fetch(
          `${META_BASE}/act_${META_AD_ACCOUNT_ID}/insights?` +
          `fields=campaign_name,impressions,clicks,spend,ctr` +
          `&level=campaign&breakdowns=age,gender&date_preset=${datePreset}&limit=500&access_token=${META_ACCESS_TOKEN}`
        ),
        fetch(
          `${META_BASE}/act_${META_AD_ACCOUNT_ID}/insights?` +
          `fields=campaign_name,impressions,clicks,spend,ctr` +
          `&level=campaign&breakdowns=publisher_platform,platform_position&date_preset=${datePreset}&limit=500&access_token=${META_ACCESS_TOKEN}`
        ),
      ]);

    const [campaignsData, adsetsData, adsData, insightsData, dailyData, demoData, placementData] =
      await Promise.all([
        campaignsRes.json(), adsetsRes.json(), adsRes.json(),
        insightsRes.json(), dailyRes.json(), demoRes.json(), placementRes.json(),
      ]);

    let insights: Record<string, unknown>[] = insightsData.data || [];

    // Fallback: if Meta returns no insights, build them from local DB metrics
    if (!insights.length && clientId) {
      const { data: localCamps } = await adminSupabase
        .from('campaigns')
        .select('id,campaign_name,created_at,metrics')
        .eq('client_id', clientId);
      if (localCamps?.length) {
        insights = localCamps
          .filter(c => (c.metrics as Record<string, unknown>)?.last_stats)
          .map(c => {
            const m = (c.metrics ?? {}) as Record<string, unknown>;
            const ls = (m.last_stats ?? {}) as Record<string, unknown>;
            return {
              campaign_id:   (m.meta_campaign_id as string) ?? '',
              campaign_name: c.campaign_name,
              ...ls,
              date_start: (m.created_time as string) ?? c.created_at,
              date_stop:  (m.stats_updated_at as string) ?? new Date().toISOString(),
              _source:    'local_db',
            };
          });
      }
    }

    // Always include local DB campaigns for fallback export
    const { data: localCampaigns } = clientId
      ? await adminSupabase.from('campaigns').select('*').eq('client_id', clientId)
      : { data: null };

    return NextResponse.json({
      campaigns:       campaignsData.data    || [],
      adsets:          adsetsData.data       || [],
      ads:             adsData.data          || [],
      insights,
      daily:           dailyData.data        || [],
      demographics:    demoData.data         || [],
      placements:      placementData.data    || [],
      local_campaigns: localCampaigns        || [],
      exported_at:     new Date().toISOString(),
      date_range:      datePreset,
      account_id:      META_AD_ACCOUNT_ID,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
