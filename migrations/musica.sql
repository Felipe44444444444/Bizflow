-- ── Canciones ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canciones (
  id                  SERIAL PRIMARY KEY,
  titulo              TEXT        NOT NULL,
  artista             TEXT        NOT NULL,
  genero              TEXT        NOT NULL,
  tono                TEXT        NOT NULL,
  bpm                 INTEGER,
  acordes             JSONB,
  estructura          JSONB,
  letra_por_seccion   JSONB,
  duracion_segundos   INTEGER,
  youtube_id          TEXT,
  popularidad         INTEGER     DEFAULT 50 CHECK (popularidad BETWEEN 1 AND 100),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canciones_genero     ON canciones (genero);
CREATE INDEX IF NOT EXISTS idx_canciones_artista    ON canciones (artista);
CREATE INDEX IF NOT EXISTS idx_canciones_popularidad ON canciones (popularidad DESC);

-- Full-text search index over titulo + artista
ALTER TABLE canciones
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish', coalesce(titulo,'') || ' ' || coalesce(artista,''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_canciones_fts ON canciones USING gin(fts);

-- ── Favoritos ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favoritos (
  id          SERIAL      PRIMARY KEY,
  user_id     UUID        NOT NULL,
  cancion_id  INTEGER     NOT NULL REFERENCES canciones(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, cancion_id)
);

CREATE INDEX IF NOT EXISTS idx_favoritos_user_id    ON favoritos (user_id);
CREATE INDEX IF NOT EXISTS idx_favoritos_cancion_id ON favoritos (cancion_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE canciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE favoritos  ENABLE ROW LEVEL SECURITY;

-- Canciones: anyone can read (public catalog)
CREATE POLICY "canciones_select_public"
  ON canciones FOR SELECT
  USING (true);

-- Only service-role (seed / admin) can insert/update/delete canciones
CREATE POLICY "canciones_write_service"
  ON canciones FOR ALL
  USING (auth.role() = 'service_role');

-- Favoritos: users only see and manage their own rows
CREATE POLICY "favoritos_own_user"
  ON favoritos FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
