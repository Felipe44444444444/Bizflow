import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const KEY = 'conectachat_playlists';
const get = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const save = (p) => localStorage.setItem(KEY, JSON.stringify(p));

export default function Playlists() {
  const [playlists, setPlaylists] = useState(get());
  const [seleccionada, setSeleccionada] = useState(null);
  const navigate = useNavigate();

  const eliminarCancion = (plIdx, cancionId) => {
    const pls = [...playlists];
    pls[plIdx].canciones = pls[plIdx].canciones.filter(c => c.id !== cancionId);
    save(pls);
    setPlaylists(pls);
    if (seleccionada === plIdx && pls[plIdx].canciones.length === 0) {
      setSeleccionada(null);
    }
  };

  const eliminarPlaylist = (idx) => {
    const pls = playlists.filter((_, i) => i !== idx);
    save(pls);
    setPlaylists(pls);
    setSeleccionada(null);
  };

  if (playlists.length === 0) return (
    <>
      <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #1a1a1a', background: 'rgba(18,18,18,0.95)' }}>
        <h1 style={{ fontWeight: 700, fontSize: '1.5rem' }}>Tu biblioteca</h1>
      </div>
      <div style={{ padding: '4rem', textAlign: 'center', color: '#666' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎵</div>
        <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem', color: '#fff' }}>
          Crea tu primera playlist
        </div>
        <div style={{ marginBottom: '2rem' }}>Es fácil, la crearemos por ti.</div>
        <button onClick={() => navigate('/app')} style={{
          padding: '0.75rem 2rem', background: '#fff', border: 'none',
          borderRadius: 50, color: '#000', fontWeight: 700, cursor: 'pointer',
        }}>Explorar canciones</button>
      </div>
    </>
  );

  return (
    <>
      <div style={{
        padding: '1.5rem 2rem', borderBottom: '1px solid #1a1a1a',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <h1 style={{ fontWeight: 700, fontSize: '1.5rem' }}>Tu biblioteca</h1>
        <span style={{ color: '#999', fontSize: '0.85rem' }}>{playlists.length} playlists</span>
      </div>

      {seleccionada === null ? (
        <div style={{ padding: '1rem' }}>
          {playlists.map((pl, i) => (
            <div key={pl.id}
              onClick={() => setSeleccionada(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '0.75rem 1rem', borderRadius: 8, cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#282828'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{
                width: 52, height: 52, background: 'linear-gradient(135deg,#1DB954,#006630)',
                borderRadius: 4, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0,
              }}>🎵</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pl.nombre}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#999' }}>
                  Playlist • {pl.canciones.length} canciones
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); eliminarPlaylist(i); }}
                style={{
                  background: 'none', border: 'none', color: '#666', cursor: 'pointer',
                  fontSize: '1.2rem', padding: '0.25rem', opacity: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}>🗑</button>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div style={{ padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid #1a1a1a' }}>
            <button onClick={() => setSeleccionada(null)}
              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '1.25rem' }}>←</button>
            <div style={{
              width: 60, height: 60, background: 'linear-gradient(135deg,#1DB954,#006630)',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem',
            }}>🎵</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{playlists[seleccionada].nombre}</div>
              <div style={{ color: '#999', fontSize: '0.8rem' }}>{playlists[seleccionada].canciones.length} canciones</div>
            </div>
          </div>

          {playlists[seleccionada].canciones.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#666' }}>Esta playlist está vacía</div>
          ) : (
            <div style={{ padding: '1rem' }}>
              {playlists[seleccionada].canciones.map((c, j) => (
                <div key={c.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', borderRadius: 8, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#282828'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{
                    width: 32, height: 32, background: '#282828', borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#999', fontSize: '0.8rem', flexShrink: 0,
                  }}>{j + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }} onClick={() => navigate(`/cancion/${c.id}`)}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.titulo}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#999' }}>{c.artista}</div>
                  </div>
                  <button onClick={() => eliminarCancion(seleccionada, c.id)}
                    style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
