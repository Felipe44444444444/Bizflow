#!/usr/bin/env python3
"""
Sube los acordes auto-detectados a Supabase.
Lee todos los data/sync/cancion_*_sync.json y actualiza la tabla canciones.
"""

import json
import os
import glob
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


archivos = sorted(glob.glob("data/sync/cancion_*_sync.json"))
print(f"Subiendo {len(archivos)} archivos a Supabase...\n")

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
