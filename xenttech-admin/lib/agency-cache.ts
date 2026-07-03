const CACHE = new Map<string, { data: any; ts: number }>();
const TTL_MS = 5 * 60 * 1000;

export function getCache<T>(key: string): T | null {
  const entry = CACHE.get(key);
  if (!entry || Date.now() - entry.ts > TTL_MS) return null;
  return entry.data as T;
}

export function setCache(key: string, data: any) {
  CACHE.set(key, { data, ts: Date.now() });
}

export function invalidateCache(...keys: string[]) {
  if (keys.length === 0) { CACHE.clear(); return; }
  for (const k of keys) CACHE.delete(k);
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error("unreachable");
}

export async function cachedGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  force = false
): Promise<T> {
  if (!force) {
    const cached = getCache<T>(key);
    if (cached !== null) return cached;
  }
  const data = await withRetry(fetcher);
  setCache(key, data);
  return data;
}
