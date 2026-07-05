-- ConnectaChat Música — Monetización
-- Ejecutar en Supabase: SQL Editor

CREATE TABLE IF NOT EXISTS planes (
  id                  text PRIMARY KEY,
  nombre              text NOT NULL,
  precio_mensual      numeric(10,2),
  canciones_por_dia   integer,
  features            jsonb DEFAULT '[]'
);

INSERT INTO planes VALUES
  ('free', 'Gratuito', 0,    10, '["acordes_basicos"]'),
  ('pro',  'Pro',      9.99, -1, '["acordes_sync","transpose","velocidad","pdf","editor_sync"]')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS suscripciones (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                 text REFERENCES planes(id) DEFAULT 'free',
  stripe_customer_id      text,
  stripe_subscription_id  text,
  status                  text DEFAULT 'active',
  current_period_end      timestamptz,
  created_at              timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS uso_diario (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha               date DEFAULT current_date,
  canciones_vistas    integer DEFAULT 0,
  UNIQUE(user_id, fecha)
);

ALTER TABLE suscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE uso_diario    ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ver_propia_sub' AND tablename = 'suscripciones'
  ) THEN
    CREATE POLICY "ver_propia_sub" ON suscripciones
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ver_propio_uso' AND tablename = 'uso_diario'
  ) THEN
    CREATE POLICY "ver_propio_uso" ON uso_diario
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
