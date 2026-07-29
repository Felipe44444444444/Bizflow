#!/usr/bin/env python3
"""
Sube los acordes auto-detectados a Supabase.

Requiere --ids con la lista explicita de song IDs a subir (los que se
acaban de procesar en esta corrida). No sube archivos viejos que quedaron
sueltos en data/sync/ de corridas anteriores -- eso fue lo que sobreescribio
49 canciones ya corregidas con fuentes reales el 2026-07-27.

Uso: python3 scripts/upload-sync-supabase.py --ids 12,45,67
"""

import argparse
import json
import os
import urllib.request
import urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://oxlhmndvpogpdjutfxzr.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_KEY:
    print("ERROR: Falta SUPABASE_SERVICE_ROLE_KEY")
    raise SystemExit(1)


def patch_cancion(cancion_id: int, acordes: list, sync_calidad: str = "auto-detectado"):
    url = f"{SUPABASE_URL}/rest/v1/canciones?id=eq.{cancion_id}"
    payload = json.dumps({"acordes": acordes, "sync_calidad": sync_calidad}).encode()
    req = urllib.request.Request(
        url, data=payload, method="PATCH",
        headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "return=minimal",
        }
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status in (200, 204)
    except urllib.error.HTTPError as e:
        print(f"    HTTP {e.code}: {e.read().decode()[:200]}")
        return False


parser = argparse.ArgumentParser()
parser.add_argument("--ids", required=True, help="song IDs a subir, separados por coma (ej: 12,45,67)")
args = parser.parse_args()

ids_permitidos = {int(x) for x in args.ids.split(",") if x.strip()}
archivos = [f"data/sync/cancion_{i}_sync.json" for i in ids_permitidos]
archivos = [a for a in archivos if os.path.exists(a)]
faltantes = ids_permitidos - {int(os.path.basename(a).split("_")[1]) for a in archivos}
if faltantes:
    print(f"AVISO: no hay archivo sync para IDs {sorted(faltantes)}, se omiten")

print(f"Subiendo {len(archivos)} archivos a Supabase (solo IDs {sorted(ids_permitidos)})...\n")

ok = err = 0
for archivo in archivos:
    with open(archivo, encoding="utf-8") as f:
        data = json.load(f)

    cancion_id = data["cancion_id"]
    acordes    = data["acordes"]

    success = patch_cancion(cancion_id, acordes)
    if success:
        ok += 1
        print(f"  ✓ Canción {cancion_id:3} — {len(acordes)} acordes subidos")
    else:
        err += 1
        print(f"  ✗ Canción {cancion_id:3} — error al subir")

print(f"\nResultado: {ok} OK | {err} errores")
