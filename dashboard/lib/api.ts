import { createClient } from "@/lib/supabase/client";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "https://api.conectaachat.com";

async function getFreshToken(): Promise<string> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.access_token;

  // Access token missing or expired — try refresh
  const { data: { session: refreshed } } = await supabase.auth.refreshSession();
  if (refreshed) return refreshed.access_token;

  throw new Error("Sesión expirada. Por favor inicia sesión de nuevo.");
}

/** Returns Authorization + org headers with a guaranteed-fresh token. */
export async function getAuthHeaders(orgId?: string): Promise<Record<string, string>> {
  const token = await getFreshToken();
  return {
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "x-organization-id": orgId } : {}),
  };
}

async function request(
  path: string,
  options: RequestInit = {},
  orgId?: string
): Promise<any> {
  const token = await getFreshToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "x-organization-id": orgId } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${BACKEND}${path}`, { ...options, headers });

  // On 401 refresh once and retry
  if (res.status === 401) {
    const supabase = createClient();
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    if (!refreshed) throw new Error("Sesión expirada. Por favor inicia sesión de nuevo.");

    headers.Authorization = `Bearer ${refreshed.access_token}`;
    const retry = await fetch(`${BACKEND}${path}`, { ...options, headers });
    if (!retry.ok) {
      const err = await retry.json().catch(() => ({ error: `HTTP ${retry.status}` }));
      throw new Error(err.error || `HTTP ${retry.status}`);
    }
    if (retry.status === 204) return null;
    return retry.json();
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get:   (path: string, orgId?: string) =>
    request(path, { method: "GET" }, orgId),
  post:  (path: string, body: unknown, orgId?: string) =>
    request(path, { method: "POST", body: JSON.stringify(body) }, orgId),
  put:   (path: string, body: unknown, orgId?: string) =>
    request(path, { method: "PUT", body: JSON.stringify(body) }, orgId),
  patch: (path: string, body: unknown, orgId?: string) =>
    request(path, { method: "PATCH", body: JSON.stringify(body) }, orgId),
  del:   (path: string, orgId?: string) =>
    request(path, { method: "DELETE" }, orgId),
};
