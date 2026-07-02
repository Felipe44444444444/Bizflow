import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const GENEROS = ['corrido', 'corrido tumbado', 'ranchera', 'banda', 'norteña', 'grupero'];

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export default function Buscador({ onSearch, onGeneroChange, generoActivo }) {
  const [query, setQuery]           = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [abierto, setAbierto]       = useState(false);
  const [cargando, setCargando]     = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const buscarSugerencias = useCallback(
    debounce(async (q) => {
      if (q.length < 2) { setSugerencias([]); return; }
      setCargando(true);
      try {
        const data = await api.buscar(q, { limit: 6 });
        setSugerencias(data.canciones ?? []);
        setAbierto(true);
      } catch {
        setSugerencias([]);
      } finally {
        setCargando(false);
      }
    }, 280),
    []
  );

  useEffect(() => {
    buscarSugerencias(query);
    if (query.length === 0) {
      setSugerencias([]);
      setAbierto(false);
      onSearch?.('');
    }
  }, [query]);

  function handleSubmit(e) {
    e.preventDefault();
    setAbierto(false);
    onSearch?.(query);
  }

  function handleSugerencia(cancion) {
    setQuery('');
    setSugerencias([]);
    setAbierto(false);
    navigate(`/cancion/${cancion.id}`);
  }

  function handleClickFuera(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setAbierto(false);
  }

  return (
    <div style={{ width: '100%', maxWidth: 720 }}>
      {/* ── Search form ──────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} style={{ position: 'relative' }} onBlur={handleClickFuera}>
        <div style={{ display: 'flex', gap: 0 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              fontSize: 18, pointerEvents: 'none',
            }}>🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar canción o artista…"
              autoComplete="off"
              style={{
                width: '100%',
                padding: '14px 14px 14px 44px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRight: 'none',
                borderRadius: '10px 0 0 10px',
                color: 'var(--text)',
                fontSize: 16,
                outline: 'none',
                fontFamily: 'Inter, sans-serif',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'var(--gold-dim)';
                if (sugerencias.length > 0) setAbierto(true);
              }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
            />
            {cargando && (
              <span style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                width: 16, height: 16, border: '2px solid var(--gold)',
                borderTopColor: 'transparent', borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
              }} />
            )}
          </div>
          <button type="submit" className="btn btn-primary" style={{ borderRadius: '0 10px 10px 0', padding: '0 20px' }}>
            Buscar
          </button>
        </div>

        {/* ── Autocomplete dropdown ───────────────────────────────────────── */}
        {abierto && sugerencias.length > 0 && (
          <ul style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderTop: 'none', borderRadius: '0 0 10px 10px',
            listStyle: 'none', margin: 0, padding: '4px 0',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}>
            {sugerencias.map(c => (
              <li
                key={c.id}
                onMouseDown={() => handleSugerencia(c)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 20 }}>🎵</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.titulo}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {c.artista} · {c.tono} · {c.bpm} BPM
                  </div>
                </div>
                <GenreBadge genero={c.genero} />
              </li>
            ))}
          </ul>
        )}
      </form>

      {/* ── Genre filters ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button
          className={`btn btn-ghost`}
          style={{
            fontSize: 12, padding: '5px 14px',
            ...(generoActivo === '' ? { borderColor: 'var(--gold)', color: 'var(--gold)' } : {}),
          }}
          onClick={() => onGeneroChange?.('')}
        >
          Todos
        </button>
        {GENEROS.map(g => (
          <button
            key={g}
            className="btn btn-ghost"
            style={{
              fontSize: 12, padding: '5px 14px', textTransform: 'capitalize',
              ...(generoActivo === g ? { borderColor: 'var(--gold)', color: 'var(--gold)' } : {}),
            }}
            onClick={() => onGeneroChange?.(g)}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GenreBadge({ genero }) {
  const slug = (genero ?? '').toLowerCase().replace(/\s+/g, '-');
  const cls  = `badge badge-${slug}` in document.documentElement.style
    ? `badge badge-${slug}`
    : `badge badge-${['corrido','corrido-tumbado','ranchera','banda','norteña','grupero'].includes(slug) ? slug : 'default'}`;

  const map = {
    corrido:           'badge-corrido',
    'corrido-tumbado': 'badge-corrido-tumbado',
    ranchera:          'badge-ranchera',
    banda:             'badge-banda',
    'norteña':         'badge-norteña',
    grupero:           'badge-grupero',
  };
  return <span className={`badge ${map[slug] ?? 'badge-default'}`}>{genero}</span>;
}
