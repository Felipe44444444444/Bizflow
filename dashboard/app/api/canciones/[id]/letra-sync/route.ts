import { supabaseAdmin, json } from "@/lib/musica-db";

const LRC_CACHE = new Map<number, { ts: number; data: unknown }>();
const LRC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function limpiarArtista(artista: string) {
  return String(artista ?? "").split(/ ft\.| feat\.| y sus| &/i)[0].trim();
}

function parseLRC(syncedLyrics: string) {
  const lineas: { tiempo: number; texto: string }[] = [];
  const tagRe = /\[(\d{2}):(\d{2}(?:\.\d{1,2})?)\]/g;
  for (const raw of String(syncedLyrics ?? "").split("\n")) {
    const texto = raw.replace(/\[\d{2}:\d{2}(?:\.\d{1,2})?\]/g, "").trim();
    if (!texto) continue;
    tagRe.lastIndex = 0;
    let m;
    while ((m = tagRe.exec(raw))) {
      const tiempo = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
      lineas.push({ tiempo, texto });
    }
  }
  lineas.sort((a, b) => a.tiempo - b.tiempo);
  return lineas;
}

function elegirMejorMatch(resultados: any[], duracionEsperada?: number) {
  const conSync = (resultados || []).filter((r) => r.syncedLyrics);
  if (!conSync.length) return null;
  if (duracionEsperada) {
    conSync.sort(
      (a, b) => Math.abs((a.duration || 0) - duracionEsperada) - Math.abs((b.duration || 0) - duracionEsperada)
    );
  }
  return conSync[0];
}

export async function OPTIONS(req: Request) {
  return json(null, { origin: req.headers.get("origin") });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const origin = req.headers.get("origin");
  const id = parseInt(params.id);
  if (!Number.isFinite(id) || id < 1) return json({ error: "ID inválido" }, { status: 400, origin });

  const cached = LRC_CACHE.get(id);
  if (cached && Date.now() - cached.ts < LRC_CACHE_TTL_MS) return json(cached.data, { origin });

  const { data: cancion, error } = await supabaseAdmin
    .from("canciones")
    .select("id, titulo, artista, duracion_segundos, estructura")
    .eq("id", id)
    .single();

  if (error?.code === "PGRST116")
    return json({ error: `Canción ${id} no encontrada` }, { status: 404, origin });
  if (error) return json({ error: error.message }, { status: 500, origin });

  const fallback = { sync: false, secciones: cancion.estructura || [] };
  let resultado: unknown = fallback;

  try {
    const params2 = new URLSearchParams({
      track_name: cancion.titulo,
      artist_name: limpiarArtista(cancion.artista),
    });
    const r = await fetch(`https://lrclib.net/api/search?${params2}`, {
      headers: { "User-Agent": "ConnectaChat/1.0 (https://conectaachat.com)" },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const resultados = await r.json();
      const mejor = elegirMejorMatch(resultados, cancion.duracion_segundos);
      if (mejor) {
        const lineas = parseLRC(mejor.syncedLyrics);
        if (lineas.length) resultado = { sync: true, lineas, fuente: "lrclib" };
      }
    }
  } catch (e: any) {
    console.error(`[letra-sync] LRCLIB error para canción ${id}:`, e.message);
  }

  LRC_CACHE.set(id, { ts: Date.now(), data: resultado });
  return json(resultado, { origin });
}
