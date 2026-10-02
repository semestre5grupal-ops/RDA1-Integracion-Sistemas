import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';

export function Navbar() {
  const location = useLocation();
  const isAlojamientos = location.pathname === '/' || location.pathname.startsWith('/alojamientos');
  const isVuelos = location.pathname.startsWith('/vuelos');
  const isAutos = location.pathname.startsWith('/autos');
  const isAtracciones = location.pathname.startsWith('/atracciones') || location.pathname.startsWith('/search');
  const { user } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <div className="navbar-logo">
            Booking<span>.com</span>
          </div>
        </Link>
        <div className="navbar-actions">
          <span className="nav-currency">USD</span>
          <span className="nav-flag" title="Español / Ecuador">🇪🇨</span>
          <span className="nav-help" title="Ayuda y asistencia">?</span>
          <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', margin: '0 4px' }}>
            Publica tu propiedad
          </span>
          {user ? (
            <>
              <span style={{ fontSize: '0.9rem', color: '#fff', marginRight: '0.5rem' }}>
                {user.user_metadata?.nombre ? `¡Hola, ${user.user_metadata.nombre}!` : user.email}
              </span>
              <Link to="/facturas" className="navbar-btn outline" style={{ textDecoration: 'none' }}>
                Mis Facturas
              </Link>
              <Link to="/mis-reservas" className="navbar-btn outline" style={{ textDecoration: 'none' }}>
                Mis reservas
              </Link>
              <button className="navbar-btn solid" onClick={handleLogout}>
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <Link to="/register" className="navbar-btn outline" style={{ textDecoration: 'none' }}>
                Regístrate
              </Link>
              <Link to="/login" className="navbar-btn solid" style={{ textDecoration: 'none' }}>
                Iniciar sesión
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="navbar-secondary">
        <div className="navbar-links">
          <Link to="/alojamientos" className={isAlojamientos ? 'active' : ''}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.75 12h18.5c.69 0 1.25.56 1.25 1.25V18l.75-.75H.75l.75.75v-4.75c0-.69.56-1.25 1.25-1.25m0-1.5A2.75 2.75 0 0 0 0 13.25V18c0 .414.336.75.75.75h22.5A.75.75 0 0 0 24 18v-4.75a2.75 2.75 0 0 0-2.75-2.75zM0 18v3a.75.75 0 0 0 1.5 0v-3A.75.75 0 0 0 0 18m22.5 0v3a.75.75 0 0 0 1.5 0v-3a.75.75 0 0 0-1.5 0m-.75-6.75V4.5a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 2.25 4.5v6.75a.75.75 0 0 0 1.5 0V4.5a.75.75 0 0 1 .75-.75h15a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 0 1.5 0m-13.25-3h7a.25.25 0 0 1 .25.25v2.75l.75-.75h-9l.75.75V8.5a.25.25 0 0 1 .25-.25m0-1.5A1.75 1.75 0 0 0 6.75 8.5v2.75c0 .414.336.75.75.75h9a.75.75 0 0 0 .75-.75V8.5a1.75 1.75 0 0 0-1.75-1.75z"></path>
            </svg>
            Hospedajes
          </Link>
          <Link to="/vuelos" className={isVuelos ? 'active' : ''}>
            ✈️ Vuelos
          </Link>
          <Link to="/autos" className={isAutos ? 'active' : ''}>
            🚗 Renta de autos
          </Link>
          <Link to="/atracciones" className={isAtracciones ? 'active' : ''}>
            🎡 Atracciones
          </Link>
          <span style={{ opacity: 0.6, cursor: 'default', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🚕 Taxis aeropuerto
          </span>
        </div>
      </div>
    </nav>
  );
}
