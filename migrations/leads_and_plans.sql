-- ══════════════════════════════════════════════════════
-- PARTE 1: Ampliar tabla leads
-- ══════════════════════════════════════════════════════

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS canal            text,
  ADD COLUMN IF NOT EXISTS canal_user_id    text,
  ADD COLUMN IF NOT EXISTS canal_username   text,
  ADD COLUMN IF NOT EXISTS ad_id            text,
  ADD COLUMN IF NOT EXISTS ad_name          text,
  ADD COLUMN IF NOT EXISTS campaign_id      text,
  ADD COLUMN IF NOT EXISTS campaign_name    text,
  ADD COLUMN IF NOT EXISTS adset_id         text,
  ADD COLUMN IF NOT EXISTS adset_name       text,
  ADD COLUMN IF NOT EXISTS ad_source        text,
  ADD COLUMN IF NOT EXISTS referral_url     text,
  ADD COLUMN IF NOT EXISTS primer_mensaje   text,
  ADD COLUMN IF NOT EXISTS fb_page_id       text,
  ADD COLUMN IF NOT EXISTS ig_account_id    text,
  ADD COLUMN IF NOT EXISTS wa_phone_number  text,
  ADD COLUMN IF NOT EXISTS first_seen_at    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at     timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS notes            text;

-- Backfill canal from source_channel for existing rows
UPDATE leads SET canal = source_channel WHERE canal IS NULL AND source_channel IS NOT NULL;

-- Widen status constraint to accept both English and Spanish values
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads
  ADD CONSTRAINT leads_status_check
  CHECK (status IN (
    'nuevo','contactado','interesado','cliente','descartado',
    'new','contacted','qualified','lost'
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS leads_canal_user_idx ON leads(canal_user_id, agent_id);
CREATE INDEX IF NOT EXISTS leads_canal_idx      ON leads(canal);
CREATE INDEX IF NOT EXISTS leads_status_idx     ON leads(status);
CREATE INDEX IF NOT EXISTS leads_ad_id_idx      ON leads(ad_id);
CREATE INDEX IF NOT EXISTS leads_org_id_idx     ON leads(org_id) WHERE org_id IS NOT NULL;

-- ══════════════════════════════════════════════════════
-- PARTE 2: Historial de mensajes por lead
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lead_messages (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id    uuid REFERENCES leads(id) ON DELETE CASCADE,
  direction  text CHECK (direction IN ('inbound', 'outbound')),
  content    text,
  canal      text,
  sent_at    timestamptz DEFAULT now()
);

ALTER TABLE lead_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_full_lead_messages" ON lead_messages
  FOR ALL TO service_role USING (true);

CREATE POLICY "org_read_lead_messages" ON lead_messages
  FOR SELECT TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM leads
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS lead_messages_lead_id_idx ON lead_messages(lead_id, sent_at);

-- ══════════════════════════════════════════════════════
-- PARTE 3: Notificaciones
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  type            text,
  title           text,
  body            text,
  metadata        jsonb DEFAULT '{}',
  read            boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_full_notifications" ON notifications
  FOR ALL TO service_role USING (true);

CREATE POLICY "org_read_notifications" ON notifications
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_update_notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS notifications_org_unread_idx ON notifications(organization_id, read, created_at DESC);

-- ══════════════════════════════════════════════════════
-- PARTE 4: Planes en MXN
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plans (
  id                    text PRIMARY KEY,
  name                  text,
  price_mxn             integer,
  price_mxn_bimonthly   integer,
  messages_limit        integer,
  agents_limit          integer,
  users_limit           integer,
  features              jsonb,
  is_popular            boolean DEFAULT false,
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_plans" ON plans FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_full_plans"  ON plans FOR ALL   TO service_role        USING (true);

INSERT INTO plans
  (id, name, price_mxn, price_mxn_bimonthly, messages_limit, agents_limit, users_limit, features, is_popular)
VALUES
  ('starter',    'Starter',    29900,   49900,   500,   1,  1,
   '["Widget web","Soporte por email","1 agente IA","1 usuario"]'::jsonb,
   false),
  ('pro',        'Pro',        79900,  129900,  3000,   3,  3,
   '["Widget + Slack + FB + IG","RAG ilimitado","Analytics básico","Soporte prioritario","3 agentes IA","3 usuarios"]'::jsonb,
   true),
  ('business',   'Business',  199900,  319900, 15000,  10, -1,
   '["Todos los canales + WhatsApp Business","Analytics avanzado + exportar leads","API access","SLA 99.9%","Soporte dedicado + onboarding","Usuarios ilimitados"]'::jsonb,
   false),
  ('enterprise', 'Enterprise',     0,       0,    -1,  -1, -1,
   '["Agentes ilimitados","Mensajes ilimitados","Infraestructura dedicada","Integración custom","Account manager dedicado"]'::jsonb,
   false)
ON CONFLICT (id) DO UPDATE SET
  price_mxn             = EXCLUDED.price_mxn,
  price_mxn_bimonthly   = EXCLUDED.price_mxn_bimonthly,
  messages_limit        = EXCLUDED.messages_limit,
  agents_limit          = EXCLUDED.agents_limit,
  users_limit           = EXCLUDED.users_limit,
  features              = EXCLUDED.features,
  is_popular            = EXCLUDED.is_popular;
