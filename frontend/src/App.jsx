import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Cancion from './pages/Cancion.jsx';

function Header() {
  const loc = useLocation();
  return (
    <header style={{
      borderBottom: '1px solid var(--border)',
      background: 'rgba(13,13,13,0.92)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>🎸</span>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--gold)', letterSpacing: '-0.02em' }}>
              ConnectaChat
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: -2, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Música Regional Mexicana
            </p>
          </div>
        </Link>

        <nav style={{ display: 'flex', gap: 8 }}>
          <Link to="/" className="btn btn-ghost" style={{ fontSize: 13 }}>
            Catálogo
          </Link>
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cancion/:id" element={<Cancion />} />
      </Routes>
    </>
  );
}
