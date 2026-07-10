#!/usr/bin/env python3
"""
Agente autónomo de verificación y corrección de letras
Corre periódicamente o cuando se le pasa una lista manual
"""
import os, json, re, time, urllib.request, sys
import lyricsgenius

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
GENIUS_TOKEN = os.environ.get("GENIUS_ACCESS_TOKEN")

genius = lyricsgenius.Genius(
    GENIUS_TOKEN,
    skip_non_songs=True,
    excluded_terms=["(Remix)", "(Live)", "(Cover)", "(Karaoke)", "(Instrumental)"],
    verbose=False,
    timeout=15
)

PALABRAS_FALSAS = [
    'intro musical', 'riff de', 'instrumenta', 'melodia de',
    'acordes de', 'solo de', 'introduccion musical',
    'puente instrumental', 'fade out musical',
    'introducción instrumental'
]

LETRAS_MINIMAS = {
    'default': 200,
    'corrido': 300,
    'ranchera': 250,
    'banda': 300,
    'norteña': 250,
}


def get_canciones():
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/canciones?select=id,titulo,artista,genero,letra_por_seccion&limit=85",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def patch_letra(id, secciones, fuente="genius"):
    url = f"{SUPABASE_URL}/rest/v1/canciones?id=eq.{id}"
    body = json.dumps({"letra_por_seccion": secciones}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json", "Prefer": "return=minimal"
    })
    urllib.request.urlopen(req)


def score_letra(letra_secciones, genero='default'):
    if not letra_secciones:
        return 0
    texto = ' '.join(str(v) for v in letra_secciones.values())
    score = 100

    for p in PALABRAS_FALSAS:
        if p in texto.lower():
            score -= 30

    minimo = LETRAS_MINIMAS.get(genero, LETRAS_MINIMAS['default'])
    if len(texto) < minimo:
        score -= 40
    elif len(texto) < minimo * 1.5:
        score -= 10

    if len(letra_secciones) < 2:
        score -= 20

    secciones_vacias = sum(1 for v in letra_secciones.values() if len(str(v).strip()) < 20)
    score -= secciones_vacias * 15

    return max(0, score)


def parsear_genius(lyrics_raw):
    if not lyrics_raw:
        return {}
    lineas = lyrics_raw.strip().split('\n')
    if lineas and 'Lyrics' in lineas[0]:
        lineas = lineas[1:]
    if lineas and 'Embed' in lineas[-1]:
        lineas = lineas[:-1]

    secciones, sec_actual, buf = {}, None, []
    for l in lineas:
        m = re.match(r'^\[([^\]]+)\]', l.strip())
        if m:
            if sec_actual and buf:
                texto = '\n'.join(x for x in buf if x).strip()
                if len(texto) > 20:
                    secciones[sec_actual] = texto
            sec_actual = m.group(1)
            buf = []
        elif sec_actual is not None:
            buf.append(l.strip())

    if sec_actual and buf:
        texto = '\n'.join(x for x in buf if x).strip()
        if len(texto) > 20:
            secciones[sec_actual] = texto

    if not secciones:
        todas = [l.strip() for l in lineas if l.strip()]
        if todas:
            t = max(1, len(todas) // 3)
            secciones = {
                "Verso 1": '\n'.join(todas[:t]),
                "Coro":    '\n'.join(todas[t:2*t]),
                "Verso 2": '\n'.join(todas[2*t:]),
            }
    return secciones


def buscar_genius_multivariante(titulo, artista):
    variantes = [
        (titulo, artista),
        (titulo, artista.split('ft.')[0].strip()),
        (titulo, artista.split('feat.')[0].strip()),
        (titulo, artista.split('y sus')[0].strip()),
        (titulo, artista.split('&')[0].strip()),
        (titulo, ''),
    ]
    for t, a in variantes:
        try:
            r = genius.search_song(t, a) if a else genius.search_song(t)
            if r and r.lyrics and len(r.lyrics) > 150:
                return r.lyrics
        except Exception:
            time.sleep(2)
        time.sleep(0.5)
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

titulos_manuales = sys.argv[1:] if len(sys.argv) > 1 else []

print("═══════════════════════════════════════")
print("   AGENTE VERIFICADOR DE LETRAS")
print("═══════════════════════════════════════\n")

canciones = get_canciones()
if titulos_manuales:
    canciones = [c for c in canciones if c['titulo'] in titulos_manuales]
    print(f"Modo manual: procesando {len(canciones)} canciones\n")
else:
    print(f"Modo completo: verificando {len(canciones)} canciones\n")

reporte = {
    "verificadas_ok": [],
    "corregidas": [],
    "pendientes_manual": [],
    "scores": {},
}

for c in canciones:
    titulo     = c['titulo']
    artista    = c['artista']
    genero     = c.get('genero', 'default')
    letra_actual = c.get('letra_por_seccion', {})

    score = score_letra(letra_actual, genero)
    reporte["scores"][titulo] = score

    print(f"  {titulo[:35]:35} score={score:3}/100", end=' ', flush=True)

    if score >= 70:
        print("✓ OK")
        reporte["verificadas_ok"].append(titulo)
        continue

    print("→ buscando en Genius...", end=' ', flush=True)
    lyrics = buscar_genius_multivariante(titulo, artista)

    if lyrics:
        secciones = parsear_genius(lyrics)
        nuevo_score = score_letra(secciones, genero)
        if nuevo_score > score:
            patch_letra(c['id'], secciones)
            print(f"✓ corregida (score {score}→{nuevo_score})")
            reporte["corregidas"].append(titulo)
        else:
            print(f"✗ Genius tiene peor calidad ({nuevo_score})")
            reporte["pendientes_manual"].append(titulo)
    else:
        print("✗ no en Genius")
        reporte["pendientes_manual"].append(titulo)

    time.sleep(1.5)

os.makedirs("data", exist_ok=True)
with open("data/reporte-letras.json", "w") as f:
    json.dump(reporte, f, indent=2, ensure_ascii=False)

print(f"\n{'═'*50}")
print(f"✓ OK sin cambios:     {len(reporte['verificadas_ok'])}")
print(f"✓ Corregidas:         {len(reporte['corregidas'])}")
print(f"✗ Pendientes manual:  {len(reporte['pendientes_manual'])}")
if reporte["pendientes_manual"]:
    print(f"\nPendientes (agregar manualmente):")
    for t in reporte["pendientes_manual"]:
        print(f"  - {t}")
print(f"\nReporte guardado en data/reporte-letras.json")
