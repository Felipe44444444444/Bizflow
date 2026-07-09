import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const GENERO_EMOJI = {
  corrido: '🤠',
  ranchera: '🌹',
  banda: '🎺',
  'norteña': '🪗',
  grupero: '🎹',
  'corrido tumbado': '🔥',
};

const GRADIENTES = [
  'linear-gradient(135deg, #8B0000 0%, #1a0000 100%)',
  'linear-gradient(135deg, #1a3a1a 0%, #0a1a0a 100%)',
  'linear-gradient(135deg, #1a1a3a 0%, #0a0a1a 100%)',
  'linear-gradient(135deg, #3a2000 0%, #1a0a00 100%)',
  'linear-gradient(135deg, #2a0a2a 0%, #1a001a 100%)',
  'linear-gradient(135deg, #003a3a 0%, #001a1a 100%)',
];

function useFavoritos() {
  const [favs, setFavs] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cc-favs') || '[]')); }
    catch { return new Set(); }
  });
  const toggle = useCallback((id) => {
    setFavs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem('cc-favs', JSON.stringify([...next]));
      return next;
    });
  }, []);
  return [favs, toggle];
}

function HeartIcon({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>
  );
}

function SongCard({ cancion, index, onPlay, favs, onFav }) {
  const isFav = favs.has(cancion.id);
  return (
    <div className="song-card" onClick={() => onPlay(cancion)}>
      <div className="song-cover" style={{ background: GRADIENTES[index % GRADIENTES.length] }}>
        <span>{GENERO_EMOJI[cancion.genero] || '🎵'}</span>
        <div className="play-btn-overlay">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
      <div className="song-card-title">{cancion.titulo}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div className="song-card-artist">{cancion.artista}</div>
        <button className={`fav-btn ${isFav ? 'active' : ''}`}
          onClick={e => { e.stopPropagation(); onFav(cancion.id); }}>
          <HeartIcon filled={isFav} />
        </button>
      </div>
    </div>
  );
}

function SongListItem({ cancion, index, onPlay, favs, onFav }) {
  const isFav = favs.has(cancion.id);
  const dur = cancion.duracion_segundos || 180;
  const mins = Math.floor(dur / 60);
  const secs = (dur % 60).toString().padStart(2, '0');
  const badgeClass = `genre-badge badge-${(cancion.genero || '').replace(/\s+/g, '-')}`;

  return (
    <div className="song-list-item" onClick={() => onPlay(cancion)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="song-num">{index + 1}</span>
        <span className="play-inline" style={{ display: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </span>
      </div>
      <div className="song-list-info">
        <div className="song-list-title">{cancion.titulo}</div>
        <div className="song-list-artist">{cancion.artista}</div>
      </div>
      <div className="song-list-genre"><span className={badgeClass}>{cancion.genero}</span></div>
      <div className="song-duration">{mins}:{secs}</div>
      <button className={`fav-btn ${isFav ? 'active' : ''}`}
        onClick={e => { e.stopPropagation(); onFav(cancion.id); }}>
        <HeartIcon filled={isFav} />
      </button>
    </div>
  );
}

export default function Home({ favoritos: mostrarFavs }) {
  const [canciones, setCanciones]     = useState([]);
  const [generos, setGeneros]         = useState([]);
  const [generoActivo, setGeneroActivo] = useState('todos');
  const [query, setQuery]             = useState('');
  const [vista, setVista]             = useState('grid');
  const [loading, setLoading]         = useState(true);
  const [favs, toggleFav]             = useFavoritos();
  const navigate = useNavigate();

  useEffect(() => {
    api.generos().then(data => {
      const lista = (data.generos || data)
        .map(x => (typeof x === 'string' ? x : x.genero))
        .filter(Boolean);
      setGeneros(['todos', ...lista]);
    }).catch(() => {});
  }, []);

  const cargar = useCallback(async (genero, q) => {
    setLoading(true);
    try {
      let data;
      if (q?.trim()) {
        data = await api.buscar(q.trim(), { genero: genero !== 'todos' ? genero : undefined });
      } else {
        data = await api.listar({ genero: genero !== 'todos' ? genero : undefined, limit: 85 });
      }
      setCanciones(data.canciones ?? data.data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => cargar(generoActivo, query), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, generoActivo, cargar]);

  const handlePlay = (c) => navigate(`/cancion/${c.id}`);
  const lista = mostrarFavs ? canciones.filter(c => favs.has(c.id)) : canciones;
  const destacadas = (!query && generoActivo === 'todos' && !mostrarFavs) ? lista.slice(0, 6) : [];
  const resto = destacadas.length ? lista.slice(6) : lista;

  return (
    <>
      <div className="topbar">
        <div className="search-bar">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input
            placeholder="Buscar canciones, artistas..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`speed-btn ${vista === 'grid' ? 'active' : ''}`} onClick={() => setVista('grid')}>⊞ Grid</button>
          <button className={`speed-btn ${vista === 'list' ? 'active' : ''}`} onClick={() => setVista('list')}>☰ Lista</button>
        </div>
      </div>

      {!query && generoActivo === 'todos' && !mostrarFavs && (
        <div className="hero-section">
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', letterSpacing: '0.08em' }}>🎸 Regional Mexicano</div>
          <h1 className="hero-title">Toca como los grandes</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.25rem' }}>{canciones.length} canciones con acordes sincronizados</p>
        </div>
      )}

      {mostrarFavs && (
        <div className="hero-section">
          <h1 className="hero-title">❤️ Favoritos</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.25rem' }}>{lista.length} canciones guardadas</p>
        </div>
      )}

      {!mostrarFavs && (
        <div className="genre-pills">
          {generos.map(g => (
            <button key={g} className={`genre-pill ${generoActivo === g ? 'active' : ''}`}
              onClick={() => setGeneroActivo(g)}>
              {GENERO_EMOJI[g] || ''} {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '1.25rem 2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '1.25rem' }}>
          {[...Array(12)].map((_, i) => (
            <div key={i}>
              <div className="skeleton" style={{ aspectRatio: '1', borderRadius: 'var(--radius-sm)', marginBottom: '0.875rem' }}/>
              <div className="skeleton" style={{ height: 14, marginBottom: 6, width: '80%' }}/>
              <div className="skeleton" style={{ height: 12, width: '60%' }}/>
            </div>
          ))}
        </div>
      ) : vista === 'grid' ? (
        <>
          {destacadas.length > 0 && (
            <div className="section">
              <div className="section-header"><h2 className="section-title">🔥 Más populares</h2></div>
              <div className="song-grid">
                {destacadas.map((c, i) => <SongCard key={c.id} cancion={c} index={i} onPlay={handlePlay} favs={favs} onFav={toggleFav}/>)}
              </div>
            </div>
          )}
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">
                {mostrarFavs ? 'Mis favoritos'
                  : query ? `Resultados para "${query}"`
                  : generoActivo !== 'todos' ? generoActivo.charAt(0).toUpperCase() + generoActivo.slice(1)
                  : 'Todo el catálogo'}
              </h2>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{lista.length} canciones</span>
            </div>
            <div className="song-grid">
              {resto.map((c, i) => <SongCard key={c.id} cancion={c} index={i} onPlay={handlePlay} favs={favs} onFav={toggleFav}/>)}
            </div>
            {lista.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                {mostrarFavs ? 'Aún no tienes favoritos. Haz clic en ❤️ en cualquier canción.' : 'No se encontraron canciones.'}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">
              {mostrarFavs ? 'Mis favoritos' : query ? `"${query}"` : generoActivo !== 'todos' ? generoActivo : 'Todas las canciones'}
            </h2>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{lista.length} canciones</span>
          </div>
          <div className="song-list">
            <div className="song-list-header">
              <span>#</span><span>TÍTULO</span><span>GÉNERO</span><span>DURACIÓN</span><span></span>
            </div>
            {lista.map((c, i) => <SongListItem key={c.id} cancion={c} index={i} onPlay={handlePlay} favs={favs} onFav={toggleFav}/>)}
            {lista.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                {mostrarFavs ? 'Aún no tienes favoritos.' : 'No se encontraron canciones.'}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
