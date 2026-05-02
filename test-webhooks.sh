#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# test-webhooks.sh — Conectachat webhook end-to-end test suite
#
# Tests each webhook endpoint with a properly signed payload.
# Requires: curl, openssl
#
# Usage:
#   chmod +x test-webhooks.sh
#   ./test-webhooks.sh
#
# Set env vars before running (or edit the defaults below):
#   INSTAGRAM_APP_SECRET  — IG Business Login app secret
#   META_APP_SECRET       — Facebook/WA app secret
#   API_BASE              — backend base URL
# ─────────────────────────────────────────────────────────────

set -euo pipefail

API_BASE="${API_BASE:-https://api.conectaachat.com}"
IG_SECRET="${INSTAGRAM_APP_SECRET:-74761c47fdef52fa4f1f598aca6a551a}"
META_SECRET="${META_APP_SECRET:-}"

# Real ig_account_id of @xenttech888 — used to test DB lookup
REAL_IG_ACCOUNT_ID="26966200843018164"

GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m"

pass() { echo -e "${GREEN}✅ PASS${NC} $1"; }
fail() { echo -e "${RED}❌ FAIL${NC} $1"; }
info() { echo -e "${YELLOW}ℹ️  ${NC} $1"; }

sign() {
  # sign_body SECRET PAYLOAD → prints sha256=... header value
  local secret="$1" payload="$2"
  echo -n "$payload" | openssl dgst -sha256 -hmac "$secret" | awk '{print "sha256="$2}'
}

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Conectachat Webhook Test Suite"
echo "  Target: $API_BASE"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── HEALTH CHECK ────────────────────────────────────────────
echo "── Health check"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/health")
if [ "$STATUS" = "200" ]; then
  pass "GET /health → $STATUS"
else
  fail "GET /health → $STATUS (server down?)"
  exit 1
fi

# ─── INSTAGRAM WEBHOOK GET (verify) ──────────────────────────
echo ""
echo "── Instagram webhook GET verification"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API_BASE/api/integrations/instagram/webhook?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=TEST")
if [ "$STATUS" = "403" ]; then
  pass "GET /instagram/webhook?wrong_token → 403 (rejects bad token)"
else
  fail "GET /instagram/webhook → $STATUS (expected 403)"
fi

# ─── INSTAGRAM WEBHOOK POST (unsigned) ───────────────────────
echo ""
echo "── Instagram webhook POST — reject unsigned request"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"object":"instagram","entry":[]}' \
  "$API_BASE/api/integrations/instagram/webhook")
if [ "$STATUS" = "401" ]; then
  pass "POST /instagram/webhook (no sig) → 401"
else
  fail "POST /instagram/webhook (no sig) → $STATUS (expected 401)"
fi

# ─── INSTAGRAM WEBHOOK POST (signed, full pipeline) ──────────
echo ""
echo "── Instagram webhook POST — signed, real ig_account_id (full pipeline test)"
TS=$(date +%s)
MID="test_mid_$(date +%s)_$$"
IG_PAYLOAD="{\"object\":\"instagram\",\"entry\":[{\"id\":\"$REAL_IG_ACCOUNT_ID\",\"time\":$TS,\"messaging\":[{\"sender\":{\"id\":\"6740958319284625\"},\"recipient\":{\"id\":\"$REAL_IG_ACCOUNT_ID\"},\"timestamp\":$TS,\"message\":{\"mid\":\"$MID\",\"text\":\"Test webhook $(date)\"}}]}]}"
IG_SIG=$(sign "$IG_SECRET" "$IG_PAYLOAD")

RESPONSE=$(curl -s -w "\nHTTP:%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: $IG_SIG" \
  -d "$IG_PAYLOAD" \
  "$API_BASE/api/integrations/instagram/webhook")

HTTP_CODE=$(echo "$RESPONSE" | tail -1 | sed 's/HTTP://')
if [ "$HTTP_CODE" = "200" ]; then
  pass "POST /instagram/webhook (signed) → 200 — pipeline triggered"
  info "Check Railway logs for: [IG Webhook] object=instagram"
  info "Expect: RAG lookup + Claude response + sendMetaMessenger call"
else
  fail "POST /instagram/webhook (signed) → $HTTP_CODE"
  echo "$RESPONSE"
fi

# ─── WHATSAPP WEBHOOK GET (verify) ───────────────────────────
echo ""
echo "── WhatsApp webhook GET verification"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API_BASE/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=TEST")
if [ "$STATUS" = "403" ]; then
  pass "GET /whatsapp/webhook?wrong_token → 403"
else
  fail "GET /whatsapp/webhook → $STATUS (expected 403)"
fi

# ─── WHATSAPP WEBHOOK POST (unsigned) ────────────────────────
echo ""
echo "── WhatsApp webhook POST — reject unsigned request"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"object":"whatsapp_business_account","entry":[]}' \
  "$API_BASE/api/integrations/whatsapp/webhook")
if [ "$STATUS" = "401" ]; then
  pass "POST /whatsapp/webhook (no sig) → 401"
else
  fail "POST /whatsapp/webhook (no sig) → $STATUS (expected 401)"
fi

# ─── WHATSAPP WEBHOOK POST (signed) ──────────────────────────
if [ -n "$META_SECRET" ]; then
  echo ""
  echo "── WhatsApp webhook POST — signed (pipeline test)"
  WA_MID="wamid_test_$(date +%s)_$$"
  WA_PAYLOAD="{\"object\":\"whatsapp_business_account\",\"entry\":[{\"id\":\"TEST_WABA\",\"changes\":[{\"value\":{\"messaging_product\":\"whatsapp\",\"metadata\":{\"display_phone_number\":\"5215500000000\",\"phone_number_id\":\"TEST_PHONE_ID\"},\"messages\":[{\"from\":\"5215500000001\",\"id\":\"$WA_MID\",\"timestamp\":\"$(date +%s)\",\"text\":{\"body\":\"Test WA $(date)\"},\"type\":\"text\"}]},\"field\":\"messages\"}]}]}"
  WA_SIG=$(sign "$META_SECRET" "$WA_PAYLOAD")

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "x-hub-signature-256: $WA_SIG" \
    -d "$WA_PAYLOAD" \
    "$API_BASE/api/integrations/whatsapp/webhook")

  if [ "$HTTP_CODE" = "200" ]; then
    pass "POST /whatsapp/webhook (signed) → 200"
  else
    fail "POST /whatsapp/webhook (signed) → $HTTP_CODE"
  fi
else
  info "Skipping signed WA test — set META_APP_SECRET env var to enable"
fi

# ─── FACEBOOK WEBHOOK GET (verify) ───────────────────────────
echo ""
echo "── Facebook webhook GET verification"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API_BASE/api/integrations/facebook/webhook?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=TEST")
if [ "$STATUS" = "403" ]; then
  pass "GET /facebook/webhook?wrong_token → 403"
else
  fail "GET /facebook/webhook → $STATUS (expected 403)"
fi

# ─── DATA DELETION ENDPOINT ──────────────────────────────────
echo ""
echo "── Meta data deletion endpoint"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "signed_request=BAD_REQUEST" \
  "$API_BASE/api/integrations/meta/data-deletion")
if [ "$STATUS" = "403" ] || [ "$STATUS" = "400" ] || [ "$STATUS" = "500" ]; then
  pass "POST /meta/data-deletion (bad payload) → $STATUS (endpoint exists)"
else
  fail "POST /meta/data-deletion → $STATUS (unexpected)"
fi

# ─── SUMMARY ─────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Done. Run immediately after: railway logs --tail 30"
echo "  to see the async pipeline processing logs."
echo ""
echo "  For a real sender ID test (replace TEST_SENDER):"
echo "  The 400 error on sendMetaMessenger is expected when"
echo "  using a fake sender ID — that proves the pipeline ran."
echo "═══════════════════════════════════════════════════════"
