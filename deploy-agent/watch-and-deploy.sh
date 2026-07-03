#!/bin/bash
# XENTTECH Auto-Deploy Watcher
# bash 3.2 compatible (macOS default) — uses case instead of declare -A

WATCH_DIR="$HOME/conectachat/hostinger"
AGENT="$HOME/conectachat/deploy-agent/verify-deploy.sh"

resolve_remote() {
  case "$1" in
    "$WATCH_DIR/index.html")
      echo "public_html/index.html|https://xenttech.com" ;;
    "$WATCH_DIR/admin/index.html")
      echo "public_html/admin/index.html|https://xenttech.com/admin/" ;;
    *)
      echo "" ;;
  esac
}

echo "═══════════════════════════════════════"
echo "  XENTTECH Auto-Deploy Watcher ACTIVE"
echo "═══════════════════════════════════════"
echo "Watching: $WATCH_DIR"
echo "Tracked files:"
echo "  - $WATCH_DIR/index.html  →  index.html  (xenttech.com)"
echo "  - $WATCH_DIR/admin/index.html  →  public_html/admin/index.html"
echo ""
echo "Save any tracked file to auto-deploy + verify."
echo "Ctrl+C to stop."
echo ""

if ! command -v fswatch &>/dev/null; then
  echo "Installing fswatch..."
  brew install fswatch
fi

fswatch -0 --event Updated --event Created --event AttributeModified --event Renamed "$WATCH_DIR" | while IFS= read -r -d "" event; do
  mapping=$(resolve_remote "$event")
  [ -z "$mapping" ] && continue

  IFS='|' read -r remote_path live_url <<< "$mapping"

  echo ""
  echo "[$(date '+%H:%M:%S')] Change detected: $event"
  echo "  Deploying → $remote_path"
  echo ""

  "$AGENT" "$event" "$remote_path" "$live_url"

  if [ $? -eq 0 ]; then
    echo "[$(date '+%H:%M:%S')] SUCCESS — $live_url is live"
    say "Despliegue exitoso" 2>/dev/null || true
  else
    echo "[$(date '+%H:%M:%S')] File on disk is correct. Cache purge needed for $live_url"
    say "Purga el cache manualmente" 2>/dev/null || true
  fi
done
