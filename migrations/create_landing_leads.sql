-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/oxlhmndvpogpdjutfxzr/sql

CREATE TABLE IF NOT EXISTS landing_leads (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_negocio   TEXT NOT NULL,
  email            TEXT NOT NULL,
  whatsapp         TEXT,
  mensajes_dia     TEXT,
  source           TEXT DEFAULT 'landing',
  status           TEXT DEFAULT 'new'
                   CHECK (status IN ('new','contacted','qualified','lost','unsubscribed')),
  retargeting_step INTEGER DEFAULT 0,
  next_contact_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 day'),
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE landing_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_full" ON landing_leads
  FOR ALL TO service_role USING (true);

CREATE INDEX IF NOT EXISTS landing_leads_retargeting_idx
  ON landing_leads (next_contact_at, retargeting_step)
  WHERE status NOT IN ('lost','unsubscribed');
