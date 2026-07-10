#!/usr/bin/env python3
"""
Obtiene letras reales desde Genius API y las guarda en Supabase
divididas en secciones (Verso, Coro, etc.)
"""
import os, json, time, re, urllib.request
import lyricsgenius

GENIUS_TOKEN = os.environ.get("GENIUS_ACCESS_TOKEN")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not GENIUS_TOKEN:
    print("ERROR: falta GENIUS_ACCESS_TOKEN")
    print("Obténlo en: https://genius.com/api-clients")
    exit(1)

genius = lyricsgenius.Genius(
    GENIUS_TOKEN,
    skip_non_songs=True,
    excluded_terms=["(Remix)", "(Live)", "(Cover)"],
    verbose=False,
    timeout=15
)
genius.language = "es"

def get_canciones():
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/canciones?select=id,titulo,artista,letra_por_seccion&limit=85",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def patch_letra(id, letra_secciones):
    url = f"{SUPABASE_URL}/rest/v1/canciones?id=eq.{id}"
    body = json.dumps({"letra_por_seccion": letra_secciones}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    })
    urllib.request.urlopen(req)

def parsear_secciones(letra_raw):
    if not letra_raw:
        return {}

    lineas = letra_raw.strip().split('\n')
    if lineas and lineas[0].strip().endswith('Lyrics'):
        lineas = lineas[1:]

    secciones = {}
    seccion_actual = None
    lineas_actuales = []

    for linea in lineas:
        linea = linea.strip()
        match = re.match(r'^\[([^\]]+)\]$', linea)
        if match:
            if seccion_actual and lineas_actuales:
                texto = '\n'.join(l for l in lineas_actuales if l).strip()
                if texto and len(texto) > 10:
                    secciones[seccion_actual] = texto
            seccion_actual = match.group(1)
            lineas_actuales = []
        elif seccion_actual is not None:
            lineas_actuales.append(linea)

    if seccion_actual and lineas_actuales:
        texto = '\n'.join(l for l in lineas_actuales if l).strip()
        if texto and len(texto) > 10:
            secciones[seccion_actual] = texto

    if not secciones:
        todas = [l for l in lineas if l.strip()]
        if todas:
            t = max(1, len(todas) // 3)
            secciones = {
                "Verso 1": '\n'.join(todas[:t]),
                "Coro":    '\n'.join(todas[t:2*t]),
                "Verso 2": '\n'.join(todas[2*t:]),
            }

    return secciones

def letra_es_falsa(letra_secciones):
    if not letra_secciones:
        return True
    texto = ' '.join(str(v) for v in letra_secciones.values()).lower()
    palabras_falsas = [
        'intro musical', 'riff de', 'instrumenta',
        'melodia de guitarra', 'acordes de', 'solo de',
        'intro instrumenta', 'introduccion musical'
    ]
    return len(texto) < 80 or any(p in texto for p in palabras_falsas)

print("Cargando canciones de Supabase...")
canciones = get_canciones()
print(f"Total: {len(canciones)} canciones\n")

ok, actualizadas, no_encontradas, errores = [], [], [], []

for c in canciones:
    titulo    = c['titulo']
    artista   = c['artista']
    letra_actual = c.get('letra_por_seccion', {})

    if not letra_es_falsa(letra_actual):
        print(f"  ✓ {titulo[:40]} — ya tiene letra real")
        ok.append(titulo)
        continue

    print(f"  Buscando: {titulo} - {artista}...", end=' ', flush=True)

    try:
        cancion = genius.search_song(titulo, artista)

        if not cancion or not cancion.lyrics:
            print("✗ no encontrada")
            no_encontradas.append(titulo)
            time.sleep(1)
            continue

        secciones = parsear_secciones(cancion.lyrics)

        if not secciones:
            print("✗ sin secciones")
            no_encontradas.append(titulo)
            time.sleep(1)
            continue

        patch_letra(c['id'], secciones)
        total_chars = sum(len(v) for v in secciones.values())
        print(f"✓ {len(secciones)} secciones, {total_chars} chars")
        actualizadas.append(titulo)

    except Exception as e:
        print(f"✗ Error: {str(e)[:60]}")
        errores.append(titulo)

    time.sleep(1.5)

print(f"\n{'='*50}")
print(f"✓ Ya tenían letra real:     {len(ok)}")
print(f"✓ Actualizadas con Genius:  {len(actualizadas)}")
print(f"✗ No encontradas:           {len(no_encontradas)}")
print(f"✗ Errores:                  {len(errores)}")

if no_encontradas:
    print(f"\nSin letra ({len(no_encontradas)}):")
    for t in no_encontradas:
        print(f"  - {t}")
