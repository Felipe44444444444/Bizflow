import { Routes, Route } from 'react-router-dom';
import SidebarNav from './components/SidebarNav.jsx';
import Home from './pages/Home.jsx';
import Cancion from './pages/Cancion.jsx';
import Precios from './pages/Precios.jsx';
import AdminLetras from './pages/AdminLetras.jsx';
import Artistas from './pages/Artistas.jsx';
import Generos from './pages/Generos.jsx';
import Recientes from './pages/Recientes.jsx';

export default function App() {
  return (
    <div className="app-layout">
      <SidebarNav />
      <main className="main-content">
        <Routes>
          <Route path="/"              element={<Home />} />
          <Route path="/cancion/:id"   element={<Cancion />} />
          <Route path="/favoritos"     element={<Home favoritos />} />
          <Route path="/artistas"      element={<Artistas />} />
          <Route path="/generos"       element={<Generos />} />
          <Route path="/recientes"     element={<Recientes />} />
          <Route path="/precios"       element={<Precios />} />
          <Route path="/pro"           element={<Precios />} />
          <Route path="/admin/letras"  element={<AdminLetras />} />
        </Routes>
      </main>
    </div>
  );
}
