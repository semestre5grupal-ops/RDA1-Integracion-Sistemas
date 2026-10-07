import { useCallback, useState } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';

// --- Modulo de Alojamientos ---
import { AlojamientosPage } from './pages/AlojamientosPage';
import { QuieroSerProveedorPage } from './pages/QuieroSerProveedorPage';
import { AlojamientosSearchPage } from './pages/AlojamientosSearchPage';
import { AlojamientoDetail } from './pages/AlojamientoDetail';
import { AlojamientoCheckoutPage } from './pages/AlojamientoCheckoutPage';

// --- Modulo de Atracciones ---
import { AtraccionesPage } from './pages/AtraccionesPage';
import { AtraccionesSearchPage } from './pages/AtraccionesSearchPage';
import { AtraccionDetail } from './pages/AtraccionDetail';
import { HospedajePage } from './pages/HospedajePage';
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

// --- Estado Offline ---
import { OfflineBanner } from './components/OfflineBanner';

// --- Chatbot informativo (flotante, global, solo lectura) ---
import { ChatbotFlotante } from './components/ChatbotFlotante';

import { AuthProvider } from './hooks/useAuth';
import { CurrencyProvider } from './hooks/CurrencyContext';
import { LanguageProvider } from './hooks/LanguageContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { AdminGuard } from './components/AdminGuard';
import { PlatformStatusGate } from './components/PlatformStatusGate';
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
    <LanguageProvider>
    <CurrencyProvider>
    <BrowserRouter>
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido
      </a>

      <div className="app-wrapper">
        <Navbar />
        <PlatformStatusGate>
        <Routes>
          {/* Rutas de Alojamientos (Página principal por defecto) */}
          <Route path="/" element={<AlojamientosPage />} />
          <Route path="/alojamientos" element={<AlojamientosPage />} />
          <Route path="/alojamientos/search" element={<AlojamientosSearchPage />} />
          <Route path="/searchresults" element={<AlojamientosSearchPage />} />
          <Route path="/alojamientos/checkout" element={<AlojamientoCheckoutPage />} />
          <Route path="/book.html" element={<AlojamientoCheckoutPage />} />
          <Route path="/alojamientos/:id" element={<AlojamientoDetail />} />

          {/* Rutas de Atracciones */}
          <Route path="/atracciones" element={<AtraccionesPage />} />
          <Route path="/hospedaje" element={<HospedajePage />} />
          <Route path="/search" element={<AtraccionesSearchPage />} />
          <Route path="/atracciones/:id" element={<AtraccionDetail />} />

          {/* Rutas de Autos */}
          <Route path="/autos" element={<AutosPage />} />
          <Route path="/autos/:id" element={<AutoDetail />} />

          {/* Admin */}
          <Route path="/admin" element={
            <AdminGuard>
              <AdminDashboard />
            </AdminGuard>
          } />

          {/* Modulo de Vuelos */}
          <Route path="/vuelos" element={<VuelosPage />} />
          <Route path="/vuelos/busqueda" element={<VuelosPage />} />
          <Route path="/vuelos/reserva" element={<VuelosPage />} />
          <Route path="/vuelos/reservas" element={<MisReservasPage />} />
          <Route path="/vuelos/reservas/:bookingId" element={<DetalleReservaRoute />} />
          <Route path="/mis-reservas" element={<MisReservasPage />} />

          {/* Otros endpoints de vuelos */}
          <Route path="/estado-vuelos" element={<EstadoVueloPage />} />
          <Route path="/vuelos/estado" element={<EstadoVueloPage />} />
          <Route path="/webhooks" element={<WebhooksPage />} />

          {/* Autenticacion */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/facturas" element={<FacturasPage />} />

          {/* Paginas legales */}
          <Route path="/proveedores/registro" element={<QuieroSerProveedorPage />} />
          <Route path="/privacidad" element={<PrivacidadPage />} />
          <Route path="/terminos" element={<TerminosPage />} />
          <Route path="/legal/privacidad" element={<PrivacidadPage />} />
          <Route path="/legal/terminos" element={<TerminosPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </PlatformStatusGate>

        <Footer onAbrirPreferenciasCookies={() => setPreferenciasCookies(true)} />
      </div>

      {/* Global, fuera del router visual pero dentro de la app */}
      <BannerCookies
        abiertoExternamente={preferenciasCookies}
        onCerrarExterno={cerrarPreferencias}
      />
      <OfflineBanner />
      {/* Chatbot: global y fuera del `app-wrapper`, igual que los banners.
          Montarlo dentro de una Ruta lo haría desaparecer al navegar, y el
          requisito es que esté en TODAS las pantallas. Va después de
          `OfflineBanner` para que en el DOM quede por encima si coincidieran,
          cosa que no ocurre porque `OfflineBanner` devuelve `null` con conexión. */}
      <ChatbotFlotante />
    </BrowserRouter>
    </CurrencyProvider>
    </LanguageProvider>
    </AuthProvider>
  );
}

export default App;
