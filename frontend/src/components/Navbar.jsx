import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCurrency } from '../hooks/CurrencyContext';
import { useLanguage, languages } from '../hooks/LanguageContext';
import { supabase } from '../services/supabase';
import {
  BedIcon,
  FlightIcon,
  CarRentalIcon,
  AttractionsNavIcon,
  AirportTaxiIcon,
  RoundFlag,
} from './BookingIcons';

export function Navbar() {
  const location = useLocation();
  const isAlojamientos = location.pathname === '/' || location.pathname.startsWith('/alojamientos') || location.pathname.startsWith('/searchresults');
  const isVuelos = location.pathname.startsWith('/vuelos');
  const isAutos = location.pathname.startsWith('/autos');
  const isAtracciones = location.pathname.startsWith('/atracciones') || (location.pathname.startsWith('/search') && !location.pathname.startsWith('/searchresults'));
  const isHospedaje = location.pathname.startsWith('/hospedaje');
  const { user } = useAuth();
  const { currency, changeCurrency } = useCurrency();
  const { language, currentLanguage, changeLanguage, t } = useLanguage();
  
  const [showDropdown, setShowDropdown] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handleOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showDropdown]);
  
  // States for Profile Edit
  const [nombre, setNombre] = useState(user?.user_metadata?.nombre || '');
  const [apellido, setApellido] = useState(user?.user_metadata?.apellido || '');
  const [telefono, setTelefono] = useState(user?.user_metadata?.telefono || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileError('');
    
    try {
      const cleanEmail = email.trim().toLowerCase();
      let hadErrors = false;
      let errorMsg = '';
      
      // 1. Actualizar Datos de Perfil (metadata) SIEMPRE
      const { error: metaError } = await supabase.auth.updateUser({
        data: { nombre: nombre.trim(), apellido: apellido.trim(), telefono: telefono.trim() }
      });
      if (metaError) {
        hadErrors = true;
        errorMsg += `Error al guardar datos de perfil: ${metaError.message}. `;
      }

      // 2. Actualizar Contraseña (si se solicita)
      if (newPassword && !hadErrors) {
        if (!currentPassword) {
           setProfileError('Debes ingresar tu contraseña actual para poder cambiarla.');
           return;
        }
        
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword
        });
        
        if (authError) {
          setProfileError('La contraseña actual que ingresaste es incorrecta.');
          return;
        }
        
        const { error: passError } = await supabase.auth.updateUser({ password: newPassword });
        if (passError) {
          hadErrors = true;
          errorMsg += `Error en contraseña: ${passError.message}. `;
        } else {
          setCurrentPassword('');
          setNewPassword('');
        }
      }
      
      // 3. Actualizar Correo (si cambió)
      if (cleanEmail && cleanEmail !== user.email && !hadErrors) {
        // Validar formato básico antes de llamar a Supabase
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
          setProfileError('El correo que ingresaste no tiene un formato válido (ej: tucorreo@gmail.com).');
          return;
        }

        const { error: emailError } = await supabase.auth.updateUser({ email: cleanEmail });
        if (emailError) {
          hadErrors = true;
          if (emailError.status === 429 || emailError.message?.includes('rate')) {
            errorMsg += 'Supabase bloqueó temporalmente los cambios de correo por demasiados intentos. Espera unos minutos e inténtalo de nuevo. ';
          } else if (emailError.message?.includes('invalid') || emailError.message?.includes('format')) {
            errorMsg += `El correo "${cleanEmail}" no es válido o está bloqueado. `;
          } else if (emailError.message?.includes('already')) {
            errorMsg += 'Ese correo ya está en uso por otra cuenta. ';
          } else {
            errorMsg += `Error al cambiar correo: ${emailError.message}. `;
          }
        } else {
          // Correo actualizado: refrescar la sesión para que user.email se actualice en la UI
          await supabase.auth.refreshSession();
          setProfileMsg('¡Perfil actualizado con éxito! Si cambiaste tu correo, inicia sesión nuevamente con el nuevo correo.');
          setEmail(cleanEmail);
        }
      }
      
      if (hadErrors) {
        setProfileError(errorMsg || 'Ocurrió un error al actualizar el perfil.');
      } else if (!profileMsg) {
        setProfileMsg('¡Perfil actualizado con éxito!');
      }
      
    } catch (err) {
      setProfileError(`Error inesperado: ${err.message}`);
    }
  };


  const isAdmin = user?.email === 'admin@booking.com' || user?.email === 'alejandroflores@booking.com' || user?.user_metadata?.role === 'admin';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <div className="navbar-logo">
            Booking<span>.com</span>
          </div>
        </Link>
        <div className="navbar-actions">
          {/* Botones ocultos a petición del usuario: moneda, idioma, ayuda
          <span className="nav-currency"... />
          <span className="nav-flag"... />
          <span className="nav-help"... />
          */}
          {!isAdmin && <Link
            to="/proveedores/registro"
            style={{
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 500,
              margin: '0 4px',
              textDecoration: 'none',
            }}
          >
            Quiero ser proveedor
          </Link>}
          {user ? (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} ref={dropdownRef}>
              {!isAdmin && (
                <Link to="/mis-reservas" className="navbar-btn outline" style={{textDecoration: 'none', marginRight: '10px'}}>{t('nav.my_bookings')}</Link>
              )}
              
              <div 
                onClick={() => setShowDropdown(!showDropdown)}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', 
                  background: 'rgba(255,255,255,0.1)', padding: '5px 10px', borderRadius: '20px', color: 'white'
                }}
              >
                <div style={{ width: '32px', height: '32px', background: '#006ce4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '2px solid white' }}>
                  {user.user_metadata?.nombre ? user.user_metadata.nombre.charAt(0).toUpperCase() : 'U'}
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                  {user.user_metadata?.nombre || 'Usuario'}
                </span>
                <span style={{ fontSize: '0.7rem' }}>▼</span>
              </div>

              {showDropdown && (
                <div style={{ position: 'absolute', top: '120%', right: 0, background: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '200px', zIndex: 100 }}>
                  <div style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
                    <div style={{ fontWeight: 'bold', color: '#333' }}>{user.user_metadata?.nombre} {user.user_metadata?.apellido}</div>
                    <div style={{ fontSize: '0.8rem', color: '#666' }}>{user.email}</div>
                  </div>
                  <div 
                    onClick={() => { setShowProfileModal(true); setShowDropdown(false); }}
                    style={{ padding: '12px 15px', color: '#333', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#f5f5f5'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span>👤</span> {t('nav.edit_account')}
                  </div>
                  {(user?.email === 'admin@booking.com' || user?.email === 'alejandroflores@booking.com' || user?.user_metadata?.role === 'admin') && (
                    <Link 
                      to="/admin"
                      onClick={() => setShowDropdown(false)}
                      style={{ padding: '12px 15px', color: '#333', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#f5f5f5'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <span>⚙️</span> Panel Admin
                    </Link>
                  )}
                  <div 
                    onClick={handleLogout}
                    style={{ padding: '12px 15px', color: '#d32f2f', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid #eee' }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#f5f5f5'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span>🚪</span> {t('nav.logout')}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Link
                to="/register"
                className="navbar-btn outline"
                style={{
                  textDecoration: 'none',
                  background: '#ffffff',
                  color: '#006ce4',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  padding: '7px 14px',
                  borderRadius: '4px',
                  border: '1px solid transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  transition: 'background 0.15s ease',
                }}
              >
                {t ? t('nav.register') : 'Regístrate'}
              </Link>
              <Link
                to="/login"
                className="navbar-btn solid"
                style={{
                  textDecoration: 'none',
                  background: '#ffffff',
                  color: '#006ce4',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  padding: '7px 14px',
                  borderRadius: '4px',
                  border: '1px solid transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  transition: 'background 0.15s ease',
                }}
              >
                {t ? t('nav.login') : 'Iniciar sesión'}
              </Link>
            </div>
          )}
        </div>
      </div>
      <div className="navbar-secondary">
        <div className="navbar-links">
          <Link to="/alojamientos" className={isAlojamientos ? 'active' : ''}>
            <BedIcon size={18} color="#ffffff" />
            <span>{t ? t('nav.stays') : 'Hospedajes'}</span>
          </Link>
          <Link to="/vuelos" className={isVuelos ? 'active' : ''}>
            <FlightIcon size={18} color="#ffffff" />
            <span>{t ? t('nav.flights') : 'Vuelos'}</span>
          </Link>
          <Link to="/autos" className={isAutos ? 'active' : ''}>
            <CarRentalIcon size={18} color="#ffffff" />
            <span>{t ? t('nav.cars') : 'Renta de autos'}</span>
          </Link>
          <Link to="/atracciones" className={isAtracciones ? 'active' : ''}>
            <AttractionsNavIcon size={18} color="#ffffff" />
            <span>{t ? t('nav.attractions') : 'Atracciones'}</span>
          </Link>

        </div>
      </div>

      {/* MODAL DE EDICIÓN DE PERFIL */}
      {showProfileModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '500px', maxWidth: '100%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ background: '#006ce4', padding: '20px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>👤 Editar Perfil</h2>
              <button onClick={() => setShowProfileModal(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '30px' }}>
              {profileMsg && <div style={{ padding: '10px', background: '#d4edda', color: '#155724', borderRadius: '4px', marginBottom: '15px' }}>{profileMsg}</div>}
              {profileError && <div style={{ padding: '10px', background: '#f8d7da', color: '#721c24', borderRadius: '4px', marginBottom: '15px' }}>{profileError}</div>}
              
              <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#333' }}>Nombre</label>
                    <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#333' }}>Apellido</label>
                    <input type="text" value={apellido} onChange={e => setApellido(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} required />
                  </div>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#333' }}>Teléfono</label>
                  <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#333' }}>Correo Electrónico</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} required />
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '10px 0' }} />
                
                <h3 style={{ fontSize: '1rem', color: '#333', margin: '0' }}>Cambiar Contraseña</h3>
                <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 10px 0' }}>Deja los campos vacíos si no deseas cambiarla.</p>

                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#333' }}>Contraseña Actual</label>
                  <input type="password" placeholder="Requerida para guardar nueva contraseña" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#333' }}>Nueva Contraseña</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                </div>

                <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowProfileModal(false)} style={{ padding: '10px 20px', borderRadius: '4px', border: '1px solid #006ce4', background: 'transparent', color: '#006ce4', cursor: 'pointer', fontWeight: 'bold' }}>Cancelar</button>
                  <button type="submit" style={{ padding: '10px 20px', borderRadius: '4px', border: 'none', background: '#006ce4', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Guardar Cambios</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE MONEDA */}
      {showCurrencyModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '8px', width: '800px', maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            
            {/* Header Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e7e7e7' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, color: '#333' }}>Selecciona tu moneda</h2>
              <button onClick={() => setShowCurrencyModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666', lineHeight: 1 }}>×</button>
            </div>
            
            {/* Contenido Modal */}
            <div style={{ padding: '24px', overflowY: 'auto' }}>
              <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '24px', lineHeight: '1.5' }}>
                Cuando corresponda, los precios se convertirán y se mostrarán en la moneda que selecciones. La moneda en la que pagas puede variar en función de la reserva y es posible que se aplique un cargo de servicio.
              </p>
              
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#333', marginBottom: '16px' }}>Recomendado para ti</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' }}>
                {[
                  { code: 'EUR', name: 'Euro' },
                  { code: 'COP', name: 'Peso colombiano' },
                  { code: 'CLP', name: 'Peso chileno' },
                  { code: 'MXN', name: 'Peso mexicano' },
                  { code: 'ARS', name: 'Peso argentino' },
                  { code: 'GBP', name: 'Libra esterlina' }
                ].map(moneda => (
                  <button 
                    key={`rec-${moneda.code}`}
                    onClick={() => { changeCurrency(moneda.code); setShowCurrencyModal(false); }}
                    style={{ 
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '12px 16px', 
                      background: currency === moneda.code ? '#f0f6fd' : 'transparent', 
                      border: currency === moneda.code ? '1px solid #006ce4' : '1px solid transparent', 
                      borderRadius: '4px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => { if(currency !== moneda.code) e.currentTarget.style.background = '#f5f5f5'; }}
                    onMouseOut={(e) => { if(currency !== moneda.code) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: '0.9rem', color: '#333' }}>{moneda.name}</span>
                    <span style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>{moneda.code}</span>
                  </button>
                ))}
              </div>
              
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#333', marginBottom: '16px' }}>Todas las monedas</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {[
                  { code: 'USD', name: 'Dólar estadounidense' },
                  { code: 'EUR', name: 'Euro' },
                  { code: 'COP', name: 'Peso colombiano' },
                  { code: 'CLP', name: 'Peso chileno' },
                  { code: 'MXN', name: 'Peso mexicano' },
                  { code: 'ARS', name: 'Peso argentino' },
                  { code: 'GBP', name: 'Libra esterlina' }
                ].map(moneda => (
                  <button 
                    key={`all-${moneda.code}`}
                    onClick={() => { changeCurrency(moneda.code); setShowCurrencyModal(false); }}
                    style={{ 
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '12px 16px', 
                      background: currency === moneda.code ? '#f0f6fd' : 'transparent', 
                      border: currency === moneda.code ? '1px solid #006ce4' : '1px solid transparent', 
                      borderRadius: '4px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => { if(currency !== moneda.code) e.currentTarget.style.background = '#f5f5f5'; }}
                    onMouseOut={(e) => { if(currency !== moneda.code) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: '0.9rem', color: '#333' }}>{moneda.name}</span>
                    <span style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>{moneda.code}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE IDIOMA */}
      {showLanguageModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '8px', width: '800px', maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            
            {/* Header Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e7e7e7' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, color: '#333' }}>Selecciona tu idioma</h2>
              <button onClick={() => setShowLanguageModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666', lineHeight: 1 }}>×</button>
            </div>
            
            {/* Contenido Modal */}
            <div style={{ padding: '24px', overflowY: 'auto' }}>
              
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#333', marginBottom: '16px' }}>Recomendado para ti</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' }}>
                {languages.slice(0, 5).map(lang => (
                  <button 
                    key={`rec-${lang.code}`}
                    onClick={() => { changeLanguage(lang.code); setShowLanguageModal(false); }}
                    style={{ 
                      display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px',
                      background: language === lang.code ? '#f0f6fd' : 'transparent', 
                      border: language === lang.code ? '1px solid #006ce4' : '1px solid transparent', 
                      borderRadius: '4px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => { if(language !== lang.code) e.currentTarget.style.background = '#f5f5f5'; }}
                    onMouseOut={(e) => { if(language !== lang.code) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <img src={`https://flagcdn.com/w40/${lang.countryCode}.png`} alt={lang.name} style={{ width: '32px', borderRadius: '2px' }} />
                    <span style={{ fontSize: '0.9rem', color: '#333' }}>{lang.name}</span>
                  </button>
                ))}
              </div>
              
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#333', marginBottom: '16px' }}>Todos los idiomas</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {languages.map(lang => (
                  <button 
                    key={`all-${lang.code}`}
                    onClick={() => { changeLanguage(lang.code); setShowLanguageModal(false); }}
                    style={{ 
                      display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px',
                      background: language === lang.code ? '#f0f6fd' : 'transparent', 
                      border: language === lang.code ? '1px solid #006ce4' : '1px solid transparent', 
                      borderRadius: '4px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => { if(language !== lang.code) e.currentTarget.style.background = '#f5f5f5'; }}
                    onMouseOut={(e) => { if(language !== lang.code) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <img src={`https://flagcdn.com/w40/${lang.countryCode}.png`} alt={lang.name} style={{ width: '32px', borderRadius: '2px' }} />
                    <span style={{ fontSize: '0.9rem', color: '#333' }}>{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
    </nav>
  );
}
