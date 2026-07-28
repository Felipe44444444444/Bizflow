import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFavoritos } from '../hooks/useFavoritos.js';

const GENERO_EMOJI = {
  corrido: '🤠', ranchera: '🌹', banda: '🎺',
  'norteña': '🪗', grupero: '🎹', 'corrido tumbado': '🔥',
};

const GRADIENTES = [
  ['#8B0000', '#4a0000'], ['#1a3a00', '#0a2000'], ['#00234a', '#001020'],
  ['#3a2000', '#1a0f00'], ['#2a003a', '#15001a'], ['#003a3a', '#001515'],
  ['#3a0030', '#1a0015'], ['#1a1a3a', '#0a0a20'], ['#3a1a00', '#200f00'],
  ['#003a1a', '#001a0f'], ['#1a003a', '#0f001a'], ['#3a3a00', '#1a1a00'],
];

const PLAYLIST_STORAGE_KEY = 'conectachat_playlists';

function getPlaylists() {
  try { return JSON.parse(localStorage.getItem(PLAYLIST_STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function savePlaylists(pls) {
  localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(pls));
}

function ModalPlaylist({ onClose, onCrear }) {
  const [nombre, setNombre] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#282828', borderRadius: 16, padding: '2rem', width: 380,
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontWeight: 700, marginBottom: '1.5rem', fontSize: '1.25rem' }}>
          Nueva playlist
        </h2>
        <input
          autoFocus
          placeholder="Mi playlist #1"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && nombre.trim() && onCrear(nombre.trim())}
          style={{
            width: '100%', padding: '0.75rem 1rem',
            background: '#3e3e3e', border: 'none', borderRadius: 8,
            color: '#fff', fontSize: '1rem', marginBottom: '1rem', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '0.6rem 1.25rem', background: 'none',
            border: '1px solid #555', borderRadius: 50, color: '#ccc', cursor: 'pointer',
          }}>Cancelar</button>
          <button
            disabled={!nombre.trim()}
            onClick={() => nombre.trim() && onCrear(nombre.trim())}
            style={{
              padding: '0.6rem 1.5rem',
              background: nombre.trim() ? '#1DB954' : '#333',
              border: 'none', borderRadius: 50,
              color: nombre.trim() ? '#000' : '#666',
              fontWeight: 700, cursor: nombre.trim() ? 'pointer' : 'default',
            }}>
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalAgregarPlaylist({ cancion, onClose }) {
  const [playlists, setPlaylists] = useState(getPlaylists());
  const [creando, setCreando] = useState(false);
  const [feedback, setFeedback] = useState('');

  const agregarA = (idx) => {
    const pls = [...playlists];
    if (!pls[idx].canciones.find(c => c.id === cancion.id)) {
      pls[idx].canciones.push({
        id: cancion.id, titulo: cancion.titulo,
        artista: cancion.artista, genero: cancion.genero,
      });
      savePlaylists(pls);
      setPlaylists(pls);
    }
    setFeedback(`Agregado a "${pls[idx].nombre}"`);
    setTimeout(onClose, 800);
  };

  const crear = (nombre) => {
    const nueva = {
      id: Date.now(), nombre,
      canciones: [{
        id: cancion.id, titulo: cancion.titulo,
        artista: cancion.artista, genero: cancion.genero,
      }],
      creada: new Date().toISOString(),
    };
    const pls = [...playlists, nueva];
    savePlaylists(pls);
    setFeedback(`Playlist "${nombre}" creada`);
    setTimeout(onClose, 800);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#282828', borderRadius: 16, padding: '1.5rem',
        width: 340, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>
        {feedback ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#1DB954', fontWeight: 700 }}>
            ✓ {feedback}
          </div>
        ) : creando ? (
          <ModalPlaylist onClose={() => setCreando(false)} onCrear={crear} />
        ) : (
          <>
            <div style={{ fontWeight: 700, marginBottom: '1rem' }}>
              Agregar a playlist
            </div>
            <div style={{
              fontSize: '0.8rem', color: '#999', marginBottom: '1rem',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {cancion.titulo} — {cancion.artista}
            </div>
            <button onClick={() => setCreando(true)} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.75rem', background: 'none', border: '1px dashed #555',
              borderRadius: 8, color: '#fff', cursor: 'pointer', marginBottom: '0.5rem',
              width: '100%', textAlign: 'left',
            }}>
              <span style={{
                fontSize: '1.25rem', width: 32, height: 32, background: '#3e3e3e',
                borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>+</span>
              Nueva playlist
            </button>
            <div style={{ overflowY: 'auto', maxHeight: '300px' }}>
              {playlists.length === 0 && (
                <div style={{ color: '#666', fontSize: '0.85rem', padding: '1rem', textAlign: 'center' }}>
                  No tienes playlists todavía
                </div>
              )}
              {playlists.map((pl, i) => (
                <button key={pl.id} onClick={() => agregarA(i)} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem', background: 'none', border: 'none',
                  color: '#fff', cursor: 'pointer', width: '100%',
                  textAlign: 'left', borderRadius: 8, transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#3e3e3e'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <div style={{
                    width: 32, height: 32, background: '#1DB954', borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.9rem', flexShrink: 0,
                  }}>🎵</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.875rem', fontWeight: 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{pl.nombre}</div>
                    <div style={{ fontSize: '0.75rem', color: '#999' }}>
                      {pl.canciones.length} canciones
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SongCard({ cancion, index, onPlay, onAddToPlaylist }) {
  const [grad] = useState(GRADIENTES[index % GRADIENTES.length]);
  const [hovered, setHovered] = useState(false);
  const { esFavorito, toggleFavorito } = useFavoritos();
  const fav = esFavorito(cancion.id);
  const emoji = GENERO_EMOJI[cancion.genero] || '🎵';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#282828' : '#181818',
        borderRadius: 12, padding: '1rem',
        cursor: 'pointer', transition: 'background 0.2s',
        position: 'relative',
      }}>
      <div
        onClick={() => onPlay(cancion)}
        style={{
          width: '100%', aspectRatio: '1',
          background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})`,
          borderRadius: 8, marginBottom: '0.75rem',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '2.5rem',
          position: 'relative', overflow: 'hidden',
        }}>
        {emoji}
        {hovered && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            width: 40, height: 40, background: '#1DB954',
            borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontSize: '1rem', color: '#000',
          }}>▶</div>
        )}
      </div>

      <div onClick={() => onPlay(cancion)}>
        <div style={{
          fontWeight: 700, fontSize: '0.9rem',
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', marginBottom: '0.25rem',
        }}>{cancion.titulo}</div>
        <div style={{
          fontSize: '0.8rem', color: '#999',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{cancion.artista}</div>
      </div>

      {hovered && (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={e => { e.stopPropagation(); toggleFavorito(cancion); }}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(0,0,0,0.7)', border: 'none',
              color: fav ? '#1DB954' : '#fff',
              cursor: 'pointer', fontSize: '0.8rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {fav ? '♥' : '♡'}
          </button>
          <button
            onClick={e => { e.stopPropagation(); onAddToPlaylist(cancion); }}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(0,0,0,0.7)', border: 'none',
              color: '#fff', cursor: 'pointer', fontSize: '1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            ⋯
          </button>
        </div>
      )}
    </div>
  );
}

function SongRow({ cancion, index, onPlay, onAddToPlaylist }) {
  const [hovered, setHovered] = useState(false);
  const { esFavorito, toggleFavorito } = useFavoritos();
  const fav = esFavorito(cancion.id);
  const mins = Math.floor((cancion.duracion_segundos || 180) / 60);
  const secs = ((cancion.duracion_segundos || 180) % 60).toString().padStart(2, '0');

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onPlay(cancion)}
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr auto auto 60px',
        alignItems: 'center', gap: '1rem',
        padding: '0.5rem 1rem', borderRadius: 6,
        background: hovered ? '#282828' : 'transparent',
        cursor: 'pointer', transition: 'background 0.1s',
      }}>
      <div style={{ color: '#999', fontSize: '0.9rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
        {hovered ? <span style={{ color: '#fff' }}>▶</span> : <span>{index + 1}</span>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontWeight: 500, fontSize: '0.9rem',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{cancion.titulo}</div>
        <div style={{
          fontSize: '0.8rem', color: '#999',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{cancion.artista}</div>
      </div>
      <div>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px',
          borderRadius: 50, textTransform: 'uppercase',
          background: cancion.genero === 'corrido' ? '#1a0000' :
                      cancion.genero === 'ranchera' ? '#1a1200' :
                      cancion.genero === 'banda' ? '#0a1a0a' :
                      cancion.genero === 'norteña' ? '#0a0a1a' : '#1a0a1a',
          color: cancion.genero === 'corrido' ? '#ff6b6b' :
                 cancion.genero === 'ranchera' ? '#C9A84C' :
                 cancion.genero === 'banda' ? '#1DB954' :
                 cancion.genero === 'norteña' ? '#6b9fff' : '#d06bff',
          border: `1px solid ${
            cancion.genero === 'corrido' ? '#ff6b6b40' :
            cancion.genero === 'ranchera' ? '#C9A84C40' :
            cancion.genero === 'banda' ? '#1DB95440' :
            cancion.genero === 'norteña' ? '#6b9fff40' : '#d06bff40'
          }`,
        }}>{cancion.genero}</span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {hovered && (
          <>
            <button onClick={e => { e.stopPropagation(); toggleFavorito(cancion); }}
              style={{ background: 'none', border: 'none', color: fav ? '#1DB954' : '#999', cursor: 'pointer', fontSize: '1rem' }}>
              {fav ? '♥' : '♡'}
            </button>
            <button onClick={e => { e.stopPropagation(); onAddToPlaylist(cancion); }}
              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '1rem' }}>⋯</button>
          </>
        )}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#999', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {mins}:{secs}
      </div>
    </div>
  );
}

export default function Home({ favoritos: soloFavoritos }) {
  const [canciones, setCanciones] = useState([]);
  const [generos, setGeneros] = useState([]);
  const [generoActivo, setGeneroActivo] = useState('todos');
  const [query, setQuery] = useState('');
  const [vista, setVista] = useState('grid');
  const [loading, setLoading] = useState(true);
  const [modalPlaylist, setModalPlaylist] = useState(null);
  const [mostrarCrearPlaylist, setMostrarCrearPlaylist] = useState(false);
  const navigate = useNavigate();
  const { favoritos } = useFavoritos();
  const debounceRef = useRef(null);

  useEffect(() => {
    api.generos().then(data => {
      const lista = (data.generos || data)
        .map(x => (typeof x === 'string' ? x : x.genero))
        .filter(Boolean);
      setGeneros(['todos', ...lista]);
    }).catch(() => {});
  }, []);

  const cargar = useCallback(async (genero = 'todos', q = '') => {
    setLoading(true);
    try {
      let data;
      if (q.trim()) {
        data = await api.buscar(q.trim(), { genero: genero !== 'todos' ? genero : undefined });
      } else {
        data = await api.listar({ genero: genero !== 'todos' ? genero : undefined, limit: 85 });
      }
      let lista = data.canciones ?? data.data ?? [];
      if (soloFavoritos) {
        const favIds = new Set(favoritos.map(f => f.id));
        lista = lista.filter(c => favIds.has(c.id));
      }
      setCanciones(lista);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [soloFavoritos, favoritos]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => cargar(generoActivo, query), query ? 300 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [query, generoActivo, cargar]);

  const handlePlay = (c) => navigate(`/cancion/${c.id}`);

  const handleCrearPlaylist = (nombre) => {
    const pls = getPlaylists();
    pls.push({ id: Date.now(), nombre, canciones: [], creada: new Date().toISOString() });
    savePlaylists(pls);
    setMostrarCrearPlaylist(false);
  };

  const mostrarHero = !query && generoActivo === 'todos' && !soloFavoritos;
  const destacadas = mostrarHero ? canciones.slice(0, 6) : [];
  const resto = mostrarHero ? canciones.slice(6) : canciones;

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 2rem', position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(18,18,18,0.95)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid #1a1a1a',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          background: '#fff', borderRadius: 50, padding: '0.6rem 1rem', width: 340,
        }}>
          <span style={{ color: '#000', fontSize: '0.9rem' }}>🔍</span>
          <input
            placeholder="¿Qué quieres tocar?"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', color: '#000', fontSize: '0.875rem', width: '100%' }}
          />
          {query && (
            <button onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => setMostrarCrearPlaylist(true)}
            style={{
              padding: '0.5rem 1rem', background: 'none', border: '1px solid #555',
              borderRadius: 50, color: '#ccc', cursor: 'pointer', fontSize: '0.8rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>+ Playlist</button>
          <button onClick={() => setVista('grid')} style={{
            width: 36, height: 36, borderRadius: 6,
            background: vista === 'grid' ? '#282828' : 'none',
            border: 'none', color: vista === 'grid' ? '#fff' : '#999',
            cursor: 'pointer', fontSize: '1rem',
          }}>⊞</button>
          <button onClick={() => setVista('list')} style={{
            width: 36, height: 36, borderRadius: 6,
            background: vista === 'list' ? '#282828' : 'none',
            border: 'none', color: vista === 'list' ? '#fff' : '#999',
            cursor: 'pointer', fontSize: '1rem',
          }}>☰</button>
        </div>
      </div>

      {!soloFavoritos && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: '1rem 2rem 0' }}>
          {generos.map(g => {
            const activo = generoActivo === g;
            return (
              <button key={g} onClick={() => setGeneroActivo(g)} style={{
                padding: '0.4rem 1rem', borderRadius: 50,
                background: activo ? '#fff' : '#282828',
                color: activo ? '#000' : '#ccc',
                border: activo ? 'none' : '1px solid #444',
                fontWeight: activo ? 700 : 500,
                fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}>
                {GENERO_EMOJI[g] || ''} {g === 'todos' ? 'Todos' : g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            );
          })}
        </div>
      )}

      {mostrarHero && (
        <div style={{ padding: '2rem 2rem 0' }}>
          <div style={{
            color: '#999', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: '0.5rem',
          }}>Regional Mexicano</div>
          <h1 style={{
            fontFamily: 'Playfair Display, serif', fontSize: 'clamp(2rem,5vw,3.5rem)',
            fontWeight: 700, lineHeight: 1.1, marginBottom: '0.5rem',
          }}>Toca como los grandes</h1>
          <p style={{ color: '#999', marginBottom: 0 }}>
            {canciones.length} canciones con acordes sincronizados
          </p>
        </div>
      )}

      {soloFavoritos && (
        <div style={{ padding: '2rem 2rem 0' }}>
          <h1 style={{ fontFamily: 'Playfair Display,serif', fontSize: '2rem', fontWeight: 700 }}>❤️ Favoritos</h1>
          <p style={{ color: '#999', marginTop: '0.5rem' }}>{canciones.length} canciones guardadas</p>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '1.5rem', padding: '2rem' }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ background: '#282828', borderRadius: 12, aspectRatio: '1', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : canciones.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#666' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎵</div>
          <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            {query ? `Sin resultados para "${query}"` : 'No hay canciones aquí'}
          </div>
          {soloFavoritos && (
            <button onClick={() => navigate('/app')} style={{
              marginTop: '1rem', padding: '0.75rem 2rem',
              background: '#1DB954', border: 'none', borderRadius: 50,
              color: '#000', fontWeight: 700, cursor: 'pointer',
            }}>Explorar canciones</button>
          )}
        </div>
      ) : vista === 'grid' ? (
        <>
          {mostrarHero && destacadas.length > 0 && (
            <div style={{ padding: '2rem 2rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontWeight: 700, fontSize: '1.25rem' }}>🔥 Más populares</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '1rem' }}>
                {destacadas.map((c, i) => (
                  <SongCard key={c.id} cancion={c} index={i} onPlay={handlePlay} onAddToPlaylist={setModalPlaylist} />
                ))}
              </div>
            </div>
          )}
          <div style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.25rem' }}>
                {query ? `Resultados para "${query}"` :
                 generoActivo === 'todos' ? 'Todo el catálogo' :
                 (GENERO_EMOJI[generoActivo] || '') + ' ' + generoActivo.charAt(0).toUpperCase() + generoActivo.slice(1)}
              </h2>
              <span style={{ color: '#999', fontSize: '0.85rem' }}>{resto.length} canciones</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '1rem' }}>
              {resto.map((c, i) => (
                <SongCard key={c.id} cancion={c} index={i} onPlay={handlePlay} onAddToPlaylist={setModalPlaylist} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.25rem' }}>
              {query ? `"${query}"` : generoActivo === 'todos' ? 'Todas las canciones' : generoActivo.charAt(0).toUpperCase() + generoActivo.slice(1)}
            </h2>
            <span style={{ color: '#999', fontSize: '0.85rem' }}>{canciones.length} canciones</span>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '40px 1fr auto auto 60px',
            padding: '0 1rem 0.5rem', color: '#666', fontSize: '0.75rem',
            fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            borderBottom: '1px solid #282828', marginBottom: '0.5rem',
          }}>
            <span style={{ textAlign: 'center' }}>#</span>
            <span>TÍTULO</span>
            <span>GÉNERO</span>
            <span></span>
            <span style={{ textAlign: 'right' }}>⏱</span>
          </div>
          {canciones.map((c, i) => (
            <SongRow key={c.id} cancion={c} index={i} onPlay={handlePlay} onAddToPlaylist={setModalPlaylist} />
          ))}
        </div>
      )}

      {modalPlaylist && (
        <ModalAgregarPlaylist cancion={modalPlaylist} onClose={() => setModalPlaylist(null)} />
      )}
      {mostrarCrearPlaylist && (
        <ModalPlaylist onClose={() => setMostrarCrearPlaylist(false)} onCrear={handleCrearPlaylist} />
      )}
    </>
  );
}
