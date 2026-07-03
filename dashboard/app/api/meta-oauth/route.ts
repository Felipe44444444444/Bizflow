import { NextResponse } from 'next/server';

const META_APP_ID = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.conectaachat.com';
const REDIRECT_URI = `${APP_URL}/api/meta-oauth/callback`;

const SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
].join(',');

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id');

  if (!clientId) {
    return NextResponse.json({ error: 'client_id required' }, { status: 400 });
  }

  if (!META_APP_ID) {
    return NextResponse.json(
      { error: 'META_APP_ID / FACEBOOK_APP_ID no configurado en Vercel env vars' },
      { status: 500 }
    );
  }

  const authUrl =
    `https://www.facebook.com/v22.0/dialog/oauth?` +
    `client_id=${META_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${SCOPES}` +
    `&state=${encodeURIComponent(clientId)}` +
    `&response_type=code`;

  return NextResponse.redirect(authUrl);
}
