import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Artistas() {
  const [artistas, setArtistas] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.listar({ limit: 85 }).then(d => {
      const canciones = d.canciones ?? d.data ?? [];
      const map = {};
      canciones.forEach(c => {
        if (!map[c.artista]) map[c.artista] = { nombre: c.artista, canciones: 0, genero: c.genero };
        map[c.artista].canciones++;
      });
      setArtistas(Object.values(map).sort((a, b) => b.canciones - a.canciones));
    });
  }, []);

  return (
    <>
      <div className="topbar">
        <h1 style={{ fontWeight: 700, margin: 0 }}>Artistas</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{artistas.length} artistas</span>
      </div>
      <div className="section">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1.25rem' }}>
          {artistas.map(a => (
            <div key={a.nombre}
              onClick={() => navigate(`/?artista=${encodeURIComponent(a.nombre)}`)}
              style={{
                background: 'var(--bg-elevated)',
                borderRadius: '50%',
                aspectRatio: '1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.15s',
                padding: '1rem',
                textAlign: 'center',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-highlight)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elevated)'}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.4rem' }}>🎤</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.2 }}>{a.nombre}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {a.canciones} {a.canciones === 1 ? 'canción' : 'canciones'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
