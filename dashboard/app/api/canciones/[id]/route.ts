import { supabaseAdmin, json } from "@/lib/musica-db";

export async function OPTIONS(req: Request) {
  return json(null, { origin: req.headers.get("origin") });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const origin = req.headers.get("origin");
  const id = parseInt(params.id);
  if (!Number.isFinite(id) || id < 1) return json({ error: "ID inválido" }, { status: 400, origin });

  const { data, error } = await supabaseAdmin.from("canciones").select("*").eq("id", id).single();

  if (error?.code === "PGRST116")
    return json({ error: `Canción ${id} no encontrada` }, { status: 404, origin });
  if (error) return json({ error: error.message }, { status: 500, origin });

  return json(data, { origin });
}
