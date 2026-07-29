const BASE_URL = import.meta.env.VITE_API_URL || '';
const BASE = `${BASE_URL}/api/canciones`;

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  return r.json();
}

export const api = {
  listar:  (p = {}) => get(`${BASE}?${new URLSearchParams(p)}`),
  buscar:  (q, p = {}) => get(`${BASE}/buscar?q=${encodeURIComponent(q)}&${new URLSearchParams(p)}`),
  generos: () => get(`${BASE}/generos`),
  detalle: (id) => get(`${BASE}/${id}`),
  letraSync: (id) => get(`${BASE}/${id}/letra-sync`),
};
