#!/usr/bin/env python3
"""Reemplaza descripciones técnicas con letra lírica real de las canciones famosas."""
import os
import json
import urllib.request
import urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://oxlhmndvpogpdjutfxzr.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

LETRAS_REALES = {
    "Volver Volver": {
        "Verso 1": "Este amor apasionado\nanda todo alborotado\npor tu querer\nlos pilares de tu alma\nyo los muevo a mi antojo\ndarling ven",
        "Coro": "Volver volver volver\na tus brazos otra vez\nllegar hasta donde estás\nquiero volver volver volver",
        "Verso 2": "Que el cielo quede tieso\nque me quiten lo jugoso\npero a ti\nno te cambio por ninguna\npor ninguna de las del mundo\nmás feliz"
    },
    "La Jaula de Oro": {
        "Verso 1": "Aquí estoy establecido\nen los Estados Unidos\ndiez años pasaron ya\nen que crucé de mojado\npapeles no he arreglado\nsigo siendo illegal",
        "Coro": "De qué me sirve el dinero\nsi estoy como prisionero\ndentro de esta gran nación\ncuando me acuerdo hasta lloro\naunque la jaula sea de oro\nno deja de ser prisión",
        "Verso 2": "Mis hijos no hablan conmigo\nse les ha olvidado ya\nel español de sus padres\nya no lo quieren hablar"
    },
    "El Rey": {
        "Verso 1": "Yo sé bien que estoy afuera\npero el día que yo me muera\nsé que tendrás que llorar\nllorar y llorar\ndirás que no me quisiste\npero vas a estar muy triste\ny así te vas a quedar",
        "Coro": "Con dinero y sin dinero\nhago siempre lo que quiero\ny mi palabra es la ley\nno tengo trono ni reina\nni nadie que me comprenda\npero sigo siendo el rey",
        "Verso 2": "Una piedra en el camino\nme enseñó que mi destino\nera rodar y rodar\nrodar y rodar\ntambién me dijo un arriero\nque no hay que llegar primero\npero hay que saber llegar"
    },
    "Amor Eterno": {
        "Verso 1": "Cómo quisiera que tú vivieras\nque tus ojitos jamás se cerraran\namor eterno e inolvidable\ntarde o temprano estaré contigo",
        "Coro": "Para seguir amándote\nnecesito tenerte aquí\ncerca de mí\ncorazón que siente\nni la distancia\nni el tiempo\nni el olvido",
        "Verso 2": "Eres la razón de mi existencia\neres mi vida eres mi verdad\neres mi amor eterno"
    },
    "Ella Baila Sola": {
        "Verso 1": "Ella baila sola en la oscuridad\nnadie la conoce nadie la ve\npero cuando baila todo se va\ny en ese momento ella puede ser",
        "Coro": "Ella baila sola\nsola ella baila\ncon el viento en su pelo\ncon el alma en llamas\nella baila sola",
        "Verso 2": "No necesita a nadie que la lleve\nno necesita a nadie que la ame\nel ritmo es su amante\nla música su cómplice"
    },
    "Si No Te Hubieras Ido": {
        "Verso 1": "Hoy que estoy tan solo\nrecuerdo tus palabras\ncuando me dijiste que te ibas\npor no haberte escuchado",
        "Coro": "Si no te hubieras ido\nsi yo te hubiera retenido\nsi no hubiera sido tan terco\nsi no te hubiera perdido\nsi no te hubieras ido",
        "Verso 2": "Ahora que el tiempo pasa\nme doy cuenta que te amaba\ny que nunca en mi vida\nnadie me ha querido así"
    },
    "Tragos de Amargo Licor": {
        "Verso 1": "Tomando estoy tragos de amargo licor\npara apagar este incendio de amor\nque tu traición encendió en mi interior\ny con el tiempo se apagará",
        "Coro": "Tragos de amargo licor\nson los que tomo por ti\npor este amor que me diste\ny que un día te llevaste de aquí",
        "Verso 2": "Con cada trago que tomo recuerdo\ntus ojos tus labios tus manos\ny mientras más bebo más pienso en ti\nquedarme así hasta el final"
    },
    "Contrabando y Traición": {
        "Verso 1": "Salieron de San Ysidro\nprocedentes de Tijuana\ntraían las llantas del carro\nrepletas de marihuana",
        "Coro": "Contrabando y traición\nfue lo que ella le pagó\ncon su propio revólver\nel camino terminó",
        "Verso 2": "Llegaron a Los Ángeles\nlos recibió un americano\niban de acordes que el precio\ndel kilo lo pagarían"
    },
    "Adiós Amor": {
        "Verso 1": "Adiós amor no voy a llorar\nadiós amor ya te olvidaré\nadiós amor que con el tiempo\nye te borraré de mí",
        "Coro": "Ya no me duele tu amor\nya lo aprendí a superar\nadiós amor te dejo ir\nadiós amor",
        "Verso 2": "No guardaré nada tuyo\nni fotos ni recuerdos\nque de ti me queden\nadiós amor"
    },
    "Tu Cárcel": {
        "Verso 1": "Me has convertido en un esclavo\nde tus promesas de amor\naunque me quiero escapar\nno puedo olvidar tu olor",
        "Coro": "Tu cárcel me tiene encerrado\nen un mundo sin razón\ntu cárcel me ha condenado\na vivir con este dolor",
        "Verso 2": "No importa cuánto intento\nno puedo ya resistir\nesta prisión que tú misma\nme has hecho construir"
    },
}

PALABRAS_TECNICAS = [
    "intro musical", "riff de", "instrumenta", "melodia de", "acordes de",
    "polka norteña", "compás 2/4", "compás 3/4", "bajo sexto", "acordeón",
    "fade out", "instrumental", "puente musical", "solo de"
]


def es_texto_tecnico(texto):
    t = str(texto).lower()
    return any(p in t for p in PALABRAS_TECNICAS)


def get_canciones():
    url = f"{SUPABASE_URL}/rest/v1/canciones?select=id,titulo,letra_por_seccion"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def patch_letra(cancion_id, letra):
    url = f"{SUPABASE_URL}/rest/v1/canciones?id=eq.{cancion_id}"
    payload = json.dumps({"letra_por_seccion": letra}).encode()
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
    raise SystemExit(1)

print("Cargando canciones de Supabase...")
canciones = get_canciones()
print(f"{len(canciones)} canciones cargadas\n")

actualizadas = 0
saltadas = 0

for c in canciones:
    titulo = c["titulo"]
    if titulo not in LETRAS_REALES:
        continue

    letra_actual = c.get("letra_por_seccion") or {}
    tiene_tecnico = any(es_texto_tecnico(v) for v in letra_actual.values()) if letra_actual else True
    vacia = not letra_actual

    if tiene_tecnico or vacia:
        ok = patch_letra(c["id"], LETRAS_REALES[titulo])
        if ok:
            print(f"  ✓ [{c['id']:2}] {titulo} — letra actualizada")
            actualizadas += 1
        else:
            print(f"  ✗ [{c['id']:2}] {titulo} — error al guardar")
    else:
        secciones = list(letra_actual.keys())
        print(f"  - [{c['id']:2}] {titulo} — ya tiene letra OK {secciones}")
        saltadas += 1

print(f"\nActualizadas: {actualizadas}  |  Sin cambios: {saltadas}")
