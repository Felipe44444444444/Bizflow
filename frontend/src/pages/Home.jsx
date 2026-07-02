import { useState, useEffect, useCallback } from 'react';
import Buscador from '../components/Buscador.jsx';
import ListaCanciones from '../components/ListaCanciones.jsx';
import { api } from '../api.js';

const LIMIT = 20;

export default function Home() {
  const [canciones, setCanciones] = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [cargando, setCargando]   = useState(true);
  const [query, setQuery]         = useState('');
  const [genero, setGenero]       = useState('');

  const cargar = useCallback(async (q, g, p) => {
    setCargando(true);
    try {
      let data;
      if (q) {
        data = await api.buscar(q, { genero: g || undefined, page: p, limit: LIMIT });
      } else {
        data = await api.listar({ genero: g || undefined, page: p, limit: LIMIT });
      }
      setCanciones(data.canciones ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(query, genero, page); }, [query, genero, page]);

  function handleSearch(q) {
    setQuery(q);
    setPage(1);
  }

  function handleGenero(g) {
    setGenero(g);
    setPage(1);
  }

  return (
    <main className="page" style={{ paddingTop: 48 }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{
          display: 'inline-block',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
          background: 'rgba(201,168,76,0.08)',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 20,
          padding: '4px 14px',
          marginBottom: 20,
        }}>
          Regional Mexicano
        </div>

        <h1 style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 'clamp(36px, 6vw, 72px)',
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          marginBottom: 16,
        }}>
          Tu{' '}
          <span style={{
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundImage: 'linear-gradient(135deg, var(--wine-light), var(--gold))',
            backgroundClip: 'text',
          }}>
            acordes
          </span>{' '}
          en el momento exacto
        </h1>

        <p style={{ fontSize: 18, color: 'var(--text-dim)', maxWidth: 520, margin: '0 auto 36px' }}>
          Aprende corridos, rancheras y bandas. Acordes sincronizados con el video.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Buscador
            onSearch={handleSearch}
            onGeneroChange={handleGenero}
            generoActivo={genero}
          />
        </div>
      </section>

      {/* ── Decorative divider ────────────────────────────────────────────── */}
      <div style={{
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--wine), var(--gold), var(--wine), transparent)',
        marginBottom: 36,
        opacity: 0.4,
      }} />

      {/* ── Catalog ───────────────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, fontWeight: 700 }}>
            {query ? `"${query}"` : genero ? genero.charAt(0).toUpperCase() + genero.slice(1) : 'Catálogo'}
          </h2>
          {!cargando && (
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {total} canciones
            </span>
          )}
        </div>

        <ListaCanciones
          canciones={canciones}
          cargando={cargando}
          total={total}
          page={page}
          onPage={setPage}
        />
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{
        marginTop: 80,
        paddingTop: 32,
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
        color: 'var(--text-dim)',
        fontSize: 13,
      }}>
        <p style={{ fontFamily: 'Playfair Display, serif', fontSize: 18, color: 'var(--gold)', marginBottom: 8 }}>
          ConnectaChat
        </p>
        <p>Música Regional Mexicana · Aprende con acordes en tiempo real</p>
      </footer>
    </main>
  );
}
