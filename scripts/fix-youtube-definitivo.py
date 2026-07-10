#!/usr/bin/env python3
import os, json, urllib.request, time
import yt_dlp

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def get_canciones():
    url = f"{SUPABASE_URL}/rest/v1/canciones?select=id,titulo,artista,youtube_id&limit=100"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def verificar_video(youtube_id):
    if not youtube_id:
        return False
    opts = {'quiet': True, 'no_warnings': True, 'skip_download': True,
            'extract_flat': False, 'socket_timeout': 8}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={youtube_id}", download=False)
            return bool(info and info.get('id'))
    except Exception:
        return False

def buscar_video(titulo, artista):
    query = f"{titulo} {artista} oficial"
    opts = {
        'quiet': True, 'no_warnings': True,
        'extract_flat': True, 'skip_download': True,
        'default_search': 'ytsearch3',
        'socket_timeout': 15,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch3:{query}", download=False)
            entries = (info or {}).get('entries', [])
            for e in entries:
                vid_id = e.get('id', '')
                vid_title = (e.get('title', '') or '').lower()
                # Prefer if artist name appears in video title
                if vid_id and artista.split()[0].lower() in vid_title:
                    return vid_id
            # Fallback: first result
            if entries and entries[0].get('id'):
                return entries[0]['id']
    except Exception as ex:
        print(f"(búsqueda falló: {ex})", end=' ')
    return None

def patch_youtube_id(cancion_id, youtube_id):
    url = f"{SUPABASE_URL}/rest/v1/canciones?id=eq.{cancion_id}"
    body = json.dumps({"youtube_id": youtube_id}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status in (200, 204)

canciones = get_canciones()
print(f"Verificando {len(canciones)} canciones...\n")

ok = arregladas = fallidas = 0

for c in canciones:
    titulo  = c['titulo']
    artista = c['artista']
    yt_id   = c.get('youtube_id') or ''

    print(f"  {titulo[:33]:33}", end=' ', flush=True)

    if verificar_video(yt_id):
        print(f"✓ {yt_id}")
        ok += 1
        continue

    print(f"✗  buscando...", end=' ', flush=True)
    nuevo_id = buscar_video(titulo, artista)

    if nuevo_id:
        patch_youtube_id(c['id'], nuevo_id)
        print(f"→ {nuevo_id} ✓")
        arregladas += 1
    else:
        print("→ no encontrado")
        fallidas += 1

    time.sleep(2)

print(f"\n{'='*50}")
print(f"✓ Válidos:    {ok}")
print(f"↻ Arreglados: {arregladas}")
print(f"✗ Sin video:  {fallidas}")
