import { useState, useEffect } from 'react';
import { api } from '../api.js';

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api/canciones';

export default function AdminLetras() {
  const [canciones, setCanciones]       = useState([]);
  const [seleccionada, setSeleccionada] = useState(null);
  const [letra, setLetra]               = useState({});
  const [guardando, setGuardando]       = useState(false);
  const [msg, setMsg]                   = useState('');
  const [filtro, setFiltro]             = useState('');

  useEffect(() => {
    api.listar({ limit: 85 }).then(d => setCanciones(d.canciones ?? d.data ?? []));
  }, []);

  const seleccionar = async (c) => {
    const detalle = await api.detalle(c.id);
    setSeleccionada(detalle);
    setLetra(detalle.letra_por_seccion || {});
    setMsg('');
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await fetch(`${API_BASE}/${seleccionada.id}/letra`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letra_por_seccion: letra }),
      });
      setMsg(r.ok ? '✓ Guardado correctamente' : '✗ Error al guardar');
    } catch {
      setMsg('✗ Error de conexión');
    }
    setGuardando(false);
  };

  const agregarSeccion = () => {
    const nombre = prompt('Nombre de la sección (ej: Coro, Verso 1):');
    if (nombre) setLetra(l => ({ ...l, [nombre]: '' }));
  };

  const eliminarSeccion = (sec) => {
    setLetra(l => { const n = { ...l }; delete n[sec]; return n; });
  };

  const filtradas = canciones.filter(c =>
    c.titulo.toLowerCase().includes(filtro.toLowerCase()) ||
    c.artista.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: '100vh', background: 'var(--bg-base)' }}>

      {/* LISTA */}
      <div style={{ background: '#000', overflowY: 'auto', borderRight: '1px solid #222' }}>
        <div style={{ padding: '1rem', position: 'sticky', top: 0, background: '#000', zIndex: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: '0.75rem', color: 'var(--accent)' }}>
            Admin Letras
          </div>
          <input
            placeholder="Buscar canción..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            style={{
              width: '100%', padding: '0.5rem 0.75rem',
              background: 'var(--bg-highlight)', border: '1px solid #333',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              fontSize: '0.8rem', boxSizing: 'border-box',
            }}
          />
        </div>
        {filtradas.map(c => (
          <div key={c.id} onClick={() => seleccionar(c)}
            style={{
              padding: '0.75rem 1rem', cursor: 'pointer',
              background: seleccionada?.id === c.id ? 'var(--bg-highlight)' : 'transparent',
              borderLeft: seleccionada?.id === c.id ? '3px solid var(--accent)' : '3px solid transparent',
              transition: 'all 0.1s',
            }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{c.titulo}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.artista}</div>
          </div>
        ))}
      </div>

      {/* EDITOR */}
      <div style={{ overflowY: 'auto', padding: '2rem' }}>
        {!seleccionada ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '4rem' }}>
            Selecciona una canción para editar su letra
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontWeight: 700, margin: 0 }}>{seleccionada.titulo}</h2>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>{seleccionada.artista}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {msg && (
                  <span style={{ color: msg.startsWith('✓') ? 'var(--accent)' : '#ff6b6b', fontSize: '0.85rem' }}>
                    {msg}
                  </span>
                )}
                <button onClick={agregarSeccion} style={{
                  padding: '0.5rem 1rem', background: 'var(--bg-highlight)',
                  border: '1px solid #444', borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem',
                }}>
                  + Sección
                </button>
                <button onClick={guardar} disabled={guardando} style={{
                  padding: '0.5rem 1.5rem', background: 'var(--accent)',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
                }}>
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              💡 Pega la letra desde{' '}
              <a
                href={`https://genius.com/search?q=${encodeURIComponent(seleccionada.titulo + ' ' + seleccionada.artista)}`}
                target="_blank" rel="noreferrer"
                style={{ color: 'var(--accent)' }}>
                Genius
              </a>{' '}o{' '}
              <a
                href={`https://www.letras.com/buscar/?q=${encodeURIComponent(seleccionada.titulo)}`}
                target="_blank" rel="noreferrer"
                style={{ color: 'var(--accent)' }}>
                Letras.com
              </a>
            </div>

            {Object.entries(letra).map(([seccion, texto]) => (
              <div key={seccion} style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <label style={{
                    fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                  }}>
                    {seccion}
                  </label>
                  <button onClick={() => eliminarSeccion(seccion)}
                    style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '0.75rem' }}>
                    Eliminar
                  </button>
                </div>
                <textarea
                  value={texto}
                  onChange={e => setLetra(l => ({ ...l, [seccion]: e.target.value }))}
                  rows={Math.max(4, texto.split('\n').length + 1)}
                  style={{
                    width: '100%', padding: '0.75rem',
                    background: 'var(--bg-elevated)', border: '1px solid #333',
                    borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                    fontSize: '0.9rem', lineHeight: 1.6, resize: 'vertical',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
