import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const META_SYSTEM_TOKEN  = process.env.META_SYSTEM_USER_TOKEN;
const META_SYSTEM_ACCT   = process.env.META_AD_ACCOUNT_ID;
const META_SYSTEM_PAGE   = process.env.META_PAGE_ID || '774799492384500';
const META_API_VERSION   = 'v22.0';
const META_BASE          = `https://graph.facebook.com/${META_API_VERSION}`;

// Supabase admin client (server-side only)
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ActionEntry = { action_type: string; value: string };

function parseMetaActions(stats: Record<string, unknown>) {
  const actions = (stats.actions as ActionEntry[]) ?? [];
  const cpa     = (stats.cost_per_action_type as ActionEntry[]) ?? [];
  const msgTypes = [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
    'onsite_conversion.messaging_block',
    'onsite_conversion.total_messaging_connection',
  ];

  // Results = first action (Meta puts primary objective result first)
  const resultsCount = actions.length > 0 ? parseInt(actions[0].value ?? '0') : 0;
  const resultsType  = actions[0]?.action_type ?? '';
  const costPerResult = cpa.length > 0 ? parseFloat(cpa[0].value ?? '0') : 0;

  // Messages = first matching messaging action
  let messagesCount = 0;
  let costPerMessage = 0;
  for (const a of actions) {
    if (msgTypes.some(t => a.action_type === t || a.action_type?.includes('messaging'))) {
      messagesCount = parseInt(a.value ?? '0');
      break;
    }
  }
  for (const c of cpa) {
    if (msgTypes.some(t => c.action_type === t || c.action_type?.includes('messaging'))) {
      costPerMessage = parseFloat(c.value ?? '0');
      break;
    }
  }

  // Fallback: if objective is messaging but no separate messaging action found, use results
  if (messagesCount === 0 && resultsType.includes('messaging')) {
    messagesCount  = resultsCount;
    costPerMessage = costPerResult;
  }

  return { results_count: resultsCount, results_type: resultsType, messages_count: messagesCount, cost_per_result: costPerResult, cost_per_message: costPerMessage };
}

function mapObjective(obj: string): string {
  const map: Record<string, string> = {
    'Reconocimiento': 'OUTCOME_AWARENESS',
    'Awareness': 'OUTCOME_AWARENESS',
    'Tráfico': 'OUTCOME_TRAFFIC',
    'Trafico': 'OUTCOME_TRAFFIC',
    'Interacción': 'OUTCOME_ENGAGEMENT',
    'Engagement': 'OUTCOME_ENGAGEMENT',
    'Clientes potenciales': 'OUTCOME_LEADS',
    'Leads': 'OUTCOME_LEADS',
    'Ventas': 'OUTCOME_SALES',
    'Conversiones': 'OUTCOME_SALES',
  };
  return map[obj] ?? 'OUTCOME_TRAFFIC';
}

const COUNTRY_CODES: Record<string, string> = {
  'mexico': 'MX', 'méxico': 'MX', 'mx': 'MX',
  'chihuahua': 'MX', 'cdmx': 'MX', 'ciudad de mexico': 'MX', 'ciudad de méxico': 'MX',
  'guadalajara': 'MX', 'monterrey': 'MX', 'puebla': 'MX', 'tijuana': 'MX',
  'colombia': 'CO', 'co': 'CO',
  'argentina': 'AR', 'ar': 'AR',
  'peru': 'PE', 'perú': 'PE', 'pe': 'PE',
  'chile': 'CL', 'cl': 'CL',
  'españa': 'ES', 'spain': 'ES', 'es': 'ES',
  'estados unidos': 'US', 'usa': 'US', 'us': 'US',
  'venezuela': 'VE', 've': 'VE',
  'ecuador': 'EC', 'ec': 'EC',
  'bolivia': 'BO', 'bo': 'BO',
  'paraguay': 'PY', 'py': 'PY',
  'uruguay': 'UY', 'uy': 'UY',
  'panama': 'PA', 'panamá': 'PA', 'pa': 'PA',
  'costa rica': 'CR', 'cr': 'CR',
  'guatemala': 'GT', 'gt': 'GT',
  'honduras': 'HN', 'hn': 'HN',
  'el salvador': 'SV', 'sv': 'SV',
  'nicaragua': 'NI', 'ni': 'NI',
  'republica dominicana': 'DO', 'república dominicana': 'DO', 'do': 'DO',
};

function parseCountryCodes(location: string): string[] {
  if (!location) return ['MX'];
  const parts = location.split(/[,;/]+/).map(s => s.trim().toLowerCase());
  const codes: string[] = [];
  for (const part of parts) {
    const code = COUNTRY_CODES[part];
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes.length > 0 ? codes : ['MX'];
}

function mapOptGoal(obj: string): string {
  const map: Record<string, string> = {
    'Reconocimiento': 'REACH',
    'Awareness': 'REACH',
    'Tráfico': 'LINK_CLICKS',
    'Trafico': 'LINK_CLICKS',
    'Interacción': 'POST_ENGAGEMENT',
    'Engagement': 'POST_ENGAGEMENT',
    'Clientes potenciales': 'LEAD_GENERATION',
    'Leads': 'LEAD_GENERATION',
    'Ventas': 'OFFSITE_CONVERSIONS',
    'Conversiones': 'OFFSITE_CONVERSIONS',
  };
  return map[obj] ?? 'LINK_CLICKS';
}

function mapCTA(cta: string): string {
  const map: Record<string, string> = {
    'Más información': 'LEARN_MORE',
    'Comprar': 'SHOP_NOW',
    'Registrarte': 'SIGN_UP',
    'Contactar': 'CONTACT_US',
    'Reservar': 'BOOK_NOW',
    'Obtener oferta': 'GET_OFFER',
    'Descargar': 'DOWNLOAD',
    'Solicitar': 'APPLY_NOW',
    'LEARN_MORE': 'LEARN_MORE',
    'SHOP_NOW': 'SHOP_NOW',
    'SIGN_UP': 'SIGN_UP',
    'CONTACT_US': 'CONTACT_US',
    'BOOK_NOW': 'BOOK_NOW',
    'GET_OFFER': 'GET_OFFER',
    'DOWNLOAD': 'DOWNLOAD',
    'APPLY_NOW': 'APPLY_NOW',
  };
  return map[cta] ?? 'LEARN_MORE';
}

export async function POST(req: Request) {
  let body: { action: string; payload: Record<string, unknown>; client_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, payload, client_id } = body;

  // Resolve credentials: prefer client's own token, fall back to system user
  let META_ACCESS_TOKEN = META_SYSTEM_TOKEN;
  let META_AD_ACCOUNT_ID = META_SYSTEM_ACCT;
  let DEFAULT_PAGE_ID = META_SYSTEM_PAGE;

  if (client_id) {
    const { data: client } = await adminSupabase
      .from('clients')
      .select('meta_access_token, meta_ad_account_id, meta_page_id, meta_connected')
      .eq('id', client_id)
      .single();
    if (client?.meta_connected && client.meta_access_token) {
      META_ACCESS_TOKEN  = client.meta_access_token as string;
      META_AD_ACCOUNT_ID = (client.meta_ad_account_id as string) || META_SYSTEM_ACCT;
      DEFAULT_PAGE_ID    = (client.meta_page_id as string) || META_SYSTEM_PAGE;
    }
  }

  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    return NextResponse.json(
      { error: 'Meta API no configurada. Agrega META_SYSTEM_USER_TOKEN y META_AD_ACCOUNT_ID a las variables de entorno, o conecta la cuenta Meta del cliente.' },
      { status: 500 }
    );
  }

  try {
    if (action === 'create_campaign') {
      const campRes = await fetch(`${META_BASE}/act_${META_AD_ACCOUNT_ID}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.campaign_name,
          objective: mapObjective(payload.objective as string),
          status: 'PAUSED',
          special_ad_categories: [],
          is_adset_budget_sharing_enabled: false,
          access_token: META_ACCESS_TOKEN,
        }),
      });
      const camp = await campRes.json() as { id?: string; error?: { message: string; error_user_msg?: string } };
      if (camp.error) throw new Error(camp.error.error_user_msg || camp.error.message || JSON.stringify(camp.error));

      // Budget: Diario uses amount directly, Mensual divides by 30
      let dailyBudgetCents: number;
      if (payload.budget_type === 'Diario') {
        dailyBudgetCents = Math.max(Math.round(Number(payload.budget_monthly ?? 600) * 100), 2000);
      } else {
        dailyBudgetCents = Math.max(Math.round(Number(payload.budget_monthly ?? 600) / 30) * 100, 2000);
      }

      // Targeting
      const targeting: Record<string, unknown> = {
        geo_locations: { countries: parseCountryCodes((payload.location as string) ?? '') },
        age_min: (payload.age_min as number) || 25,
        age_max: (payload.age_max as number) || 55,
      };
      if (payload.gender === 'Hombres') targeting.genders = [1];
      else if (payload.gender === 'Mujeres') targeting.genders = [2];

      const adsetBody: Record<string, unknown> = {
        name: `${payload.campaign_name} - Ad Set`,
        campaign_id: camp.id,
        daily_budget: dailyBudgetCents,
        billing_event: 'IMPRESSIONS',
        optimization_goal: mapOptGoal(payload.objective as string),
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting,
        start_time: new Date().toISOString(),
        status: 'PAUSED',
        access_token: META_ACCESS_TOKEN,
      };

      const adsetRes = await fetch(`${META_BASE}/act_${META_AD_ACCOUNT_ID}/adsets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adsetBody),
      });
      const adset = await adsetRes.json() as { id?: string; error?: { message: string; error_user_msg?: string } };
      if (adset.error) throw new Error(adset.error.error_user_msg || adset.error.message || JSON.stringify(adset.error));

      return NextResponse.json({
        success: true,
        campaign_id: camp.id,
        adset_id: adset.id,
        message: `Campaña creada en Meta Ads (pausada). ID: ${camp.id}.`,
      });
    }

    if (action === 'create_ad_with_creative') {
      const { adset_id, campaign_name, image_url, headline, primary_text, description, cta, website_url } = payload as {
        adset_id: string; campaign_name: string; image_url: string;
        headline?: string; primary_text?: string; description?: string;
        cta?: string; website_url?: string;
      };

      const PAGE_ID = DEFAULT_PAGE_ID;
      const linkUrl = (website_url as string) || 'https://xenttech.com';

      // Step 1: Upload PNG image via URL
      const imgParams = new URLSearchParams();
      imgParams.append('url', image_url);
      imgParams.append('access_token', META_ACCESS_TOKEN!);

      const imgRes = await fetch(`${META_BASE}/act_${META_AD_ACCOUNT_ID}/adimages`, {
        method: 'POST',
        body: imgParams,
      });
      const imgData = await imgRes.json() as { images?: Record<string, { hash: string }>; error?: { message: string } };
      console.log('[meta-ads] image upload:', JSON.stringify(imgData));

      if (imgData.error) {
        return NextResponse.json(
          { error: 'Image upload failed: ' + (imgData.error.message || JSON.stringify(imgData.error)) },
          { status: 500 }
        );
      }

      const imageHash = imgData.images ? Object.values(imgData.images)[0]?.hash : null;
      if (!imageHash) {
        return NextResponse.json({ error: 'No image hash returned from Meta', details: imgData }, { status: 500 });
      }

      // Step 2: Create ad creative
      const creativeBody = {
        name: `${campaign_name} - Creative`,
        object_story_spec: {
          page_id: PAGE_ID,
          link_data: {
            image_hash: imageHash,
            link: linkUrl,
            message: (primary_text as string) || '',
            name: (headline as string) || (campaign_name as string),
            description: (description as string) || '',
            call_to_action: {
              type: mapCTA((cta as string) || 'LEARN_MORE'),
              value: { link: linkUrl },
            },
          },
        },
        access_token: META_ACCESS_TOKEN,
      };

      const creativeRes = await fetch(`${META_BASE}/act_${META_AD_ACCOUNT_ID}/adcreatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creativeBody),
      });
      const creative = await creativeRes.json() as { id?: string; error?: { message: string; error_user_msg?: string } };
      console.log('[meta-ads] creative:', JSON.stringify(creative));

      if (creative.error) {
        return NextResponse.json(
          { error: 'Creative failed: ' + (creative.error.error_user_msg || creative.error.message) },
          { status: 500 }
        );
      }

      // Step 3: Create the ad
      const adRes = await fetch(`${META_BASE}/act_${META_AD_ACCOUNT_ID}/ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${campaign_name} - Ad`,
          adset_id,
          creative: { creative_id: creative.id },
          status: 'PAUSED',
          access_token: META_ACCESS_TOKEN,
        }),
      });
      const ad = await adRes.json() as { id?: string; error?: { message: string; error_user_msg?: string } };
      console.log('[meta-ads] ad:', JSON.stringify(ad));

      if (ad.error) {
        return NextResponse.json(
          { error: 'Ad creation failed: ' + (ad.error.error_user_msg || ad.error.message) },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        image_hash: imageHash,
        creative_id: creative.id,
        ad_id: ad.id,
        message: 'Anuncio creado (Campaign + AdSet + Creative + Ad). Todo pausado.',
      });
    }

    if (action === 'upload_creative') {
      const imgRes = await fetch(`${META_BASE}/act_${META_AD_ACCOUNT_ID}/adimages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: payload.image_url, access_token: META_ACCESS_TOKEN }),
      });
      const img = await imgRes.json();
      return NextResponse.json({ success: true, image: img });
    }

    if (action === 'get_stats') {
      const { campaign_id, date_preset } = payload as { campaign_id: string; date_preset?: string };
      const statsRes = await fetch(
        `${META_BASE}/${campaign_id}/insights?` +
        `fields=impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type,conversions,cost_per_conversion` +
        `&date_preset=${date_preset ?? 'last_30d'}` +
        `&access_token=${META_ACCESS_TOKEN}`
      );
      const stats = await statsRes.json() as { data?: Record<string, unknown>[]; error?: { message: string } };
      if (stats.error) throw new Error(stats.error.message);
      const parsed = (stats.data ?? []).map(s => ({ ...s, ...parseMetaActions(s) }));
      return NextResponse.json({ success: true, stats: parsed });
    }

    if (action === 'toggle_campaign') {
      const { campaign_id, adset_id, ad_id, status } = payload as {
        campaign_id: string; adset_id?: string; ad_id?: string; status: string;
      };

      const campRes = await fetch(`${META_BASE}/${campaign_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, access_token: META_ACCESS_TOKEN }),
      });
      const camp = await campRes.json() as { success?: boolean; error?: { message: string; error_user_msg?: string } };
      if (camp.error) throw new Error(camp.error.error_user_msg || camp.error.message || JSON.stringify(camp.error));

      if (adset_id) {
        await fetch(`${META_BASE}/${adset_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, access_token: META_ACCESS_TOKEN }),
        });
      }

      if (ad_id) {
        await fetch(`${META_BASE}/${ad_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, access_token: META_ACCESS_TOKEN }),
        });
      }

      return NextResponse.json({ success: true, status });
    }

    if (action === 'list_accounts') {
      if (!META_ACCESS_TOKEN) {
        return NextResponse.json({ error: 'Client Meta not connected' }, { status: 400 });
      }
      const [adAccRes, pagesRes] = await Promise.all([
        fetch(`${META_BASE}/me/adaccounts?fields=id,name,account_id,currency,business_name,account_status&limit=50&access_token=${META_ACCESS_TOKEN}`),
        fetch(`${META_BASE}/me/accounts?fields=id,name,category&limit=50&access_token=${META_ACCESS_TOKEN}`),
      ]);
      const [adAccData, pagesData] = await Promise.all([adAccRes.json(), pagesRes.json()]) as [
        { data?: Record<string, unknown>[]; error?: { message: string } },
        { data?: Record<string, unknown>[] },
      ];
      if (adAccData.error) throw new Error(adAccData.error.message);
      return NextResponse.json({
        ad_accounts: adAccData.data ?? [],
        pages: pagesData.data ?? [],
      });
    }

    if (action === 'sync_all_campaigns') {
      if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
        return NextResponse.json({ error: 'Client Meta not connected' }, { status: 400 });
      }

      // Delete broken previously-synced campaigns (null meta_campaign_id = wasn't saved properly)
      await adminSupabase.from('campaigns')
        .delete()
        .eq('client_id', client_id ?? '')
        .eq('platform', 'Meta Ads')
        .is('meta_campaign_id', null);

      // Paginate through ALL campaigns
      type MetaCampaign = Record<string, unknown>;
      let allCampaigns: MetaCampaign[] = [];
      let nextUrl: string | null =
        `${META_BASE}/act_${META_AD_ACCOUNT_ID}/campaigns?` +
        `fields=id,name,objective,status,daily_budget,lifetime_budget,created_time,start_time,stop_time` +
        `&limit=100&access_token=${META_ACCESS_TOKEN}`;

      while (nextUrl) {
        const pageRes = await fetch(nextUrl);
        const pageData = await pageRes.json() as {
          data?: MetaCampaign[];
          paging?: { next?: string };
          error?: { message: string };
        };
        if (pageData.error) throw new Error(pageData.error.message);
        allCampaigns = [...allCampaigns, ...(pageData.data ?? [])];
        nextUrl = pageData.paging?.next ?? null;
      }

      // Fetch all local campaigns for this client (with meta_campaign_id top-level column)
      const { data: localCamps } = await adminSupabase
        .from('campaigns')
        .select('id,metrics,status,campaign_name,meta_campaign_id')
        .eq('client_id', client_id ?? '');
      const local = localCamps ?? [];

      let synced = 0;
      for (const mc of allCampaigns) {
        const mcId = String(mc.id);
        console.log('[sync_all_campaigns] campaign:', mcId, mc.name, '→ client:', client_id);

        // Match by top-level column OR metrics JSONB (handles both old and new records)
        const existing = local.find(c => {
          const topLevel = (c as Record<string, unknown>).meta_campaign_id;
          const inMetrics = ((c.metrics ?? {}) as Record<string, unknown>).meta_campaign_id;
          return topLevel === mcId || inMetrics === mcId;
        });

        // Fetch insights + adset + ads in parallel
        let stats: Record<string, unknown> | null = null;
        let adsetId: string | null = null;
        let adsetDailyBudget: number | null = null;
        let adCount = 0;
        let activeAds = 0;
        try {
          const [insRes, asRes, adsRes] = await Promise.all([
            fetch(`${META_BASE}/${mcId}/insights?fields=impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type&date_preset=maximum&access_token=${META_ACCESS_TOKEN}`),
            fetch(`${META_BASE}/${mcId}/adsets?fields=id,daily_budget,status&limit=1&access_token=${META_ACCESS_TOKEN}`),
            fetch(`${META_BASE}/${mcId}/ads?fields=id,name,status&limit=100&access_token=${META_ACCESS_TOKEN}`),
          ]);
          const insData = await insRes.json() as { data?: Record<string, unknown>[] };
          const rawStats = insData.data?.[0] ?? null;
          if (rawStats) {
            stats = { ...rawStats, ...parseMetaActions(rawStats) };
          }
          const asData = await asRes.json() as { data?: { id: string; daily_budget?: string }[] };
          adsetId = asData.data?.[0]?.id ?? null;
          adsetDailyBudget = asData.data?.[0]?.daily_budget
            ? Math.round(parseInt(asData.data[0].daily_budget!) / 100)
            : null;
          const adsData = await adsRes.json() as { data?: { id: string; status: string }[] };
          adCount   = adsData.data?.length ?? 0;
          activeAds = (adsData.data ?? []).filter(a => a.status === 'ACTIVE').length;
        } catch { /* non-fatal */ }

        // FIX 4: Budget calculation with adset fallback
        const dailyBudgetCents = mc.daily_budget
          ? parseInt(mc.daily_budget as string)
          : adsetDailyBudget ? adsetDailyBudget * 100 : 0;
        const lifetimeBudgetVal = mc.lifetime_budget ? parseInt(mc.lifetime_budget as string) / 100 : null;
        const monthlyBudget = dailyBudgetCents > 0
          ? Math.round(dailyBudgetCents / 100 * 30)
          : lifetimeBudgetVal
            ? Math.round(lifetimeBudgetVal)
            : 0;

        const normStatus = (mc.status as string)?.toUpperCase() === 'ACTIVE' ? 'active' : 'paused';
        const metricsPayload = {
          meta_campaign_id: mcId,
          meta_adset_id:    adsetId,
          meta_status:      mc.status,
          created_time:     mc.created_time,
          start_time:       mc.start_time,
          budget_daily:     dailyBudgetCents > 0 ? Math.round(dailyBudgetCents / 100) : null,
          budget_weekly:    dailyBudgetCents > 0 ? Math.round(dailyBudgetCents / 100 * 7) : null,
          budget_monthly:   monthlyBudget,
          budget_yearly:    monthlyBudget * 12,
          budget_lifetime:  lifetimeBudgetVal,
          ad_count:         adCount,
          active_ads:       activeAds,
          ...(stats ? { last_stats: stats, stats_updated_at: new Date().toISOString() } : {}),
        };

        if (!existing) {
          const { error: insErr } = await adminSupabase.from('campaigns').insert({
            client_id,
            meta_campaign_id: mcId,
            campaign_name:    mc.name as string,
            platform:         'Meta Ads',
            objective:        (mc.objective as string) || '',
            status:           normStatus,
            budget_monthly:   monthlyBudget,
            metrics:          metricsPayload,
          });
          if (insErr) console.error('[sync_all_campaigns] insert error:', insErr.message, 'campaign:', mcId);
        } else {
          const existingMetrics = (existing.metrics ?? {}) as Record<string, unknown>;
          await adminSupabase.from('campaigns').update({
            meta_campaign_id: mcId,
            campaign_name:    mc.name as string,
            status:           normStatus,
            budget_monthly:   monthlyBudget || undefined,
            metrics: { ...existingMetrics, ...metricsPayload },
          }).eq('id', existing.id);
        }
        synced++;
      }

      return NextResponse.json({
        success: true,
        synced,
        total_in_meta: allCampaigns.length,
        account_id: META_AD_ACCOUNT_ID,
        message: `${synced} campañas sincronizadas de Meta Ads`,
      });
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
