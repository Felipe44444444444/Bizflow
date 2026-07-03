-- PART 1: Unified Customer Memory Schema

CREATE TABLE IF NOT EXISTS xenttech_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  canonical_name text,
  phone text,
  email text,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  total_conversations int DEFAULT 0,
  lead_score int DEFAULT 0,
  lead_status text DEFAULT 'new',
  tags text[],
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xenttech_contact_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES xenttech_contacts(id) ON DELETE CASCADE,
  channel_type text NOT NULL,
  channel_identifier text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(channel_type, channel_identifier)
);

CREATE TABLE IF NOT EXISTS xenttech_contact_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES xenttech_contacts(id) ON DELETE CASCADE,
  fact_type text NOT NULL,
  fact_value text NOT NULL,
  confidence float DEFAULT 1.0,
  source_conversation_id uuid,
  created_at timestamptz DEFAULT now(),
  superseded_by uuid REFERENCES xenttech_contact_memory(id)
);

ALTER TABLE xenttech_conversations DROP COLUMN IF EXISTS contact_id;
ALTER TABLE xenttech_conversations ADD COLUMN contact_id uuid REFERENCES xenttech_contacts(id);

CREATE INDEX IF NOT EXISTS idx_contact_channels_contact_id ON xenttech_contact_channels(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_channels_lookup ON xenttech_contact_channels(channel_type, channel_identifier);
CREATE INDEX IF NOT EXISTS idx_contact_memory_contact_id ON xenttech_contact_memory(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON xenttech_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON xenttech_contacts(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email ON xenttech_contacts(email) WHERE email IS NOT NULL;
