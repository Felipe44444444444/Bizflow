const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

async function request(
  path: string,
  options: RequestInit = {},
  token: string,
  organizationId?: string
) {
  const res = await fetch(`${BACKEND}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(organizationId && { "x-organization-id": organizationId }),
      ...(options.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path: string, token: string, orgId?: string) =>
    request(path, { method: "GET" }, token, orgId),
  post: (path: string, body: unknown, token: string, orgId?: string) =>
    request(path, { method: "POST", body: JSON.stringify(body) }, token, orgId),
  put: (path: string, body: unknown, token: string, orgId?: string) =>
    request(path, { method: "PUT", body: JSON.stringify(body) }, token, orgId),
  patch: (path: string, body: unknown, token: string, orgId?: string) =>
    request(path, { method: "PATCH", body: JSON.stringify(body) }, token, orgId),
  del: (path: string, token: string, orgId?: string) =>
    request(path, { method: "DELETE" }, token, orgId),
};
