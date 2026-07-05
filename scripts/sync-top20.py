#!/usr/bin/env python3
"""
Sincroniza automáticamente las top 20 canciones por popularidad.
Llama a auto-sync-acordes.py por cada canción.
"""

import json
import subprocess
import sys
import time
import urllib.request

API = "https://api.conectaachat.com"

# ── Obtener top 20 ────────────────────────────────────────────────────────────

print("Obteniendo canciones del API...")
with urllib.request.urlopen(f"{API}/api/canciones?limit=85") as r:
    data = json.loads(r.read())

canciones = sorted(data["canciones"], key=lambda x: x.get("popularidad", 0), reverse=True)[:20]

print(f"\nTop 20 canciones a sincronizar:")
for i, c in enumerate(canciones, 1):
    tpc = c.get("tiempos_por_compas", 4)
    print(f"  {i:2}. [{c['popularidad']:2}] {c['titulo'][:30]:30} YT={c.get('youtube_id','?')} {tpc}/4")

print()
resultados = []
errores = []

for c in canciones:
    if not c.get("youtube_id"):
        print(f"  SKIP: {c['titulo']} — sin youtube_id")
        errores.append(c["titulo"])
        continue

    print(f"  Procesando: {c['titulo']}...")
    try:
        result = subprocess.run(
            [sys.executable, "scripts/auto-sync-acordes.py",
             "--id",     str(c["id"]),
             "--yt",     c["youtube_id"],
             "--bpm",    str(c["bpm"]),
             "--compas", str(c.get("tiempos_por_compas", 4))],
            capture_output=True, text=True, timeout=180
        )

        if result.returncode == 0:
            resultados.append(c["titulo"])
            print(f"  ✓ {c['titulo']}")
        else:
            errores.append(c["titulo"])
            print(f"  ✗ {c['titulo']}: {result.stderr[-200:]}")
    except subprocess.TimeoutExpired:
        errores.append(c["titulo"])
        print(f"  ✗ {c['titulo']}: timeout (>3min)")
    except Exception as e:
        errores.append(c["titulo"])
        print(f"  ✗ {c['titulo']}: {e}")

    time.sleep(3)  # respetar rate limit de YouTube

print(f"\n{'='*50}")
print(f"Resultado: {len(resultados)} OK | {len(errores)} errores")
if errores:
    print(f"Errores: {', '.join(errores)}")
