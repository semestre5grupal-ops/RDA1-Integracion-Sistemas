import { useCallback, useState } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';

// --- Modulo de Alojamientos ---
import { AlojamientosPage } from './pages/AlojamientosPage';
import { AlojamientoDetail } from './pages/AlojamientoDetail';

// --- Modulo de Atracciones ---
import { AtraccionesPage } from './pages/AtraccionesPage';
import { AtraccionesSearchPage } from './pages/AtraccionesSearchPage';
import { AtraccionDetail } from './pages/AtraccionDetail';

// --- Modulo de Autos ---
import { AutosPage } from './pages/AutosPage';
import { AutoDetail } from './pages/AutoDetail';
import { AdminDashboard } from './pages/AdminDashboard';

// --- Modulo de Vuelos ---
import { VuelosPage } from './pages/VuelosPage';
import { MisReservasPage } from './pages/MisReservasPage';
import { EstadoVueloPage } from './pages/EstadoVueloPage';
import { DetalleReservaPage } from './pages/DetalleReservaPage';
import { FacturasPage } from './pages/FacturasPage';
import { WebhooksPage } from './pages/WebhooksPage';

// --- Autenticacion ---
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

// --- Componentes legales ---
import { PrivacidadPage } from './pages/PrivacidadPage';
import { TerminosPage } from './pages/TerminosPage';
import { NotFoundPage } from './pages/NotFoundPage';

// --- Banner global de consentimiento ---
import { BannerCookies } from './components/BannerCookies';

import { AuthProvider } from './hooks/useAuth';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';

import './index.css';
import './vuelos.css';

/**
 * Puente entre la ruta y `DetalleReservaPage`.
 */
function DetalleReservaRoute() {
  const { bookingId } = useParams();
  return <DetalleReservaPage bookingId={bookingId} />;
}

function App() {
  // Controla la apertura del panel de preferencias desde el Footer
  const [preferenciasCookies, setPreferenciasCookies] = useState(false);
  const cerrarPreferencias = useCallback(() => setPreferenciasCookies(false), []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <a className="skip-link" href="#contenido-principal">
          Saltar al contenido
        </a>

        <div className="app-wrapper">
          <Navbar />
          <Routes>
            {/* Rutas de Alojamientos (Página principal por defecto) */}
            <Route path="/" element={<AlojamientosPage />} />
            <Route path="/alojamientos" element={<AlojamientosPage />} />
            <Route path="/alojamientos/:id" element={<AlojamientoDetail />} />

            {/* Rutas de Atracciones */}
            <Route path="/atracciones" element={<AtraccionesPage />} />
            <Route path="/search" element={<AtraccionesSearchPage />} />
            <Route path="/atracciones/:id" element={<AtraccionDetail />} />

            {/* Rutas de Autos */}
            <Route path="/autos" element={<AutosPage />} />
            <Route path="/autos/:id" element={<AutoDetail />} />
            <Route path="/admin" element={<AdminDashboard />} />

            {/* Modulo de Vuelos */}
            <Route path="/vuelos" element={<VuelosPage />} />
            <Route path="/vuelos/busqueda" element={<VuelosPage />} />
            <Route path="/vuelos/reserva" element={<VuelosPage />} />
            <Route path="/vuelos/reservas" element={<MisReservasPage />} />
            <Route path="/vuelos/reservas/:bookingId" element={<DetalleReservaRoute />} />
            <Route path="/mis-reservas" element={<MisReservasPage />} />

            {/* Estado de Vuelos y Webhooks */}
            <Route path="/estado-vuelos" element={<EstadoVueloPage />} />
            <Route path="/vuelos/estado" element={<EstadoVueloPage />} />
            <Route path="/webhooks" element={<WebhooksPage />} />

            {/* Autenticacion y Facturas */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/facturas" element={<FacturasPage />} />

            {/* Paginas legales */}
            <Route path="/privacidad" element={<PrivacidadPage />} />
            <Route path="/terminos" element={<TerminosPage />} />
            <Route path="/legal/privacidad" element={<PrivacidadPage />} />
            <Route path="/legal/terminos" element={<TerminosPage />} />

            {/* 404 Not Found */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>

          <Footer onAbrirPreferenciasCookies={() => setPreferenciasCookies(true)} />
        </div>

        {/* Global, fuera del router visual pero dentro de la app */}
        <BannerCookies
          abiertoExternamente={preferenciasCookies}
          onCerrarExterno={cerrarPreferencias}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
