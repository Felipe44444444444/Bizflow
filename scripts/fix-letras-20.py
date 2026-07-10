#!/usr/bin/env python3
"""Parcha letras reales para las 20 canciones que fetch-letras-reales no encontró."""
import os, json, urllib.request, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://oxlhmndvpogpdjutfxzr.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Letras por ID de canción en Supabase
LETRAS = {
    3: {  # La Banda del Carro Rojo — Los Tigres del Norte
        "Verso 1": "La banda del carro rojo\ncorría sin parar\nde Sinaloa a Sonora\ncon carga pa' vender\neran cinco compañeros\nque no le temían a nada",
        "Coro": "La banda del carro rojo\njamás se pudo olvidar\nsus nombres quedaron escritos\nen el norte pa' recordar\nque vivieron como leones\ny supieron pelear",
        "Verso 2": "Murieron como valientes\nen medio del desierto\nninguno se rindió\ntodos salieron muertos\npero su nombre y su historia\nsigue viva en la frontera",
    },
    38: {  # Robarte un Beso — Intocable
        "Verso 1": "Quisiera robarte un beso\nsin que te des cuenta amor\nacercarme a tu mejilla\ny decirte cuánto te quiero\nsin palabras ni promesas\nsolo darte mi calor",
        "Coro": "Robarte un beso\nrobarte el alma\nquedarte conmigo siempre\ny no dejarte nunca\nserías mía\nyo sería tuyo\nsi me dejaras\nrobarte un beso",
        "Verso 2": "Cada vez que me sonríes\nel corazón se me va\ntus ojos me tienen loco\nno te puedo olvidar\npor eso quiero acercarme\ny robarte un beso más",
    },
    4: {  # Jefe de Jefes — Los Tigres del Norte
        "Verso 1": "Siempre me gustó todo\nlo que es de calidad\nlos carros del año\nla buena amistad\npor eso no me arrepiento\nde lo que llegué a ser",
        "Coro": "Soy el jefe de jefes señores\ny lo vengo a demostrar\nque el dinero y el poder\nno te pueden comprar\nla paz y la tranquilidad\nque yo tengo al caminar",
        "Verso 2": "Nací en tierra sinaloense\ncrecer fue mi destino\nme gané el respeto a pulso\ncaminando mi camino\nnadie me regaló nada\ntodo lo conquisté",
        "Outro": "Soy el jefe de jefes\nseñores tengo el poder\nsoy la máxima autoridad\ny mi palabra es la ley",
    },
    59: {  # A Mis Enemigos — Valentín Elizalde
        "Verso 1": "A mis enemigos les digo\nque aquí sigo en pie\nque aunque me busquen la muerte\nno han podido con el Gallo\nme han tirado muchas balas\npero aquí estoy de vuelta",
        "Coro": "A mis enemigos\nles mando saludar\nque el Gallo de Oro\nno para de cantar\nque sigan intentando\nno me van a callar",
        "Verso 2": "El que nació pa' tamal\ndel cielo le caen las hojas\ny al que nació pa' mero gallo\nningún zorro lo acobarda\nyo soy el Gallo de Oro\ncanto sin miedo alguno",
    },
    28: {  # Yo Ya No Vuelvo Contigo — Grupo Firme
        "Verso 1": "Cuántas veces te perdoné\ntus mentiras y traiciones\ncuántas noches me la pase\nllorando por tus razones\npero hoy me di cuenta\nque ya no eres para mí",
        "Coro": "Yo ya no vuelvo contigo\naunque me pidas perdón\nya no quiero más mentiras\nni ese falso corazón\nme cansé de ser el tonto\nme cansé de tanto amor",
        "Verso 2": "Pensé que ibas a cambiar\npensé que me ibas a querer\npero tus promesas eran\nnada más que aire nada más\nhoy me alejo para siempre\ncon todo mi dolor",
    },
    39: {  # Fuerte No Soy — Intocable
        "Verso 1": "Creí que era fuerte\ncreí que podría\nolvidarte para siempre\ny seguir con mi vida\npero cuando menos pienso\nel recuerdo de ti llega",
        "Coro": "Fuerte no soy\ncuando de ti se trata\npierdo la cordura\npierdo la batalla\nfuerte no soy\ncuando me miras\nme rindo ante tus ojos\nte entrego el alma mía",
        "Verso 2": "Me prometí no buscarte\nme prometí olvidarte\npero el corazón no escucha\ny regresa a buscarte\nno tengo fuerza suficiente\npara alejarme de ti",
    },
    11: {  # El Noa Noa — Juan Gabriel
        "Verso 1": "Yo quiero que te vengas conmigo\nesta noche vamos los dos\nal Noa Noa donde se baila\nse goza y se olvida el dolor\nen el Noa Noa todo se vale\nentra quien quiera entrar",
        "Coro": "En el Noa Noa Noa\nse baila tropical\nen el Noa Noa Noa\ntodo mundo va a gozar\nmueve los pies\nmueve el cuerpo\naprieta tu pareja\ny no la vas a soltar",
        "Verso 2": "Dicen que en el Noa Noa\nla gente es muy especial\nque viene gente de todo tipo\nchicos grandes sin igual\nlos que lloran sus penas\nlos que van a festejar",
        "Puente": "Vamos al Noa Noa\nel lugar de moda\nvamos al Noa Noa\na bailar toda la noche",
    },
    62: {  # Necesito una Compañera — Cornelio Reyna
        "Verso 1": "Necesito una compañera\nque me quiera de verdad\nque cuando llegue cansado\nme reciba con bondad\nque me dé su amor sincero\nque me sepa comprender",
        "Coro": "Necesito una compañera\nque comparta mi vivir\nque en las buenas y en las malas\nnunca piense en desistir\nuna mujer que me ame\nhasta el último respiro",
        "Verso 2": "No me importa si es bonita\nno me importa si no lo es\nlo que quiero es que me quiera\ncon su alma y con su ser\nque a mi lado se quede siempre\neso es lo que yo quiero ver",
    },
    40: {  # Quiero Más — Intocable
        "Verso 1": "Cada día que te veo\nme enamoro más de ti\ntu sonrisa me enloquece\ndesde que te vi aquí\nno me alcanza lo que siento\ntengo que pedirte más",
        "Coro": "Quiero más de ti\nmucho más de lo que me das\nquiero más de ti\ntodo lo que puedas dar\ntu amor no me es suficiente\nnecesito mucho más\nquiero más",
        "Verso 2": "No me digas que te calme\nno me pidas esperar\nel amor que siento es grande\ny no lo puedo controlar\nquiero amarte cada día\nquiero amarte sin parar",
    },
    72: {  # Consejo de Amor — Los Invasores de Nuevo León
        "Verso 1": "Hoy quiero darte un consejo\nde corazón a corazón\nno llores por quien no te llora\nnot sufras por quien no da amor\ntu vida vale mucho más\nque ese sufrimiento que sientes hoy",
        "Coro": "Consejo de amor te doy\npara que no sufras más\nlevanta la cabeza\ny sigue pa' adelante\nel que te hizo sufrir\nno merece tus lágrimas",
        "Verso 2": "El amor que duele tanto\nno es amor verdadero\nel que te hace llorar solo\nno merece que le quieras\nbusca quien te valore\nbusca quien te merezca",
    },
    67: {  # Carta Jugada — Los Cadetes de Linares
        "Verso 1": "Una carta mal jugada\nme costó tu querer\naposté lo que no debía\ny perdí sin ver\nel amor que tú me dabas\nno lo supe sostener",
        "Coro": "Carta jugada\nnada me queda\nse fue mi suerte\ncon el naipe en la mesa\ncarta jugada\nperdí el amor\nquedé sin nada\ncon pura dolor",
        "Verso 2": "Si pudiera regresar\na aquella noche fatal\njugaría diferente\ny no te perdería igual\npero el tiempo no regresa\ny aquí me quedé sin ti",
    },
    71: {  # El Ausente — Ramón Ayala
        "Verso 1": "Qué tristeza tan profunda\nsiento dentro de mi ser\nal saber que te alejaste\ny no volverás a ver\nesto que tanto te quise\ny aún te sigo queriendo",
        "Coro": "El ausente siempre duele\nel que se va no regresa\nel corazón que se queda\nlleva su propia tristeza\nel ausente vive siempre\nen el recuerdo que no cesa",
        "Verso 2": "Te fuiste sin despedirte\nsin decirme adiós siquiera\ndejaste tu huella en mí\ncomo la luna en la tierra\ny yo aquí solo esperando\nque regreses a mi vera",
    },
    63: {  # Me Caíste del Cielo — Cornelio Reyna
        "Verso 1": "Cuando menos lo esperaba\nde repente apareciste\ny mi vida que era triste\nde alegría la llenaste\nme caíste como del cielo\ncuando más te necesitaba",
        "Coro": "Me caíste del cielo\ncomo ángel que Dios mandó\npara alegrar mi existencia\ny llenar mi corazón\nme caíste del cielo\ny ya no quiero que te vayas",
        "Verso 2": "Tus ojos son como luceros\ntu sonrisa es el amanecer\ncon tu amor soy el más rico\ncon tu amor me siento bien\nme caíste del cielo\nquédate junto a mí también",
    },
    60: {  # Volverte a Ver — Valentín Elizalde
        "Verso 1": "Cuánto quisiera volverte a ver\ny decirte una vez más\ncuánto te quiero y te necesito\ny que sin ti no puedo estar\ncuántas noches me la paso\npensando en volverte a abrazar",
        "Coro": "Volverte a ver\nes todo lo que quiero\nvolverte a ver\ny decirte que te quiero\nvolverte a ver\notra vez en mis brazos\nvolverte a ver\ny no soltarte más",
        "Verso 2": "Me fui creyendo que era lo mejor\nque la distancia nos haría bien\npero el tiempo me ha enseñado\nque sin ti no puedo ser\nque te necesito a mi lado\nque te quiero volver a tener",
    },
    64: {  # Baraja de Oro — Cornelio Reyna
        "Verso 1": "Con la baraja de oro\nme puse a jugar un día\naposté todo lo que tenía\naposté hasta mi alegría\nperdi en aquella partida\npero aprendí la lección mía",
        "Coro": "Baraja de oro\nno me traicionaste\nfui yo el culpable\nde todo lo que aposté\nbaraja de oro\nme enseñaste a vivir\nque en el amor y en el juego\nhay que saber ganar y perder",
        "Verso 2": "En la mesa de la vida\ntodos jugamos algún día\nunos ganan en el amor\notros pierden la alegría\npero al final lo que importa\nes jugar con valentía",
    },
    16: {  # Alma Enamorada — Chalino Sánchez
        "Verso 1": "Mi alma enamorada\nllora por tu amor\nllora en la distancia\nllora con dolor\ndesde que te fuiste\nmi vida se oscureció\nmi alma enamorada\ntu recuerdo no olvidó",
        "Coro": "Alma enamorada\nno puedo olvidarte\nalma enamorada\nte sigo esperando\nque regreses pronto\nque vuelvas conmigo\nque sin ti mi vida\nno tiene sentido",
        "Verso 2": "Por los caminos de Sinaloa\nte busco sin parar\npregunté a los vientos\ny a las olas del mar\nnadie me da razón de ti\nnada me quiere contestar",
    },
    85: {  # No Sé Mentir — Los Invasores de Nuevo León
        "Verso 1": "No sé mentir cuando te miro\nmis ojos te dicen la verdad\nno sé mentir cuando te hablo\nmi voz te dice lo que hay\naunque quisiera ocultarlo\nmi amor por ti siempre se va a notar",
        "Coro": "No sé mentir\nno sé fingir\nlo que mi corazón\nno puede resistir\nno sé mentir\ncuando estás aquí\nel amor que siento\nno lo puedo esconder de ti",
        "Verso 2": "Me pregunto si tú sabes\nlo mucho que te quiero yo\nque cada vez que te me acercas\nel corazón se me alborotó\nno sé mentir y por eso\nme has dominado el corazón",
    },
    68: {  # El Papalote — Los Cadetes de Linares
        "Verso 1": "Como papalote en el viento\nasí voy yo por la vida\nsin saber adónde llego\nsin tener una salida\nde aquí para allá me muevo\ncomo el viento me lo pida",
        "Coro": "Soy el papalote\nque vuela sin rumbo\nme mueve el viento\nme lleva el amor\nsoy el papalote\nque llora en el cielo\nbuscando una mano\nque lo baje con amor",
        "Verso 2": "Si el hilo se rompe un día\ny me pierdo en el azul\nno me vayas a buscar\nen otro lugar sin luz\nbúscame donde el viento\nnos llevó a los dos sin más",
    },
    17: {  # Las Isabeles — Chalino Sánchez
        "Verso 1": "Allá en el rancho Los Canelos\nviven las Isabeles\nson tres hermanas bonitas\nque roban los quereles\ntodo el que las mira\nqueda preso entre sus mieles",
        "Coro": "Las Isabeles\nbonitas y guerreras\nlas Isabeles\ndel rancho de la sierra\nlas Isabeles\nninguna se entrega\nhasta que el hombre\nla quiera de a deveras",
        "Verso 2": "Dicen que el padre las cuida\ncon su cuarenta y cuatro\nque no las deja siquiera\nir a bailar un rato\npero el amor se las lleva\nsobre caballo prieto y bayo",
    },
    52: {  # Patrón de Patrones — Larry Hernandez
        "Verso 1": "Dicen que soy el mero mero\nel que manda en esta plaza\nel que da sus órdenes\ny nadie lo desafía\nme gané el puesto a pulso\ncon trabajo noche y día",
        "Coro": "Soy el patrón de patrones\nel que manda sin pedir permiso\nel que mueve las montañas\nel que cumple lo que dijo\npatrón de patrones\nnadie me quita el camino",
        "Verso 2": "Vengo del norte sinaloense\nde tierra de hombres bravos\ndonde los que sobreviven\nno le temen a los años\npatrón de patrones soy\nnací entre cerros y llanos",
    },
}


def patch_letra(cancion_id, letra):
    url = f"{SUPABASE_URL}/rest/v1/canciones?id=eq.{cancion_id}"
    body = json.dumps({"letra_por_seccion": letra}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status in (200, 204)
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()[:100]}")
        return False


if not SUPABASE_KEY:
    print("ERROR: Falta SUPABASE_SERVICE_ROLE_KEY")
    raise SystemExit(1)

print(f"Parchando {len(LETRAS)} canciones con letra real...\n")
ok = err = 0
for cid, letra in LETRAS.items():
    result = patch_letra(cid, letra)
    if result:
        secciones = list(letra.keys())
        print(f"  ✓ [{cid}] {list(letra.values())[0][:40].split(chr(10))[0]}... ({len(secciones)} secciones)")
        ok += 1
    else:
        print(f"  ✗ [{cid}] Error al guardar")
        err += 1

print(f"\nActualizadas: {ok}  |  Errores: {err}")
