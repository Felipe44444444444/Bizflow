import { supabaseAdmin, json } from "@/lib/musica-db";

export async function OPTIONS(req: Request) {
  return json(null, { origin: req.headers.get("origin") });
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const { data, error } = await supabaseAdmin.from("canciones").select("genero");
  if (error) return json({ error: error.message }, { status: 500, origin });

  const counts: Record<string, number> = {};
  for (const row of data) counts[row.genero] = (counts[row.genero] ?? 0) + 1;

  const generos = Object.entries(counts)
    .map(([genero, total]) => ({ genero, total }))
    .sort((a, b) => b.total - a.total);

  return json({ generos }, { origin });
}
