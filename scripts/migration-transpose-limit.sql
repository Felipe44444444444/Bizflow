-- ConnectaChat Música — límite diario de transpose (plan free)
-- Ya aplicada en producción vía Supabase MCP (2026-08-20). Este archivo documenta el cambio.

ALTER TABLE uso_diario ADD COLUMN IF NOT EXISTS transposiciones_hoy integer DEFAULT 0;
