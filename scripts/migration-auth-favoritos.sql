-- ── Full-text search column (idempotent) ─────────────────────────────────────
ALTER TABLE canciones ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish', coalesce(titulo,'') || ' ' || coalesce(artista,''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_canciones_fts ON canciones USING GIN (fts);

-- ── Favoritos ligada a auth.users ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favoritos (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cancion_id integer     REFERENCES canciones(id)  ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, cancion_id)
);

-- ── RLS favoritos: cada usuario solo ve/edita sus propias filas ───────────────
ALTER TABLE favoritos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_favoritos" ON favoritos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "insert_own_favoritos" ON favoritos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_favoritos" ON favoritos
  FOR DELETE USING (auth.uid() = user_id);

-- ── Canciones: pública, solo lectura ─────────────────────────────────────────
ALTER TABLE canciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canciones_publicas" ON canciones
  FOR SELECT USING (true);
