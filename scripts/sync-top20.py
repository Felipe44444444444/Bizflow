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

import os
canciones = sorted(data["canciones"], key=lambda x: x.get("popularidad", 0), reverse=True)

# Saltar las que ya tienen JSON generado
ya_sincronizadas = {
    int(f.split("_")[1])
    for f in os.listdir("data/sync")
    if f.startswith("cancion_") and f.endswith("_sync.json")
} if os.path.isdir("data/sync") else set()

pendientes = [c for c in canciones if c["id"] not in ya_sincronizadas]

print(f"\n{len(ya_sincronizadas)} ya sincronizadas, {len(pendientes)} pendientes:")
for i, c in enumerate(pendientes, 1):
    tpc = c.get("tiempos_por_compas", 4)
    print(f"  {i:2}. [{c.get('popularidad',0):2}] {c['titulo'][:30]:30} YT={c.get('youtube_id','?')} {tpc}/4")
canciones = pendientes

print()
resultados = []
errores = []

for c in canciones:
    print(f"  Procesando: {c['titulo']}...")
    try:
        result = subprocess.run(
            [sys.executable, "scripts/auto-sync-acordes.py",
             "--id",      str(c["id"]),
             "--yt",      c.get("youtube_id") or "dQw4w9WgXcQ",
             "--bpm",     str(c["bpm"]),
             "--compas",  str(c.get("tiempos_por_compas", 4)),
             "--titulo",  c.get("titulo", ""),
             "--artista", c.get("artista", "")],
            capture_output=True, text=True, timeout=300
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

total_sincronizadas = len(ya_sincronizadas) + len(resultados)
print(f"\n{'='*50}")
print(f"Esta ejecución: {len(resultados)} OK | {len(errores)} errores")
print(f"Total en BD:    {total_sincronizadas} / {len(data['canciones'])} canciones")
if errores:
    print(f"Errores: {', '.join(errores)}")
