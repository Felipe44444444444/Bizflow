#!/bin/bash
# Agente ConnectaChat — corre cada 6h via cron
cd "$(dirname "$0")/.."

LOG="logs/agente-$(date +%Y%m%d).log"
mkdir -p logs

echo "[$(date)] Iniciando verificación..." >> "$LOG"

export $(grep -E "^SUPABASE_URL=|^SUPABASE_SERVICE_ROLE_KEY=|^GENIUS_ACCESS_TOKEN=" .env | xargs)

# 1. Verificar letras
python3 scripts/agente-letras.py >> "$LOG" 2>&1
echo "[$(date)] Letras verificadas" >> "$LOG"

# 2. Verificar videos rotos
python3 scripts/fix-youtube-definitivo.py >> "$LOG" 2>&1
echo "[$(date)] Videos verificados" >> "$LOG"

# 3. Reporte a consola
tail -5 "$LOG"
