import { supabaseAdmin, json, sanitize } from "@/lib/musica-db";

export async function OPTIONS(req: Request) {
  return json(null, { origin: req.headers.get("origin") });
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "20") || 20);
  const from = (page - 1) * limit;
  const genero = searchParams.get("genero")?.trim();
  const artista = searchParams.get("artista")?.trim();
  const sortBy = ["popularidad", "titulo", "artista", "bpm"].includes(searchParams.get("sort") || "")
    ? (searchParams.get("sort") as string)
    : "popularidad";
  const asc = searchParams.get("order") === "asc";

  let q = supabaseAdmin
    .from("canciones")
    .select(
      "id, titulo, artista, genero, tono, bpm, duracion_segundos, youtube_id, popularidad, tiempos_por_compas, sync_calidad",
      { count: "exact" }
    )
    .order(sortBy, { ascending: asc })
    .range(from, from + limit - 1);

  if (genero) q = q.eq("genero", genero);
  if (artista) q = q.ilike("artista", `%${sanitize(artista)}%`);

  const { data, count, error } = await q;
  if (error) return json({ error: error.message }, { status: 500, origin });

  return json(
    { total: count, page, limit, pages: Math.ceil((count || 0) / limit), canciones: data },
    { origin }
  );
}
