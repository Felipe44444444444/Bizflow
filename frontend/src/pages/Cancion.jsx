import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import ReproductorPrincipal from '../components/ReproductorPrincipal.jsx';
import { GenreBadge } from '../components/Buscador.jsx';

function LetraSecciones({ letras }) {
  const [abierta, setAbierta] = useState(null);
  if (!letras || typeof letras !== 'object') return null;

  const secciones = Object.entries(letras);
  if (!secciones.length) return null;

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <h3 style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 15, fontWeight: 600 }}>
        Letra
      </h3>
      {secciones.map(([seccion, texto], i) => (
        <div key={seccion} style={{ borderBottom: i < secciones.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <button
            onClick={() => setAbierta(abierta === seccion ? null : seccion)}
            style={{
              width: '100%', padding: '12px 20px', background: 'none', border: 'none',
              color: 'var(--text)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', fontSize: 14, fontWeight: 600, textAlign: 'left',
            }}
          >
            <span>{seccion}</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', transform: abierta === seccion ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </button>
          {abierta === seccion && (
            <div style={{ padding: '0 20px 16px', fontSize: 14, lineHeight: 1.8, color: 'var(--text-dim)', whiteSpace: 'pre-line' }}>
              {Array.isArray(texto) ? texto.join('\n') : String(texto)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Cancion() {
  const { id }               = useParams();
  const navigate             = useNavigate();
  const [cancion, setCancion] = useState(null);
  const [error, setError]    = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    setCancion(null);
    setError(null);
    api.detalle(id)
      .then(setCancion)
      .catch(e => setError(e.message))
      .finally(() => setCargando(false));
  }, [id]);

  if (cargando) return (
    <main className="page" style={{ paddingTop: 40 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="skeleton" style={{ height: 32, width: 200 }} />
        <div className="skeleton" style={{ height: 20, width: 300 }} />
        <div className="skeleton" style={{ paddingBottom: '56.25%', borderRadius: 12 }} />
      </div>
    </main>
  );

  if (error || !cancion) return (
    <main className="page" style={{ paddingTop: 80, textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>😔</div>
      <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, marginBottom: 12 }}>
        Canción no encontrada
      </h2>
      <p style={{ color: 'var(--text-dim)', marginBottom: 24 }}>{error}</p>
      <button className="btn btn-primary" onClick={() => navigate('/')}>← Volver al catálogo</button>
    </main>
  );

  return (
    <main className="page" style={{ paddingTop: 32 }}>

      {/* ── Breadcrumb ──────────────────────────────────────────────────────── */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)', marginBottom: 24 }}>
        <Link to="/" style={{ color: 'var(--text-dim)' }}>Catálogo</Link>
        <span>›</span>
        <span style={{ color: 'var(--text)' }}>{cancion.artista}</span>
        <span>›</span>
        <span style={{ color: 'var(--gold)' }}>{cancion.titulo}</span>
      </nav>

      {/* ── Title block ─────────────────────────────────────────────────────── */}
      <header style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{
              fontFamily: 'Playfair Display, serif',
              fontSize: 'clamp(28px, 4vw, 48px)',
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              marginBottom: 8,
            }}>
              {cancion.titulo}
            </h1>
            <p style={{ fontSize: 20, color: 'var(--text-dim)', fontWeight: 500 }}>
              {cancion.artista}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
            <GenreBadge genero={cancion.genero} />

            <span style={{
              background: 'rgba(201,168,76,0.12)', color: 'var(--gold)',
              border: '1px solid rgba(201,168,76,0.3)',
              padding: '4px 12px', borderRadius: 6, fontSize: 14, fontWeight: 600,
            }}>
              🎵 {cancion.tono}
            </span>

            {cancion.bpm && (
              <span style={{
                background: 'var(--surface)', color: 'var(--text-dim)',
                border: '1px solid var(--border)',
                padding: '4px 12px', borderRadius: 6, fontSize: 14,
              }}>
                ♩ {cancion.bpm} BPM
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Player + chords ─────────────────────────────────────────────────── */}
      <ReproductorPrincipal cancion={cancion} />

      {/* ── Letra ───────────────────────────────────────────────────────────── */}
      {cancion.letra_por_seccion && (
        <section style={{ marginTop: 40 }}>
          <LetraSecciones letras={cancion.letra_por_seccion} />
        </section>
      )}

      {/* ── Back link ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
        <Link to="/" className="btn btn-ghost">
          ← Volver al catálogo
        </Link>
      </div>
    </main>
  );
}
