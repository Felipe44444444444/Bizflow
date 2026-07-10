import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Cancion from './pages/Cancion.jsx';
import Precios from './pages/Precios.jsx';
import AdminLetras from './pages/AdminLetras.jsx';

function Sidebar() {
  const loc = useLocation();
  const active = (path) => loc.pathname === path ? 'nav-item active' : 'nav-item';

  return (
    <aside className="sidebar">
      <Link to="/" className="sidebar-logo">
        <span style={{ fontSize: 26 }}>🎸</span>
        <span>ConnectaChat</span>
      </Link>

      <nav className="nav-section">
        <Link to="/" className={active('/')}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
          </svg>
          Inicio
        </Link>
        <Link to="/favoritos" className={active('/favoritos')}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          Favoritos
        </Link>
      </nav>

      <div style={{ borderTop: '1px solid var(--bg-highlight)', paddingTop: '1rem', marginTop: 'auto' }}>
        <Link to="/precios" className="nav-item" style={{ color: '#C9A84C' }}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
          </svg>
          Plan Pro $9.99
        </Link>
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cancion/:id" element={<Cancion />} />
          <Route path="/favoritos" element={<Home favoritos />} />
          <Route path="/precios" element={<Precios />} />
          <Route path="/pro" element={<Precios />} />
          <Route path="/admin/letras" element={<AdminLetras />} />
        </Routes>
      </main>
    </div>
  );
}
