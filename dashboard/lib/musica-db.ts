import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ALLOWED_ORIGINS = new Set([
  "https://app.conectaachat.com",
  "https://conectaachat.com",
  "https://www.conectaachat.com",
  "https://conectachat-dashboard.vercel.app",
]);

export function corsHeaders(origin: string | null) {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export function json(data: unknown, init: { status?: number; origin?: string | null } = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(init.origin ?? null) },
  });
}

export function sanitize(s: unknown) {
  return String(s ?? "").replace(/[%_\\]/g, "\\$&").slice(0, 100);
}

export async function userIdFromAuth(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  const token = auth?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
