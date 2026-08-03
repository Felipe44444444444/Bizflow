import { supabaseAdmin, json, userIdFromAuth } from "@/lib/musica-db";

export async function OPTIONS(req: Request) {
  return json(null, { origin: req.headers.get("origin") });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const userId = await userIdFromAuth(req);
  if (!userId) return json({ error: "No autenticado" }, { status: 401, origin });

  const body = await req.json();
  const cancionId = Number(body?.cancionId);
  const action = body?.action === "remove" ? "remove" : "add";
  if (!Number.isInteger(cancionId) || cancionId < 1)
    return json({ error: "cancionId inválido" }, { status: 400, origin });

  if (action === "remove") {
    const { error } = await supabaseAdmin
      .from("favoritos")
      .delete()
      .eq("user_id", userId)
      .eq("cancion_id", cancionId);
    if (error) return json({ error: error.message }, { status: 500, origin });
    return json({ ok: true, action: "removed", cancionId }, { origin });
  }

  const { data: cancion, error: cErr } = await supabaseAdmin
    .from("canciones")
    .select("id, titulo, artista")
    .eq("id", cancionId)
    .single();

  if (cErr?.code === "PGRST116")
    return json({ error: `Canción ${cancionId} no encontrada` }, { status: 404, origin });
  if (cErr) return json({ error: cErr.message }, { status: 500, origin });

  const { data, error } = await supabaseAdmin
    .from("favoritos")
    .upsert({ user_id: userId, cancion_id: cancionId }, { onConflict: "user_id,cancion_id" })
    .select("id, created_at")
    .single();

  if (error) return json({ error: error.message }, { status: 500, origin });

  return json(
    { ok: true, action: "added", favorito: { id: data.id, created_at: data.created_at }, cancion },
    { status: 201, origin }
  );
}
