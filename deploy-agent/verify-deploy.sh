#!/bin/bash
set -e

LOCAL_FILE="$1"
REMOTE_PATH="$2"
LIVE_URL="$3"
SSH_USER="u230238236"
SSH_HOST="217.21.77.209"
SSH_PORT="65002"
SSH_PASS="Feliponchas47@"
SERVER_ROOT="/home/u230238236/domains/xenttech.com"
MAX_RETRIES=3
RETRY_DELAY=5

if [ -z "$LOCAL_FILE" ] || [ -z "$REMOTE_PATH" ] || [ -z "$LIVE_URL" ]; then
  echo "Usage: ./verify-deploy.sh <local_file> <remote_path> <live_url>"
  exit 1
fi

echo "=== XENTTECH Deploy Agent ==="
echo "Local: $LOCAL_FILE"
echo "Remote: $REMOTE_PATH"
echo "Live: $LIVE_URL"
echo ""

local_title=$(grep -o '<title>[^<]*</title>' "$LOCAL_FILE" | head -1)
local_hash=$(md5 -q "$LOCAL_FILE" 2>/dev/null || md5sum "$LOCAL_FILE" | cut -d' ' -f1)

echo "Local title: $local_title"
echo "Local file hash: $local_hash"
echo ""

echo "[1/3] Uploading via SCP..."
SERVER_FILE="$SERVER_ROOT/$REMOTE_PATH"
SSHPASS="$SSH_PASS" sshpass -e scp -o StrictHostKeyChecking=no -P "$SSH_PORT" \
  "$LOCAL_FILE" "$SSH_USER@$SSH_HOST:$SERVER_FILE"
if [ $? -eq 0 ]; then
  echo "✓ SCP upload succeeded → $SERVER_FILE"
else
  echo "✗ SCP upload FAILED"
  exit 1
fi
echo ""

echo "[2/3] SSH touch to bust LiteSpeed cache..."
SSHPASS="$SSH_PASS" sshpass -e ssh -o StrictHostKeyChecking=no -p "$SSH_PORT" \
  "$SSH_USER@$SSH_HOST" "touch '$SERVER_FILE'" 2>/dev/null \
  && echo "✓ Cache busted via SSH touch" \
  || echo "  (SSH touch skipped — cache may take a moment)"
echo ""

echo "[3/3] Verifying live site..."
sleep 3
local_lines=$(wc -l < "$LOCAL_FILE")
attempt=1
while [ $attempt -le $MAX_RETRIES ]; do
  live_content=$(curl -s "$LIVE_URL?nocache=$(date +%s)")
  live_lines=$(echo "$live_content" | wc -l)
  live_hash=$(echo "$live_content" | md5 -q 2>/dev/null || echo "$live_content" | md5sum | cut -d' ' -f1)
  echo "  Attempt $attempt/$MAX_RETRIES — Local: ${local_lines} lines | Live: ${live_lines} lines"
  if [ "$live_lines" -eq "$local_lines" ]; then
    echo ""
    echo "═══════════════════════════════════════"
    echo "✓✓✓ DEPLOY VERIFIED — Live site matches local file"
    echo "═══════════════════════════════════════"
    exit 0
  fi
  if [ $attempt -lt $MAX_RETRIES ]; then
    echo "  Waiting ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
  fi
  attempt=$((attempt + 1))
done

echo ""
echo "═══════════════════════════════════════"
echo "✗✗✗ File deployed but live site still stale."
echo "hPanel → LiteSpeed Cache → Purge All"
echo "═══════════════════════════════════════"
exit 1
