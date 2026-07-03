import { NextResponse } from 'next/server';

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  agent_id    TEXT,
  status      TEXT DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS conversations_phone_idx ON conversations(phone);
CREATE INDEX IF NOT EXISTS conversations_agent_id_idx ON conversations(agent_id);

CREATE TABLE IF NOT EXISTS knowledge_base (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT,
  title       TEXT,
  content     TEXT NOT NULL,
  embedding   VECTOR(1536),
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
`;

export async function POST(req: Request) {
  let body: { client_id: string; supabase_url: string; supabase_service_key: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { supabase_url, supabase_service_key } = body;
  if (!supabase_url || !supabase_service_key) {
    return NextResponse.json({ error: 'supabase_url and supabase_service_key are required' }, { status: 400 });
  }

  const base = supabase_url.replace(/\/$/, '');

  // Enable pgvector extension first
  const enableVector = await fetch(`${base}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: supabase_service_key,
      Authorization: `Bearer ${supabase_service_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: 'CREATE EXTENSION IF NOT EXISTS vector;' }),
  });

  // Apply schema via Supabase REST SQL endpoint
  const res = await fetch(`${base}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: supabase_service_key,
      Authorization: `Bearer ${supabase_service_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: INIT_SQL }),
  });

  // exec_sql may not exist — fall back to pg endpoint
  if (!res.ok && !enableVector.ok) {
    // Try the pg endpoint (available in some Supabase configs)
    const pgRes = await fetch(`${base}/pg/query`, {
      method: 'POST',
      headers: {
        apikey: supabase_service_key,
        Authorization: `Bearer ${supabase_service_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: INIT_SQL }),
    });

    if (!pgRes.ok) {
      const errText = await pgRes.text().catch(() => '');
      return NextResponse.json(
        { error: `No se pudo aplicar el schema. Aplícalo manualmente en el SQL editor de Supabase. Detalle: ${errText.slice(0, 200)}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    message: 'Tablas conversations, messages y knowledge_base creadas (o ya existían).',
  });
}
