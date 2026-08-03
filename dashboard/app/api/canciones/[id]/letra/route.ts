import { supabaseAdmin, json } from "@/lib/musica-db";

export async function OPTIONS(req: Request) {
  return json(null, { origin: req.headers.get("origin") });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const origin = req.headers.get("origin");
  const { letra_por_seccion } = await req.json();

  if (!letra_por_seccion || typeof letra_por_seccion !== "object")
    return json({ error: "letra_por_seccion requerida" }, { status: 400, origin });

  const { data, error } = await supabaseAdmin
    .from("canciones")
    .update({ letra_por_seccion })
    .eq("id", params.id)
    .select("id, titulo")
    .single();

  if (error?.code === "PGRST116")
    return json({ error: `Canción ${params.id} no encontrada` }, { status: 404, origin });
  if (error) return json({ error: error.message }, { status: 500, origin });

  return json({ ok: true, cancion: data }, { origin });
}
