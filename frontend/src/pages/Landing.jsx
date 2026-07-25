import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { signInWithGoogle, signOut } from '../lib/supabase.js';

const ARTISTAS_DESTACADOS = [
  { nombre: 'Vicente Fernández', emoji: '🎩', genero: 'Ranchera' },
  { nombre: 'Peso Pluma', emoji: '🔥', genero: 'Corrido Tumbado' },
  { nombre: 'Banda MS', emoji: '🎺', genero: 'Banda' },
  { nombre: 'Los Tigres del Norte', emoji: '🤠', genero: 'Norteña' },
  { nombre: 'Christian Nodal', emoji: '🌹', genero: 'Ranchera Moderna' },
  { nombre: 'Grupo Firme', emoji: '🎸', genero: 'Banda' },
];

const FEATURES = [
  {
    icon: '🎸',
    titulo: 'Acordes sincronizados',
    desc: 'Los acordes avanzan solos mientras escuchas. Nunca pierdas el hilo de la canción.'
  },
  {
    icon: '🎵',
    titulo: 'Letra en tiempo real',
    desc: 'La letra resalta línea por línea al ritmo exacto de la música.'
  },
  {
    icon: '🥁',
    titulo: 'Modo Tocada',
    desc: 'Metrónomo visual, transpose y control de velocidad. Ideal para ensayos en vivo.'
  },
  {
    icon: '🎚️',
    titulo: 'Transpose instantáneo',
    desc: 'Cambia el tono de cualquier canción con un clic. Sin retrasarse.'
  },
  {
    icon: '📱',
    titulo: '85+ canciones',
    desc: 'Corridos, rancheras, banda, norteñas y grupero. Todo el regional mexicano.'
  },
  {
    icon: '⚡',
    titulo: 'Sin anuncios',
    desc: 'Experiencia limpia y rápida. Solo tú y la música.'
  },
];

const TESTIMONIOS = [
  { texto: 'Ya no necesito buscar acordes en YouTube. ConnectaChat tiene todo en un solo lugar.', nombre: 'Músico de banda', ciudad: 'Sinaloa' },
  { texto: 'El modo tocada es increíble para los ensayos. El metrónomo visual ayuda mucho.', nombre: 'Guitarrista norteño', ciudad: 'Monterrey' },
  { texto: 'Por fin una app de acordes que entiende el regional mexicano de verdad.', nombre: 'Cantante ranchero', ciudad: 'Jalisco' },
];

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cancionActual, setCancionActual] = useState(0);

  const CANCIONES_DEMO = [
    'La Jaula de Oro', 'El Rey', 'Ella Baila Sola',
    'Amor Eterno', 'Tragos de Amargo Licor', 'Volver Volver'
  ];

  useEffect(() => {
    const t = setInterval(() => setCancionActual(c => (c+1) % CANCIONES_DEMO.length), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ background: '#0D0D0D', color: '#fff', height: '100vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}>

      {/* NAV */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1.25rem 2rem', borderBottom: '1px solid #1a1a1a',
        position: 'sticky', top: 0, background: 'rgba(13,13,13,0.95)',
        backdropFilter: 'blur(20px)', zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🎸</span>
          <span style={{ fontWeight: 800, fontSize: '1.25rem', fontFamily: 'Playfair Display, serif' }}>
            ConnectaChat
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={() => navigate('/app')} style={{
            background: 'none', border: 'none', color: '#999',
            cursor: 'pointer', fontSize: '0.9rem'
          }}>
            Catálogo
          </button>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: '#8B0000', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '0.875rem', fontWeight: 700, color: '#fff'
              }}>
                {user.user_metadata?.full_name?.[0] || user.email?.[0]?.toUpperCase()}
              </div>
              <button onClick={signOut} style={{
                background: 'none', border: '1px solid #444',
                color: '#999', padding: '0.5rem 1rem',
                borderRadius: '50px', cursor: 'pointer', fontSize: '0.85rem'
              }}>
                Salir
              </button>
            </div>
          ) : (
            <button onClick={() => signInWithGoogle()} style={{
              background: 'none', border: '1px solid #555',
              color: '#fff', padding: '0.6rem 1.25rem',
              borderRadius: '50px', fontWeight: 600,
              cursor: 'pointer', fontSize: '0.9rem'
            }}>
              Iniciar sesión
            </button>
          )}

          <button onClick={() => navigate('/precios')} style={{
            background: '#8B0000', border: 'none', color: '#fff',
            padding: '0.6rem 1.5rem', borderRadius: '50px',
            fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem'
          }}>
            Empezar gratis
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        minHeight: '92vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: '4rem 2rem',
        background: 'radial-gradient(ellipse at top, #1a0000 0%, #0D0D0D 60%)'
      }}>
        <div style={{
          display: 'inline-block', background: 'rgba(139,0,0,0.2)',
          border: '1px solid rgba(139,0,0,0.4)', borderRadius: '50px',
          padding: '0.4rem 1.25rem', fontSize: '0.8rem', color: '#C9A84C',
          fontWeight: 600, letterSpacing: '0.05em', marginBottom: '2rem'
        }}>
          🎵 85+ canciones de regional mexicano
        </div>

        <h1 style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 'clamp(2.5rem, 7vw, 5rem)',
          fontWeight: 700, lineHeight: 1.1, marginBottom: '1.5rem',
          maxWidth: '800px'
        }}>
          Toca regional mexicano.<br/>
          <span style={{ color: '#8B0000' }}>Acorde por acorde.</span>
        </h1>

        <p style={{
          color: '#999', fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
          maxWidth: '600px', lineHeight: 1.7, marginBottom: '3rem'
        }}>
          La plataforma para músicos mexicanos. Canciones con acordes que se sincronizan
          en tiempo real, metrónomo visual y modo tocada para ensayos en vivo.
        </p>

        {/* CANCION DEMO ANIMADA */}
        <div style={{
          background: '#1a1a1a', border: '1px solid #333', borderRadius: '16px',
          padding: '1.25rem 2rem', marginBottom: '3rem',
          display: 'flex', alignItems: 'center', gap: '1rem'
        }}>
          <div style={{
            width: '40px', height: '40px', background: '#8B0000',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>▶</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              {CANCIONES_DEMO[cancionActual]}
            </div>
            <div style={{ color: '#666', fontSize: '0.8rem' }}>
              Acordes sincronizados • Letra en tiempo real
            </div>
          </div>
          <div style={{
            display: 'flex', gap: '0.4rem', alignItems: 'center', marginLeft: '1rem'
          }}>
            {['G', 'C', 'D', 'Em'].map(a => (
              <span key={a} style={{
                background: '#8B000030', border: '1px solid #8B0000',
                borderRadius: '6px', padding: '0.2rem 0.6rem',
                fontSize: '0.85rem', fontWeight: 700, color: '#C9A84C'
              }}>{a}</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => navigate('/app')} style={{
            background: '#8B0000', border: 'none', color: '#fff',
            padding: '1rem 2.5rem', borderRadius: '50px',
            fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer',
            boxShadow: '0 0 40px rgba(139,0,0,0.4)'
          }}>
            Empezar gratis →
          </button>
          <button onClick={() => navigate('/precios')} style={{
            background: 'none', border: '1px solid #444', color: '#ccc',
            padding: '1rem 2.5rem', borderRadius: '50px',
            fontWeight: 600, fontSize: '1rem', cursor: 'pointer'
          }}>
            Ver Plan Pro $9.99
          </button>
        </div>
      </section>

      {/* ARTISTAS */}
      <section style={{ padding: '5rem 2rem', background: '#111' }}>
        <h2 style={{
          textAlign: 'center', fontFamily: 'Playfair Display, serif',
          fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', marginBottom: '3rem'
        }}>
          Tus artistas favoritos, todos aquí
        </h2>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '1rem', maxWidth: '900px', margin: '0 auto'
        }}>
          {ARTISTAS_DESTACADOS.map(a => (
            <div key={a.nombre} onClick={() => navigate('/app')} style={{
              background: '#1a1a1a', border: '1px solid #222',
              borderRadius: '12px', padding: '1.5rem 1rem',
              textAlign: 'center', cursor: 'pointer',
              transition: 'border-color 0.2s, transform 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='#8B0000'; e.currentTarget.style.transform='scale(1.03)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='#222'; e.currentTarget.style.transform='scale(1)'; }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{a.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem' }}>{a.nombre}</div>
              <div style={{ color: '#666', fontSize: '0.75rem' }}>{a.genero}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '5rem 2rem' }}>
        <h2 style={{
          textAlign: 'center', fontFamily: 'Playfair Display, serif',
          fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', marginBottom: '1rem'
        }}>
          Todo lo que necesitas para tocar
        </h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '3rem' }}>
          Diseñado por músicos, para músicos de regional mexicano
        </p>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1.5rem', maxWidth: '1000px', margin: '0 auto'
        }}>
          {FEATURES.map(f => (
            <div key={f.titulo} style={{
              background: '#111', border: '1px solid #1a1a1a',
              borderRadius: '16px', padding: '2rem'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>{f.icon}</div>
              <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{f.titulo}</div>
              <div style={{ color: '#666', fontSize: '0.875rem', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIOS */}
      <section style={{ padding: '5rem 2rem', background: '#111' }}>
        <h2 style={{
          textAlign: 'center', fontFamily: 'Playfair Display, serif',
          fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', marginBottom: '3rem'
        }}>
          Lo que dicen los músicos
        </h2>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1.5rem', maxWidth: '1000px', margin: '0 auto'
        }}>
          {TESTIMONIOS.map((t,i) => (
            <div key={i} style={{
              background: '#1a1a1a', border: '1px solid #222',
              borderRadius: '16px', padding: '2rem'
            }}>
              <div style={{ color: '#C9A84C', fontSize: '1.5rem', marginBottom: '1rem' }}>★★★★★</div>
              <div style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                "{t.texto}"
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{t.nombre}</div>
              <div style={{ color: '#666', fontSize: '0.8rem' }}>{t.ciudad}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{
        padding: '6rem 2rem', textAlign: 'center',
        background: 'radial-gradient(ellipse at center, #1a0000 0%, #0D0D0D 70%)'
      }}>
        <h2 style={{
          fontFamily: 'Playfair Display, serif',
          fontSize: 'clamp(2rem, 5vw, 3.5rem)',
          marginBottom: '1rem'
        }}>
          Empieza a tocar hoy
        </h2>
        <p style={{ color: '#666', marginBottom: '3rem', fontSize: '1.1rem' }}>
          Gratis para siempre. Pro desde $9.99/mes.
        </p>
        <button onClick={() => navigate('/app')} style={{
          background: '#8B0000', border: 'none', color: '#fff',
          padding: '1.25rem 3rem', borderRadius: '50px',
          fontWeight: 700, fontSize: '1.2rem', cursor: 'pointer',
          boxShadow: '0 0 60px rgba(139,0,0,0.5)'
        }}>
          Explorar canciones →
        </button>
      </section>

      {/* FOOTER */}
      <footer style={{
        padding: '2rem', textAlign: 'center',
        borderTop: '1px solid #1a1a1a', color: '#444', fontSize: '0.8rem'
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <span style={{ marginRight: '2rem', cursor: 'pointer' }} onClick={() => navigate('/precios')}>Precios</span>
          <span style={{ marginRight: '2rem', cursor: 'pointer' }} onClick={() => navigate('/app')}>Catálogo</span>
          <span style={{ cursor: 'pointer' }} onClick={() => navigate('/artistas')}>Artistas</span>
        </div>
        <div>© 2026 ConnectaChat — Hecho con ❤️ para músicos de México</div>
      </footer>
    </div>
  );
}
