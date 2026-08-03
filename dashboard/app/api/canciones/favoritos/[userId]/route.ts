import { supabaseAdmin, json, userIdFromAuth } from "@/lib/musica-db";

export async function OPTIONS(req: Request) {
  return json(null, { origin: req.headers.get("origin") });
}

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  const origin = req.headers.get("origin");
  const authedId = await userIdFromAuth(req);
  if (!authedId) return json({ error: "No autenticado" }, { status: 401, origin });
  if (authedId !== params.userId)
    return json({ error: "No puedes acceder a los favoritos de otro usuario" }, { status: 403, origin });

  const { data, error } = await supabaseAdmin
    .from("favoritos")
    .select(
      `id, created_at, canciones (
        id, titulo, artista, genero, tono, bpm,
        acordes, estructura, letra_por_seccion,
        duracion_segundos, youtube_id, popularidad,
        tiempos_por_compas, sync_calidad
      )`
    )
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false });

  if (error) return json({ error: error.message }, { status: 500, origin });

  return json(
    {
      user_id: params.userId,
      total: data.length,
      favoritos: data.map((f: any) => ({ favorito_id: f.id, guardado_en: f.created_at, ...f.canciones })),
    },
    { origin }
  );
}
