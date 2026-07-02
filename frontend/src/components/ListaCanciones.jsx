import { useNavigate } from 'react-router-dom';
import { GenreBadge } from './Buscador.jsx';

function duracion(seg) {
  if (!seg) return '--:--';
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
}

function SkeletonCard() {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="skeleton" style={{ height: 18, width: '70%', marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 14, width: '50%', marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="skeleton" style={{ height: 22, width: 70, borderRadius: 20 }} />
        <div className="skeleton" style={{ height: 22, width: 40 }} />
        <div className="skeleton" style={{ height: 22, width: 60 }} />
      </div>
    </div>
  );
}

function TarjetaCancion({ cancion }) {
  const nav = useNavigate();

  return (
    <article
      className="card"
      style={{ padding: 20, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12 }}
      onClick={() => nav(`/cancion/${cancion.id}`)}
    >
      {/* Header */}
      <div>
        <h3 style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 17,
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1.3,
          marginBottom: 4,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {cancion.titulo}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 }}>
          {cancion.artista}
        </p>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <GenreBadge genero={cancion.genero} />

        <span style={{
          fontSize: 12, color: 'var(--gold)',
          background: 'rgba(201,168,76,0.1)', padding: '2px 8px',
          borderRadius: 4, fontWeight: 600,
        }}>
          {cancion.tono}
        </span>

        {cancion.bpm && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            ♩ {cancion.bpm} BPM
          </span>
        )}

        <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 'auto' }}>
          {duracion(cancion.duracion_segundos)}
        </span>
      </div>

      {/* Popularity bar */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{
          height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${cancion.popularidad ?? 50}%`,
            background: 'linear-gradient(90deg, var(--wine), var(--gold))',
            borderRadius: 2,
          }} />
        </div>
      </div>

      {/* Play button */}
      <button
        className="btn btn-primary"
        style={{ marginTop: 4, justifyContent: 'center', width: '100%' }}
        onClick={e => { e.stopPropagation(); nav(`/cancion/${cancion.id}`); }}
      >
        ▶ Reproducir
      </button>
    </article>
  );
}

export default function ListaCanciones({ canciones, cargando, total, page, onPage }) {
  if (cargando) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (!canciones?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-dim)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎸</div>
        <p style={{ fontFamily: 'Playfair Display, serif', fontSize: 20 }}>
          No se encontraron canciones
        </p>
        <p style={{ fontSize: 14, marginTop: 8 }}>Intenta con otro término o género</p>
      </div>
    );
  }

  return (
    <div>
      {total != null && (
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
          {total} canciones encontradas
        </p>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16,
      }}>
        {canciones.map(c => <TarjetaCancion key={c.id} cancion={c} />)}
      </div>

      {/* Pagination */}
      {onPage && total > canciones.length && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32 }}>
          <button className="btn btn-ghost" onClick={() => onPage(page - 1)} disabled={page <= 1}>
            ← Anterior
          </button>
          <span style={{ padding: '8px 16px', fontSize: 14, color: 'var(--text-dim)' }}>
            Pág. {page}
          </span>
          <button className="btn btn-ghost" onClick={() => onPage(page + 1)}>
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
