import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { signInWithGoogle } from '../lib/supabase.js';

const API = import.meta.env.VITE_API_URL || '';

const FEATURES_FREE = [
  '10 canciones por día',
  'Acordes básicos (sync estimado)',
  'Búsqueda por género',
  'Reproductor con YouTube',
];

const FEATURES_PRO = [
  'Canciones ilimitadas',
  'Acordes sincronizados con timestamps reales',
  'Transpose en tiempo real (+/- semitonos)',
  'Control de velocidad (0.5×, 0.75×, 1×)',
  'EditorSync — calibra tus propias canciones',
  'Descarga acordes en PDF',
  'Soporte prioritario',
];

export default function Precios() {
  const { session } = useAuth();
  const [loading, setLoading]     = useState(false);
  const [planActual, setPlanActual] = useState('free');

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    fetch(`${API}/api/billing/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setPlanActual(d.plan || 'free'))
      .catch(() => {});
  }, [session]);

  const handleCheckout = async () => {
    if (!session) {
      localStorage.setItem('auth_redirect', '/precios');
      await signInWithGoogle();
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/billing/musica/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await r.json();
      if (body.url) {
        window.location.href = body.url;
      } else {
        alert(body.error || 'Error al crear sesión de pago');
        setLoading(false);
      }
    } catch {
      alert('Error de conexión');
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh',
      overflowY: 'auto',
      background: 'var(--bg, #0D0D0D)',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '4rem 1rem',
    }}>
      <h1 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
        marginBottom: '0.5rem',
        textAlign: 'center',
      }}>
        Elige tu plan
      </h1>
      <p style={{ color: '#999', marginBottom: '3rem', textAlign: 'center' }}>
        Para músicos que se toman en serio su oficio
      </p>

      <div style={{
        display: 'flex',
        gap: '2rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
        width: '100%',
        maxWidth: '720px',
      }}>

        {/* Plan Free */}
        <div style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '16px',
          padding: '2rem',
          flex: '1 1 280px',
          maxWidth: '320px',
        }}>
          <h2 style={{ color: '#888', fontSize: '0.85rem', letterSpacing: '0.12em', marginBottom: '0.75rem' }}>
            GRATUITO
          </h2>
          <div style={{ fontSize: '2.4rem', fontWeight: 800, marginBottom: '1.5rem' }}>
            $0
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem' }}>
            {FEATURES_FREE.map((f) => (
              <li key={f} style={{
                padding: '0.55rem 0',
                borderBottom: '1px solid #222',
                color: '#bbb',
                fontSize: '0.9rem',
              }}>
                <span style={{ color: '#555', marginRight: '0.5rem' }}>✓</span>{f}
              </li>
            ))}
          </ul>
          <div style={{
            padding: '0.8rem',
            background: '#222',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#555',
            fontSize: '0.9rem',
          }}>
            {planActual === 'free' ? 'Plan actual' : 'Plan básico'}
          </div>
        </div>

        {/* Plan Pro */}
        <div style={{
          background: 'linear-gradient(145deg, #1a0808, #2a1010)',
          border: '2px solid #8B0000',
          borderRadius: '16px',
          padding: '2rem',
          flex: '1 1 280px',
          maxWidth: '320px',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            top: '-14px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#8B0000',
            padding: '4px 18px',
            borderRadius: '20px',
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            whiteSpace: 'nowrap',
          }}>
            MÁS POPULAR
          </div>
          <h2 style={{ color: '#C9A84C', fontSize: '0.85rem', letterSpacing: '0.12em', marginBottom: '0.75rem' }}>
            PRO
          </h2>
          <div style={{ marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '2.4rem', fontWeight: 800 }}>$9.99</span>
            <span style={{ color: '#888', fontSize: '1rem' }}> /mes</span>
          </div>
          <div style={{ color: '#666', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
            ~$0.33 por día
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem' }}>
            {FEATURES_PRO.map((f) => (
              <li key={f} style={{
                padding: '0.55rem 0',
                borderBottom: '1px solid rgba(139,0,0,0.25)',
                color: '#ddd',
                fontSize: '0.9rem',
              }}>
                <span style={{ color: '#C9A84C', marginRight: '0.5rem' }}>✓</span>{f}
              </li>
            ))}
          </ul>
          <button
            onClick={handleCheckout}
            disabled={loading || planActual === 'pro'}
            style={{
              width: '100%',
              padding: '1rem',
              background: planActual === 'pro' ? '#2a2a2a' : '#8B0000',
              color: planActual === 'pro' ? '#555' : '#fff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: planActual === 'pro' ? 'default' : 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => {
              if (planActual !== 'pro' && !loading)
                e.currentTarget.style.background = '#a00000';
            }}
            onMouseLeave={(e) => {
              if (planActual !== 'pro')
                e.currentTarget.style.background = loading ? '#8B0000' : '#8B0000';
            }}
          >
            {loading ? 'Redirigiendo...' : planActual === 'pro' ? 'Plan actual ✓' : 'Comenzar Pro'}
          </button>
        </div>
      </div>

      <p style={{ marginTop: '3rem', color: '#555', fontSize: '0.8rem', textAlign: 'center' }}>
        Pago seguro con Stripe · Cancela cuando quieras · Sin compromisos
      </p>
    </div>
  );
}
