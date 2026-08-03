import { supabaseAdmin, json, sanitize } from "@/lib/musica-db";

export async function OPTIONS(req: Request) {
  return json(null, { origin: req.headers.get("origin") });
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return json({ error: "El parámetro ?q es requerido" }, { status: 400, origin });

  const safe = sanitize(q);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const limit = Math.min(50, parseInt(searchParams.get("limit") || "20") || 20);
  const from = (page - 1) * limit;
  const ftsQuery = safe.split(/\s+/).map((w) => `${w}:*`).join(" & ");

  const { data, count, error } = await supabaseAdmin
    .from("canciones")
    .select(
      "id, titulo, artista, genero, tono, bpm, duracion_segundos, youtube_id, popularidad, tiempos_por_compas, sync_calidad",
      { count: "exact" }
    )
    .textSearch("fts", ftsQuery, { type: "websearch", config: "spanish" })
    .order("popularidad", { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    const { data: d2, count: c2, error: e2 } = await supabaseAdmin
      .from("canciones")
      .select("id, titulo, artista, genero, tono, bpm, duracion_segundos, youtube_id, popularidad", {
        count: "exact",
      })
      .or(`titulo.ilike.%${safe}%,artista.ilike.%${safe}%`)
      .order("popularidad", { ascending: false })
      .range(from, from + limit - 1);

    if (e2) return json({ error: e2.message }, { status: 500, origin });
    return json({ query: q, total: c2, page, limit, canciones: d2 }, { origin });
  }

  return json({ query: q, total: count, page, limit, canciones: data }, { origin });
}
