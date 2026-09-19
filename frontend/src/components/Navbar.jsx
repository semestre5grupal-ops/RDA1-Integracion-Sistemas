export function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="navbar-logo">
          Booking<span>.com</span>
          <span style={{ fontSize: '0.55rem', fontWeight: 400, opacity: .7, marginLeft: 6 }}>Prototipo</span>
        </div>
        <div className="navbar-links">
          <a href="#">🏨 Alojamientos</a>
          <a href="#" style={{ color: '#febb02', fontWeight: 700 }}>🎡 Atracciones</a>
          <a href="#">✈️ Vuelos</a>
          <a href="#">🚗 Autos</a>
        </div>
        <button className="navbar-btn">Registrarse</button>
      </div>
    </nav>
  );
}
