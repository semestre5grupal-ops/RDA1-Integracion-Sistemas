import { Link, useLocation } from 'react-router-dom';

export function Navbar() {
  const location = useLocation();
  const isAutos = location.pathname.startsWith('/autos');

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="navbar-logo">
          Booking<span>.com</span>
          <span style={{ fontSize: '0.55rem', fontWeight: 400, opacity: .7, marginLeft: 6 }}>Prototipo</span>
        </div>
        <div className="navbar-links">
          <Link to="/">🏨 Alojamientos</Link>
          <Link to="/" style={!isAutos ? { color: '#febb02', fontWeight: 700 } : {}}>🎡 Atracciones</Link>
          <Link to="/">✈️ Vuelos</Link>
          <Link to="/autos" style={isAutos ? { color: '#febb02', fontWeight: 700 } : {}}>🚗 Autos</Link>
        </div>
        <button className="navbar-btn">Registrarse</button>
      </div>
    </nav>
  );
}
