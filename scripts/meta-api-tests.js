#!/usr/bin/env node
/**
 * Meta API permission test script.
 * Usage: node scripts/meta-api-tests.js
 *
 * Required env vars (copy from .env or set inline):
 *   META_USER_TOKEN      — user access token with all requested permissions
 *   META_PAGE_TOKEN      — page access token
 *   META_WA_TOKEN        — WhatsApp Cloud API token (can equal META_PAGE_TOKEN)
 *   META_PHONE_NUMBER_ID — WhatsApp phone number ID
 *   META_IG_ACCOUNT_ID   — Instagram Business Account ID
 *   META_AD_ACCOUNT_ID   — Ad account ID (digits only, no "act_" prefix)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const USER_TOKEN        = process.env.META_USER_TOKEN        || process.env.FACEBOOK_USER_TOKEN   || '';
const PAGE_TOKEN        = process.env.META_PAGE_TOKEN        || process.env.FACEBOOK_PAGE_TOKEN   || '';
// WA token: if WHATSAPP_PHONE_NUMBER_ID looks like an access token (EAA...) use it as token
const _waPhoneRaw       = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WA_TOKEN          = process.env.META_WA_TOKEN          ||
                          (_waPhoneRaw.startsWith('EAA') ? _waPhoneRaw : '') ||
                          process.env.WHATSAPP_API_TOKEN    || '';
const PHONE_NUMBER_ID   = process.env.META_PHONE_NUMBER_ID   ||
                          (_waPhoneRaw.startsWith('EAA') ? '' : _waPhoneRaw) || '';
const IG_ACCOUNT_ID     = process.env.META_IG_ACCOUNT_ID     || process.env.INSTAGRAM_ACCOUNT_ID  || '';
const AD_ACCOUNT_ID     = process.env.META_AD_ACCOUNT_ID     || process.env.FACEBOOK_AD_ACCOUNT   || '';

const BASE = 'https://graph.facebook.com/v19.0';
const DELAY_MS = 1100; // >1 s between calls to stay inside rate limits

let passed = 0;
let failed = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function call(label, url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch {}

    if (!res.ok) {
      console.error(`  ✗ ${label} — HTTP ${res.status}: ${json?.error?.message || text.slice(0, 120)}`);
      failed++;
      return null;
    }
    console.log(`  ✓ ${label}`);
    passed++;
    return json;
  } catch (err) {
    console.error(`  ✗ ${label} — ${err.message}`);
    failed++;
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function testPublicProfile() {
  console.log('\n[1] public_profile');
  if (!USER_TOKEN) { console.log('  ⚠  META_USER_TOKEN not set — skip'); return; }
  await call(
    'GET /me?fields=id,name',
    `${BASE}/me?fields=id,name&access_token=${USER_TOKEN}`
  );
}

async function testPagesShowList() {
  console.log('\n[2] pages_show_list — 100 calls (1 s apart)');
  // /me/accounts requires a USER access token, not a page token
  const token = USER_TOKEN || PAGE_TOKEN;
  if (!token) { console.log('  ⚠  META_USER_TOKEN not set — skip'); return; }
  const url = `${BASE}/me/accounts?access_token=${token}`;
  for (let i = 1; i <= 100; i++) {
    process.stdout.write(`\r  Progress: ${i}/100`);
    await call(`GET /me/accounts #${i}`, url);
    if (i < 100) await sleep(DELAY_MS);
  }
  process.stdout.write('\n');
}

async function testAdsRead() {
  console.log('\n[3] ads_read');
  if (!USER_TOKEN || !AD_ACCOUNT_ID) {
    console.log('  ⚠  META_USER_TOKEN or META_AD_ACCOUNT_ID not set — skip');
    return;
  }
  await call(
    `GET /act_${AD_ACCOUNT_ID}/campaigns`,
    `${BASE}/act_${AD_ACCOUNT_ID}/campaigns?fields=id,name,status&access_token=${USER_TOKEN}`
  );
  await call(
    `GET /act_${AD_ACCOUNT_ID}/adsets`,
    `${BASE}/act_${AD_ACCOUNT_ID}/adsets?fields=id,name,status&limit=10&access_token=${USER_TOKEN}`
  );
}

async function testAdsManagement() {
  console.log('\n[4] ads_management — create + delete draft campaign');
  if (!USER_TOKEN || !AD_ACCOUNT_ID) {
    console.log('  ⚠  META_USER_TOKEN or META_AD_ACCOUNT_ID not set — skip');
    return;
  }

  const createRes = await call(
    `POST /act_${AD_ACCOUNT_ID}/campaigns (draft)`,
    `${BASE}/act_${AD_ACCOUNT_ID}/campaigns`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:             'Conectachat API Test — DELETE ME',
        objective:        'OUTCOME_AWARENESS',
        status:           'PAUSED',
        special_ad_categories: [],
        access_token:     USER_TOKEN,
      }),
    }
  );

  if (createRes?.id) {
    await sleep(DELAY_MS);
    await call(
      `DELETE /campaign ${createRes.id}`,
      `${BASE}/${createRes.id}?access_token=${USER_TOKEN}`,
      { method: 'DELETE' }
    );
  }
}

async function testInstagramMessages() {
  console.log('\n[5] instagram_manage_messages');
  if (!PAGE_TOKEN || !IG_ACCOUNT_ID) {
    console.log('  ⚠  META_PAGE_TOKEN or META_IG_ACCOUNT_ID not set — skip');
    return;
  }
  const igToken = PAGE_TOKEN || USER_TOKEN;
  await call(
    `GET /${IG_ACCOUNT_ID}/conversations`,
    `${BASE}/${IG_ACCOUNT_ID}/conversations?platform=instagram&access_token=${igToken}`
  );
  await sleep(DELAY_MS);
  // Get conversation list and fetch messages from the first one
  const convRes = await fetch(
    `${BASE}/${IG_ACCOUNT_ID}/conversations?platform=instagram&fields=id&limit=1&access_token=${igToken}`
  ).then(r => r.json()).catch(() => null);
  const firstConvId = convRes?.data?.[0]?.id;
  if (firstConvId) {
    await call(
      `GET /conversations/${firstConvId}/messages`,
      `${BASE}/${firstConvId}/messages?fields=id,message,created_time&access_token=${igToken}`
    );
    await sleep(DELAY_MS);
  }
  await call(
    `GET /${IG_ACCOUNT_ID}/subscribed_apps`,
    `${BASE}/${IG_ACCOUNT_ID}/subscribed_apps?access_token=${igToken}`
  );
}

async function testWhatsApp() {
  console.log('\n[6] whatsapp_business_messaging');
  if (!WA_TOKEN) {
    console.log('  ⚠  No WhatsApp token available — skip');
    return;
  }
  // List WhatsApp Business Accounts (works with any valid token)
  await call(
    'GET /me/whatsapp_business_accounts',
    `${BASE}/me/whatsapp_business_accounts?access_token=${WA_TOKEN}`
  );
  await sleep(DELAY_MS);
  if (PHONE_NUMBER_ID) {
    await call(
      `GET /${PHONE_NUMBER_ID} (phone number details)`,
      `${BASE}/${PHONE_NUMBER_ID}?fields=id,verified_name,display_phone_number,status&access_token=${WA_TOKEN}`
    );
  } else {
    console.log('  ⚠  META_PHONE_NUMBER_ID not set — skipping phone details call');
    console.log('     (Provide the numeric Phone Number ID from WhatsApp > API Setup)');
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════');
  console.log('  Conectachat — Meta API Permission Tests');
  console.log('════════════════════════════════════════════');

  await testPublicProfile();
  await testPagesShowList();
  await testAdsRead();
  await testAdsManagement();
  await testInstagramMessages();
  await testWhatsApp();

  console.log('\n════════════════════════════════════════════');
  console.log(`  Resultado: ${passed} pasadas, ${failed} fallidas`);
  console.log('════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
