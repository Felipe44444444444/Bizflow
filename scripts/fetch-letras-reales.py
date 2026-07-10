#!/usr/bin/env python3
"""Obtiene letras reales desde letras.com y las sube a Supabase."""
import os
import json
import time
import re
import urllib.request
import urllib.parse

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://oxlhmndvpogpdjutfxzr.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
}

PALABRAS_TECNICAS = [
    "intro musical", "riff de", "instrumenta", "melodia de guitarra",
    "acordes de", "intro instrumenta", "solo de", "polka norteña",
    "compás 2/4", "compás 3/4", "bajo sexto", "fade out", "puente musical",
]


def supabase_get(tabla, filtro=""):
    url = f"{SUPABASE_URL}/rest/v1/{tabla}?{filtro}&limit=100"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def supabase_patch(tabla, cancion_id, data):
    url = f"{SUPABASE_URL}/rest/v1/{tabla}?id=eq.{cancion_id}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status in (200, 204)


def fetch_url(url, timeout=12):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="ignore")


def buscar_letras_com(titulo, artista):
    """Busca en lyrics.com."""
    try:
        query = urllib.parse.quote(f"{titulo} {artista}")
        html = fetch_url(f"https://www.lyrics.com/serp.php?st={query}&qtype=1")
        match = re.search(r'href="(/lyric/[^"]+)"', html)
        if not match:
            return None
        html2 = fetch_url("https://www.lyrics.com" + match.group(1))
        m = re.search(r'<pre[^>]*id="lyric-body-text"[^>]*>(.*?)</pre>', html2, re.DOTALL)
        if not m:
            m = re.search(r'<pre[^>]*class="[^"]*lyric[^"]*"[^>]*>(.*?)</pre>', html2, re.DOTALL)
        if not m:
            return None
        raw = re.sub(r'<[^>]+>', '', m.group(1))
        raw = re.sub(r'&amp;', '&', raw)
        raw = re.sub(r'&quot;', '"', raw)
        raw = re.sub(r'&#\d+;', '', raw)
        raw = re.sub(r'\n{3,}', '\n\n', raw).strip()
        return raw if len(raw) > 80 else None
    except Exception as e:
        return None


def buscar_musixmatch_like(titulo, artista):
    """Busca en letras.com (versión en español)."""
    try:
        slug_artista = re.sub(r'[^a-z0-9]+', '-', artista.lower()).strip('-')
        slug_titulo  = re.sub(r'[^a-z0-9]+', '-', titulo.lower()).strip('-')
        url = f"https://www.letras.com/{slug_artista}/{slug_titulo}/"
        html = fetch_url(url)
        m = re.search(r'<div[^>]*class="[^"]*cnt-letra[^"]*"[^>]*>(.*?)</div>\s*<div', html, re.DOTALL)
        if not m:
            return None
        raw = re.sub(r'<br\s*/?>', '\n', m.group(1), flags=re.IGNORECASE)
        raw = re.sub(r'<p[^>]*>', '\n', raw)
        raw = re.sub(r'</p>', '\n', raw)
        raw = re.sub(r'<[^>]+>', '', raw)
        raw = re.sub(r'\n{3,}', '\n\n', raw).strip()
        return raw if len(raw) > 80 else None
    except Exception:
        return None


def parsear_secciones(letra_completa):
    """Divide la letra en secciones detectando [Verso], [Coro], etc."""
    secciones = {}
    seccion_actual = "Verso 1"
    lineas_buf = []
    verso_count = 1

    MARCADORES = {
        'verso': 'Verso', 'verse': 'Verso', 'coro': 'Coro', 'chorus': 'Coro',
        'estribillo': 'Coro', 'bridge': 'Puente', 'puente': 'Puente',
        'pre-coro': 'Pre-Coro', 'intro': 'Intro', 'outro': 'Outro',
        'pre-chorus': 'Pre-Coro',
    }

    for linea in letra_completa.split('\n'):
        strip = linea.strip()
        lower = strip.lower().strip('[](){}')

        es_marcador = strip.startswith('[') and strip.endswith(']')
        if not es_marcador:
            es_marcador = any(lower.startswith(m) for m in MARCADORES) and len(strip) < 35

        if es_marcador:
            if lineas_buf:
                secciones[seccion_actual] = '\n'.join(lineas_buf).strip()
                lineas_buf = []
            clean = strip.strip('[](){}')
            lower_c = clean.lower()
            nueva = None
            for key, nombre in MARCADORES.items():
                if key in lower_c:
                    if nombre == 'Verso':
                        nueva = f"Verso {verso_count}"
                        verso_count += 1
                    else:
                        nueva = nombre
                    break
            seccion_actual = nueva or clean.title()
        elif strip:
            lineas_buf.append(strip)

    if lineas_buf:
        secciones[seccion_actual] = '\n'.join(lineas_buf).strip()

    # Fallback: dividir en tercios si no se detectaron secciones
    if len(secciones) <= 1 and letra_completa.strip():
        lineas = [l for l in letra_completa.split('\n') if l.strip()]
        n = len(lineas)
        tercio = max(3, n // 3)
        secciones = {
            "Verso 1": '\n'.join(lineas[:tercio]),
            "Coro":    '\n'.join(lineas[tercio: 2 * tercio]),
            "Verso 2": '\n'.join(lineas[2 * tercio:]),
        }

    return {k: v for k, v in secciones.items() if v.strip()}


def es_letra_tecnica(letra_dict):
    if not letra_dict:
        return True
    texto = ' '.join(str(v) for v in letra_dict.values()).lower()
    return any(p in texto for p in PALABRAS_TECNICAS) or len(texto) < 80


# ── Main ──────────────────────────────────────────────────────────────────────

if not SUPABASE_KEY:
    print("ERROR: Falta SUPABASE_SERVICE_ROLE_KEY")
    raise SystemExit(1)

print("Cargando canciones desde Supabase...")
canciones = supabase_get('canciones', 'select=id,titulo,artista,letra_por_seccion&order=popularidad.desc')
print(f"{len(canciones)} canciones · procesando...\n")

ok = err = saltadas = 0

for i, c in enumerate(canciones, 1):
    titulo  = c['titulo']
    artista = c['artista']
    letra   = c.get('letra_por_seccion') or {}

    if not es_letra_tecnica(letra):
        print(f"  [{i:2}] ✓ {titulo[:35]} — OK ({len(letra)} secciones)")
        saltadas += 1
        continue

    print(f"  [{i:2}] {titulo[:35]} — buscando...", end=' ', flush=True)

    # Fuente 1: letras.com (español)
    texto = buscar_musixmatch_like(titulo, artista)
    fuente = "letras.com"

    # Fuente 2: lyrics.com (inglés)
    if not texto:
        time.sleep(1)
        texto = buscar_letras_com(titulo, artista)
        fuente = "lyrics.com"

    if texto:
        secciones = parsear_secciones(texto)
        if supabase_patch('canciones', c['id'], {'letra_por_seccion': secciones}):
            print(f"✓ {fuente} ({len(secciones)} sec, {len(texto)} ch)")
            ok += 1
        else:
            print("✗ error al guardar")
            err += 1
    else:
        print("✗ no encontrada")
        err += 1

    time.sleep(2)

print(f"\n{'='*50}")
print(f"Con letra real: {ok + saltadas}  |  Nuevas: {ok}  |  Sin letra: {err}")
