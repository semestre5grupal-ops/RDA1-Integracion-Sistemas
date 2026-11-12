import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  // Resuelve la URL a la que se debe volver tras autenticarse
  const resolveRedirect = () => {
    const fromState = location.state?.from;
    if (fromState) {
      if (typeof fromState === 'string' && fromState !== '/login') return fromState;
      if (typeof fromState === 'object' && fromState.pathname && fromState.pathname !== '/login') {
        return fromState.pathname + (fromState.search || '');
      }
    }
    const params = new URLSearchParams(location.search);
    const paramFrom = params.get('from') || params.get('returnUrl');
    if (paramFrom && paramFrom !== '/login') return paramFrom;

    const stored = sessionStorage.getItem('booking_return_url');
    if (stored && stored !== '/login') return stored;

    return '/';
  };

  const redirectTo = resolveRedirect();
  const redirectMessage = location.state?.message || null;

  // Persistir la ruta en sessionStorage para sobrevivir a recargas de página
  useEffect(() => {
    if (redirectTo && redirectTo !== '/' && redirectTo !== '/login') {
      sessionStorage.setItem('booking_return_url', redirectTo);
    }
  }, [redirectTo]);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [errors, setErrors] = useState({
    email: '',
    password: '',
    general: ''
  });

  useEffect(() => {
    if (user) {
      sessionStorage.removeItem('booking_return_url');
      navigate(redirectTo, { replace: true });
    }
  }, [user, navigate, redirectTo]);

  const handleEmailChange = (e) => {
    const rawValue = e.target.value;
    const hasInvalid = /[^a-zA-Z0-9.@_-]/.test(rawValue);
    const val = rawValue.replace(/[^a-zA-Z0-9.@_-]/g, '');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (hasInvalid) {
      setErrors(prev => ({ ...prev, email: 'Caracteres inválidos para correo electrónico.' }));
    } else {
      setErrors(prev => ({ ...prev, email: '', general: '' })); // clear general error on re-typing
    }
    
    if (val.length <= 30) setEmail(val);
  };

  const handlePasswordChange = (e) => {
    const rawValue = e.target.value;
    const hasSpaces = /\s/.test(rawValue);
    const val = rawValue.replace(/\s/g, '');

    if (hasSpaces) {
      setErrors(prev => ({ ...prev, password: 'La contraseña no puede contener espacios.' }));
    } else {
      setErrors(prev => ({ ...prev, password: '', general: '' })); // clear general error on re-typing
    }
    
    if (val.length <= 30) setPassword(val);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (errors.email || errors.password) return; // Prevent submission if there are validation errors

    setLoading(true);
    setErrors(prev => ({ ...prev, general: '' }));

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // Manejar mensajes comunes de Supabase
      if (signInError.message.includes('Invalid login credentials')) {
         setErrors(prev => ({ ...prev, general: 'Correo o contraseña invalidos' }));
      } else {
         setErrors(prev => ({ ...prev, general: signInError.message }));
      }
    } else {
      sessionStorage.removeItem('booking_return_url');
      navigate(redirectTo, { replace: true });
    }
    setLoading(false);
  };

  const inputStyle = (errorField) => ({
    width: '100%', 
    padding: '0.75rem', 
    borderRadius: '4px', 
    border: errorField ? '2px solid #d93025' : '1px solid #ccc',
    backgroundColor: errorField ? '#fce8e6' : '#fff',
    outline: 'none',
    transition: 'background-color 0.2s, border-color 0.2s'
  });

  const errorMsgStyle = { color: '#d93025', fontSize: '0.8rem', marginTop: '4px', fontWeight: '500' };

  return (
    <main className="main-content" id="contenido-principal">
      <div className="state-container" style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'left' }}>
        <h1 className="state-title" style={{ textAlign: 'center' }}>Iniciar sesión</h1>
        
        {redirectMessage && (
          <div style={{ color: '#856404', marginBottom: '1rem', textAlign: 'center', backgroundColor: '#fff3cd', padding: '10px 14px', borderRadius: '4px', fontWeight: '500', border: '1px solid #ffc107', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔒</span> {redirectMessage}
          </div>
        )}
        {errors.general && <div style={{ color: '#d93025', marginBottom: '1rem', textAlign: 'center', backgroundColor: '#fce8e6', padding: '10px', borderRadius: '4px', fontWeight: '500' }}>{errors.general}</div>}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <legend className="sr-only">Credenciales de acceso</legend>
          <div>
            <label htmlFor="login-email" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Correo electrónico</label>
            <input 
              id="login-email"
              type="email" 
              required 
              autoComplete="email"
              maxLength={30}
              value={email} 
              onChange={handleEmailChange}
              style={inputStyle(errors.email)}
            />
            {errors.email && <div style={errorMsgStyle}>{errors.email}</div>}
          </div>
          <div>
            <label htmlFor="login-password" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Contraseña</label>
            <input 
              id="login-password"
              type="password" 
              required 
              autoComplete="current-password"
              maxLength={30}
              value={password} 
              onChange={handlePasswordChange}
              style={inputStyle(errors.password)}
            />
            {errors.password && <div style={errorMsgStyle}>{errors.password}</div>}
          </div>
          <button 
            type="submit" 
            className="retry-btn" 
            disabled={loading}
            style={{ width: '100%', marginTop: '1rem', background: '#006ce4', color: '#fff', border: 'none', padding: '12px', borderRadius: '4px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer' }}
          >
            {loading ? 'Iniciando...' : 'Iniciar sesión'}
          </button>
          </fieldset>
        </form>

        <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
          ¿No tienes cuenta? <Link to="/register" state={{ from: redirectTo }} style={{ color: '#006ce4', fontWeight: '600', textDecoration: 'none' }}>Regístrate aquí</Link>
        </p>
      </div>
    </main>
  );
}
