import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const GENERO_CONFIG = {
  corrido:           { emoji: '🤠', color: '#c0392b', bg: '#1a0000' },
  ranchera:          { emoji: '🌹', color: '#C9A84C', bg: '#1a1200' },
  banda:             { emoji: '🎺', color: '#1DB954', bg: '#0a1a0a' },
  'norteña':         { emoji: '🪗', color: '#6b9fff', bg: '#0a0a1a' },
  grupero:           { emoji: '🎹', color: '#d06bff', bg: '#1a0a1a' },
  'corrido tumbado': { emoji: '🔥', color: '#ff9f40', bg: '#1a1000' },
};

export default function Generos() {
  const [generos, setGeneros] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.generos().then(d => {
      const lista = (d.generos || d);
      setGeneros(Array.isArray(lista) ? lista : []);
    });
  }, []);

  return (
    <>
      <div className="topbar">
        <h1 style={{ fontWeight: 700, margin: 0 }}>Géneros</h1>
      </div>
      <div className="section">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem' }}>
          {generos.map(g => {
            const nombre = typeof g === 'string' ? g : g.genero;
            const count  = typeof g === 'string' ? '' : (g.count || '');
            const cfg    = GENERO_CONFIG[nombre] || { emoji: '🎵', color: '#aaa', bg: '#111' };
            return (
              <div key={nombre}
                onClick={() => navigate(`/?genero=${encodeURIComponent(nombre)}`)}
                style={{
                  background: `linear-gradient(135deg, ${cfg.bg} 0%, #0a0a0a 100%)`,
                  border: `1px solid ${cfg.color}40`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '2rem 1.5rem',
                  cursor: 'pointer',
                  transition: 'transform 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.borderColor = cfg.color;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.borderColor = `${cfg.color}40`;
                }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>{cfg.emoji}</div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: cfg.color }}>
                  {nombre.charAt(0).toUpperCase() + nombre.slice(1)}
                </div>
                {count && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {count} canciones
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
