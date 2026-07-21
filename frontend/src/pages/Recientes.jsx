import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Recientes() {
  const [recientes, setRecientes] = useState([]);
  const [loading, setLoading]     = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const ids = (() => {
      try { return JSON.parse(localStorage.getItem('cc-recientes') || '[]'); }
      catch { return []; }
    })();

    if (!ids.length) { setLoading(false); return; }

    Promise.all(ids.slice(0, 20).map(id => api.detalle(id).catch(() => null)))
      .then(canciones => setRecientes(canciones.filter(Boolean)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>
  );

  if (!recientes.length) return (
    <>
      <div className="topbar"><h1 style={{ fontWeight: 700, margin: 0 }}>Recientes</h1></div>
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🕐</div>
        <div>Aún no has visto ninguna canción</div>
        <button onClick={() => navigate('/app')} style={{
          marginTop: '1.5rem', padding: '0.75rem 2rem',
          background: 'var(--accent)', border: 'none',
          borderRadius: 'var(--radius-full)', color: '#000',
          fontWeight: 700, cursor: 'pointer',
        }}>
          Explorar canciones
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="topbar">
        <h1 style={{ fontWeight: 700, margin: 0 }}>Recientes</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{recientes.length} canciones</span>
      </div>
      <div className="section">
        <div className="song-list">
          <div className="song-list-header">
            <span>#</span><span>TÍTULO</span><span>GÉNERO</span><span>DURACIÓN</span><span></span>
          </div>
          {recientes.map((c, i) => {
            const dur  = c.duracion_segundos || 180;
            const mins = Math.floor(dur / 60);
            const secs = (dur % 60).toString().padStart(2, '0');
            const badge = `genre-badge badge-${(c.genero || '').replace(/\s+/g, '-')}`;
            return (
              <div key={c.id} className="song-list-item" onClick={() => navigate(`/cancion/${c.id}`)}>
                <span className="song-num">{i + 1}</span>
                <div className="song-list-info">
                  <div className="song-list-title">{c.titulo}</div>
                  <div className="song-list-artist">{c.artista}</div>
                </div>
                <div className="song-list-genre">
                  <span className={badge}>{c.genero}</span>
                </div>
                <div className="song-duration">{mins}:{secs}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
