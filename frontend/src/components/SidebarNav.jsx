import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/',         icon: '🏠', label: 'Inicio' },
  { path: '/favoritos', icon: '❤️', label: 'Favoritos' },
  { path: '/artistas',  icon: '🎤', label: 'Artistas' },
  { path: '/generos',   icon: '🎵', label: 'Géneros' },
  { path: '/recientes', icon: '🕐', label: 'Recientes' },
];

export default function SidebarNav() {
  const { pathname } = useLocation();

  return (
    <aside className="sidebar">
      <Link to="/" className="sidebar-logo">
        <span style={{ fontSize: 26 }}>🎸</span>
        <span>ConnectaChat</span>
      </Link>

      <nav className="nav-section">
        {NAV_ITEMS.map(({ path, icon, label }) => (
          <Link key={path} to={path}
            className={`nav-item ${pathname === path ? 'active' : ''}`}>
            <span style={{ fontSize: '1.1rem', width: '24px', textAlign: 'center' }}>{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--bg-highlight)', paddingTop: '1rem' }}>
        <Link to="/precios" className="nav-item" style={{ color: '#C9A84C' }}>
          <span style={{ fontSize: '1.1rem', width: '24px', textAlign: 'center' }}>⭐</span>
          Plan Pro $9.99
        </Link>
        <Link to="/admin/letras" className="nav-item">
          <span style={{ fontSize: '1.1rem', width: '24px', textAlign: 'center' }}>⚙️</span>
          Admin
        </Link>
      </div>
    </aside>
  );
}
