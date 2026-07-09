#!/usr/bin/env python3
"""Verifica y corrige youtube_ids inválidos en Supabase usando yt-dlp search."""
import json
import os
import sys
import urllib.request
import urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://oxlhmndvpogpdjutfxzr.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def buscar_id_youtube(titulo, artista):
    try:
        import yt_dlp as ytdlp
    except ImportError:
        print("  ERROR: pip3 install yt-dlp --break-system-packages")
        return None

    class Silent:
        def debug(self, m): pass
        def warning(self, m): pass
        def error(self, m): pass

    with ytdlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True, "logger": Silent()}) as ydl:
        info = ydl.extract_info(f"ytsearch1:{titulo} {artista}", download=False)
        for e in (info.get("entries") or []):
            vid_id = e.get("id") or ""
            if len(vid_id) == 11:
                return vid_id
    return None


def verificar_id(youtube_id):
    if not youtube_id:
        return False
    try:
        from pytubefix import YouTube
        yt = YouTube(f"https://www.youtube.com/watch?v={youtube_id}")
        _ = yt.title
        return True
    except Exception:
        return False


def get_canciones():
    url = f"{SUPABASE_URL}/rest/v1/canciones?select=id,titulo,artista,youtube_id&order=popularidad.desc"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def patch_youtube_id(cancion_id, nuevo_id):
    url = f"{SUPABASE_URL}/rest/v1/canciones?id=eq.{cancion_id}"
    payload = json.dumps({"youtube_id": nuevo_id}).encode()
    req = urllib.request.Request(url, data=payload, method="PATCH", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    try:
        with urllib.request.urlopen(req) as r:
            return r.status in (200, 204)
    except urllib.error.HTTPError as e:
        print(f"    HTTP {e.code}: {e.read().decode()[:100]}")
        return False


if not SUPABASE_KEY:
    print("ERROR: Falta SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

print("Cargando canciones desde Supabase...")
canciones = get_canciones()
print(f"{len(canciones)} canciones a verificar\n")

corregidos = []
errores = []

for c in canciones:
    yt_id = c.get("youtube_id", "")
    print(f"[{c['id']:2}] {c['titulo'][:30]:30} ({yt_id})...", end=" ", flush=True)

    if verificar_id(yt_id):
        print("OK")
        continue

    print("INVÁLIDO — buscando...", end=" ", flush=True)
    nuevo = buscar_id_youtube(c["titulo"], c["artista"])
    if nuevo:
        if patch_youtube_id(c["id"], nuevo):
            print(f"→ {nuevo} ✓")
            corregidos.append(c["titulo"])
        else:
            print(f"→ {nuevo} (ERROR al guardar)")
            errores.append(c["titulo"])
    else:
        print("no encontrado")
        errores.append(c["titulo"])

print(f"\n{'='*50}")
print(f"Corregidos: {len(corregidos)}")
print(f"Errores:    {len(errores)}")
if corregidos:
    print(f"  OK: {', '.join(corregidos)}")
if errores:
    print(f"  ERR: {', '.join(errores)}")
