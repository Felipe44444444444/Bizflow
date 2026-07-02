const { Router } = require('express');
const { z }      = require('zod');
const { supabaseAdmin } = require('../config/supabase');
const authSupabase = require('../middleware/authSupabase');

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
function err(res, status, msg) {
  return res.status(status).json({ error: msg });
}

function sanitize(s) {
  return String(s ?? '').replace(/[%_\\]/g, '\\$&').slice(0, 100);
}

// ── GET /api/canciones/generos ────────────────────────────────────────────────
// Returns unique genres with song count, ordered by count desc.
// Must be declared BEFORE /:id to avoid being swallowed by the dynamic segment.
router.get('/generos', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('canciones')
    .select('genero');

  if (error) return err(res, 500, error.message);

  const counts = {};
  for (const row of data) {
    counts[row.genero] = (counts[row.genero] ?? 0) + 1;
  }

  const generos = Object.entries(counts)
    .map(([genero, total]) => ({ genero, total }))
    .sort((a, b) => b.total - a.total);

  res.json({ generos });
});

// ── GET /api/canciones/buscar?q=término ──────────────────────────────────────
// Full-text search on titulo + artista (uses the generated `fts` column).
// Falls back to ILIKE if the query has no whole words.
router.get('/buscar', async (req, res) => {
  const q = (req.query.q ?? '').trim();
  if (!q) return err(res, 400, 'El parámetro ?q es requerido');

  const safe = sanitize(q);
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const from  = (page - 1) * limit;

  // Try full-text search first
  const ftsQuery = safe.split(/\s+/).map(w => `${w}:*`).join(' & ');

  const { data, count, error } = await supabaseAdmin
    .from('canciones')
    .select(
      'id, titulo, artista, genero, tono, bpm, duracion_segundos, youtube_id, popularidad, tiempos_por_compas, sync_calidad',
      { count: 'exact' }
    )
    .textSearch('fts', ftsQuery, { type: 'websearch', config: 'spanish' })
    .order('popularidad', { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    // Fallback: ILIKE when FTS fails (e.g. single special chars)
    const { data: d2, count: c2, error: e2 } = await supabaseAdmin
      .from('canciones')
      .select(
        'id, titulo, artista, genero, tono, bpm, duracion_segundos, youtube_id, popularidad',
        { count: 'exact' }
      )
      .or(`titulo.ilike.%${safe}%,artista.ilike.%${safe}%`)
      .order('popularidad', { ascending: false })
      .range(from, from + limit - 1);

    if (e2) return err(res, 500, e2.message);
    return res.json({ query: q, total: c2, page, limit, canciones: d2 });
  }

  res.json({ query: q, total: count, page, limit, canciones: data });
});

// ── GET /api/canciones/favoritos/:userId ──────────────────────────────────────
// Returns all favorites for a user with full song details.
// Requires Supabase Auth; users can only read their own favorites.
router.get('/favoritos/:userId', authSupabase, async (req, res) => {
  const { userId } = req.params;

  if (req.userId !== userId) {
    return err(res, 403, 'No puedes acceder a los favoritos de otro usuario');
  }

  const { data, error } = await supabaseAdmin
    .from('favoritos')
    .select(`
      id,
      created_at,
      canciones (
        id, titulo, artista, genero, tono, bpm,
        acordes, estructura, letra_por_seccion,
        duracion_segundos, youtube_id, popularidad,
        tiempos_por_compas, sync_calidad
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return err(res, 500, error.message);

  res.json({
    user_id:   userId,
    total:     data.length,
    favoritos: data.map(f => ({ favorito_id: f.id, guardado_en: f.created_at, ...f.canciones })),
  });
});

// ── GET /api/canciones ────────────────────────────────────────────────────────
// Lists songs with pagination and optional genre filter.
router.get('/', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const from   = (page - 1) * limit;
  const genero = req.query.genero?.trim();
  const artista = req.query.artista?.trim();
  const sortBy  = ['popularidad', 'titulo', 'artista', 'bpm'].includes(req.query.sort)
    ? req.query.sort : 'popularidad';
  const asc     = req.query.order === 'asc';

  let q = supabaseAdmin
    .from('canciones')
    .select(
      'id, titulo, artista, genero, tono, bpm, duracion_segundos, youtube_id, popularidad, tiempos_por_compas, sync_calidad',
      { count: 'exact' }
    )
    .order(sortBy, { ascending: asc })
    .range(from, from + limit - 1);

  if (genero)  q = q.eq('genero', genero);
  if (artista) q = q.ilike('artista', `%${sanitize(artista)}%`);

  const { data, count, error } = await q;
  if (error) return err(res, 500, error.message);

  res.json({
    total:     count,
    page,
    limit,
    pages:     Math.ceil(count / limit),
    canciones: data,
  });
});

// ── GET /api/canciones/:id ────────────────────────────────────────────────────
// Returns full song detail including acordes, estructura, letra.
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id) || id < 1) return err(res, 400, 'ID inválido');

  const { data, error } = await supabaseAdmin
    .from('canciones')
    .select('*')
    .eq('id', id)
    .single();

  if (error?.code === 'PGRST116') return err(res, 404, `Canción ${id} no encontrada`);
  if (error) return err(res, 500, error.message);

  res.json(data);
});

// ── POST /api/canciones/favoritos ─────────────────────────────────────────────
// Saves or removes a favorite. Body: { userId, cancionId, action?: 'add'|'remove' }
// userId comes from the auth token (req.userId), not the request body
const favSchema = z.object({
  cancionId: z.number().int().positive(),
  action:    z.enum(['add', 'remove']).default('add'),
});

router.post('/favoritos', authSupabase, async (req, res) => {
  const parsed = favSchema.safeParse({
    cancionId: Number(req.body?.cancionId),
    action:    req.body?.action,
  });
  if (!parsed.success) return err(res, 400, parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const { cancionId, action } = parsed.data;
  const userId = req.userId; // set by authSupabase

  if (action === 'remove') {
    const { error } = await supabaseAdmin
      .from('favoritos')
      .delete()
      .eq('user_id', userId)
      .eq('cancion_id', cancionId);

    if (error) return err(res, 500, error.message);
    return res.json({ ok: true, action: 'removed', cancionId });
  }

  // Verify song exists
  const { data: cancion, error: cErr } = await supabaseAdmin
    .from('canciones')
    .select('id, titulo, artista')
    .eq('id', cancionId)
    .single();

  if (cErr?.code === 'PGRST116') return err(res, 404, `Canción ${cancionId} no encontrada`);
  if (cErr) return err(res, 500, cErr.message);

  const { data, error } = await supabaseAdmin
    .from('favoritos')
    .upsert({ user_id: userId, cancion_id: cancionId }, { onConflict: 'user_id,cancion_id' })
    .select('id, created_at')
    .single();

  if (error) return err(res, 500, error.message);

  res.status(201).json({
    ok:         true,
    action:     'added',
    favorito:   { id: data.id, created_at: data.created_at },
    cancion,
  });
});

module.exports = router;
