import { Routes, Route } from 'react-router-dom';
import SidebarNav from './components/SidebarNav.jsx';
import Home from './pages/Home.jsx';
import Cancion from './pages/Cancion.jsx';
import Precios from './pages/Precios.jsx';
import AdminLetras from './pages/AdminLetras.jsx';
import Artistas from './pages/Artistas.jsx';
import Generos from './pages/Generos.jsx';
import Recientes from './pages/Recientes.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import Landing from './pages/Landing.jsx';

function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <SidebarNav />
      <main className="main-content">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/"              element={<Landing />} />
      <Route path="/app"           element={<AppLayout><Home /></AppLayout>} />
      <Route path="/cancion/:id"   element={<AppLayout><Cancion /></AppLayout>} />
      <Route path="/favoritos"     element={<AppLayout><Home favoritos /></AppLayout>} />
      <Route path="/artistas"      element={<AppLayout><Artistas /></AppLayout>} />
      <Route path="/generos"       element={<AppLayout><Generos /></AppLayout>} />
      <Route path="/recientes"     element={<AppLayout><Recientes /></AppLayout>} />
      <Route path="/precios"       element={<AppLayout><Precios /></AppLayout>} />
      <Route path="/pro"           element={<AppLayout><Precios /></AppLayout>} />
      <Route path="/admin/letras"  element={<AppLayout><AdminLetras /></AppLayout>} />
      <Route path="/auth/callback" element={<AuthCallback />} />
    </Routes>
  );
}
