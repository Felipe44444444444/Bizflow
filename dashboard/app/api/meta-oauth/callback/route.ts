import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const META_APP_ID     = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL || 'https://app.conectaachat.com';
const REDIRECT_URI    = `${APP_URL}/api/meta-oauth/callback`;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code     = searchParams.get('code');
  const clientId = searchParams.get('state');
  const error    = searchParams.get('error');

  const failUrl = (msg: string) =>
    `${APP_URL}/agency/clients?meta_error=${encodeURIComponent(msg)}`;

  if (error) return NextResponse.redirect(failUrl(error));
  if (!code || !clientId) return NextResponse.redirect(failUrl('missing_code'));

  try {
    // Exchange code → short-lived token
    const shortRes = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?` +
      `client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&client_secret=${META_APP_SECRET}&code=${code}`
    );
    const shortData = await shortRes.json() as { access_token?: string; error?: { message: string } };
    if (shortData.error) throw new Error(shortData.error.message);

    // Exchange → long-lived token (60 days)
    const longRes = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?` +
      `grant_type=fb_exchange_token&client_id=${META_APP_ID}` +
      `&client_secret=${META_APP_SECRET}&fb_exchange_token=${shortData.access_token}`
    );
    const longData = await longRes.json() as { access_token?: string; expires_in?: number; error?: { message: string } };
    const accessToken = longData.access_token || shortData.access_token!;
    const expiresIn   = longData.expires_in || 5184000; // 60 days

    // Fetch user info, ad accounts, and pages in parallel
    const [userRes, adAccountsRes, pagesRes] = await Promise.all([
      fetch(`https://graph.facebook.com/v22.0/me?fields=id,name&access_token=${accessToken}`),
      fetch(`https://graph.facebook.com/v22.0/me/adaccounts?fields=id,name,account_id,currency,business_name&limit=50&access_token=${accessToken}`),
      fetch(`https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token&limit=50&access_token=${accessToken}`),
    ]);
    const [userData, adAccountsData, pagesData] = await Promise.all([
      userRes.json() as Promise<{ id: string; name: string }>,
      adAccountsRes.json() as Promise<{ data?: { id: string; name: string; account_id: string; currency: string; business_name?: string }[] }>,
      pagesRes.json() as Promise<{ data?: { id: string; name: string; access_token: string }[] }>,
    ]);

    const adAccounts = adAccountsData.data ?? [];
    const pages      = pagesData.data ?? [];
    const adAccount  = adAccounts[0];
    const page       = pages[0];

    // Persist to client record
    await supabase.from('clients').update({
      meta_access_token:    accessToken,
      meta_ad_account_id:   adAccount?.account_id ?? null,
      meta_page_id:         page?.id ?? null,
      meta_user_id:         userData.id,
      meta_connected:       true,
      meta_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    }).eq('id', clientId);

    await supabase.from('activity_log').insert({
      client_id: clientId,
      action:    'Meta Ads conectado',
      details:   `Usuario: ${userData.name} · Cuenta: ${adAccount?.name ?? 'N/A'} · Página: ${page?.name ?? 'N/A'}`,
    });

    // Redirect with success data (for account picker if multiple accounts)
    const redirectUrl = new URL(`${APP_URL}/agency/clients`);
    redirectUrl.searchParams.set('meta_success', 'true');
    redirectUrl.searchParams.set('client_id', clientId);
    redirectUrl.searchParams.set('meta_user', userData.name);
    if (adAccounts.length > 0)
      redirectUrl.searchParams.set('ad_accounts', JSON.stringify(adAccounts));
    if (pages.length > 0)
      redirectUrl.searchParams.set('pages', JSON.stringify(pages));

    return NextResponse.redirect(redirectUrl.toString());
  } catch (e: unknown) {
    return NextResponse.redirect(failUrl((e as Error).message ?? 'unknown'));
  }
}
