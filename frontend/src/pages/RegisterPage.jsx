import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, supabaseAdmin } from '../services/supabase';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';

export function RegisterPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('CEDULA'); // 'CEDULA' o 'PASAPORTE'
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);


  const [errors, setErrors] = useState({
    nombre: '',
    apellido: '',
    cedula: '',
    telefono: '',
    email: '',
    password: '',
    general: ''
  });

  const [invalidFlash, setInvalidFlash] = useState({
    nombre: false,
    apellido: false,
    cedula: false,
    telefono: false
  });

  const triggerFlash = (field) => {
    setInvalidFlash(prev => ({ ...prev, [field]: true }));
    setTimeout(() => {
      setInvalidFlash(prev => ({ ...prev, [field]: false }));
    }, 400); // El fondo rojo durará 400ms
  };

  // Validadores
  const validarCedulaEcuatoriana = (ced) => {
    if (ced.length !== 10) return false;
    const digitoRegion = parseInt(ced.substring(0, 2), 10);
    if (digitoRegion < 1 || digitoRegion > 24) return false;
    const tercerDigito = parseInt(ced.substring(2, 3), 10);
    if (tercerDigito >= 6) return false;
    const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    const verificador = parseInt(ced.substring(9, 10), 10);
    let suma = 0;
    for (let i = 0; i < 9; i++) {
      let valor = parseInt(ced.charAt(i), 10) * coeficientes[i];
      if (valor >= 10) valor -= 9;
      suma += valor;
    }
    const digitoCalculado = (Math.ceil(suma / 10) * 10) - suma;
    return digitoCalculado === verificador;
  };

  // Requisitos de contraseña
  const reqLength = password.length >= 8;
  const reqUpper = /[A-Z]/.test(password);
  const reqLower = /[a-z]/.test(password);
  const reqNumber = /[0-9]/.test(password);
  const reqSpecial = /[^A-Za-z0-9]/.test(password);

  const handleRegister = async (e) => {
    e.preventDefault();
    
    const newErrors = { nombre: '', apellido: '', cedula: '', telefono: '', email: '', password: '', general: '' };
    let hasError = false;

    if (nombre.trim().length < 3) {
      newErrors.nombre = 'El nombre debe tener al menos 3 letras.';
      hasError = true;
    }
    if (apellido.trim().length < 3) {
      newErrors.apellido = 'El apellido debe tener al menos 3 letras.';
      hasError = true;
    }
    if (tipoDocumento === 'PASAPORTE') {
      if (!/^[A-Za-z0-9]{6,15}$/.test(cedula.trim())) {
        newErrors.cedula = 'El pasaporte debe ser alfanumérico y tener entre 6 y 15 caracteres.';
        hasError = true;
      }
    } else {
      if (!validarCedulaEcuatoriana(cedula)) {
        newErrors.cedula = 'La cédula es inválida (verifique los 10 dígitos).';
        hasError = true;
      }
    }
    if (telefono.length < 10 || !telefono.startsWith('09') || /^09(\d)\1{7}$/.test(telefono)) {
      newErrors.telefono = 'El celular debe ser válido (10 dígitos, iniciar con 09).';
      hasError = true;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > 30) {
      newErrors.email = 'Por favor ingresa un correo electrónico válido.';
      hasError = true;
    }
    if (!reqLength || !reqUpper || !reqLower || !reqNumber || !reqSpecial || password.length > 30) {
      newErrors.password = 'La contraseña no cumple con los requisitos de seguridad.';
      hasError = true;
    }

    setErrors(newErrors);

    if (hasError) return;

    setLoading(true);

    // Verificar si la identificación ya se encuentra registrada en Booking Central
    try {
      const { data: checkData } = await api.post('/clientes/validar-identificacion', {
        identificacion: cedula.trim(),
        tipo: tipoDocumento
      });
      if (checkData && checkData.registrado) {
        setErrors(prev => ({
          ...prev,
          cedula: `Esta identificación ya se encuentra registrada en Booking Central (${checkData.cliente_existente?.email_enmascarado || 'cuenta existente'}). Por favor inicia sesión o recupera tu cuenta.`
        }));
        triggerFlash('cedula');
        setLoading(false);
        return;
      }
    } catch (_) {
      // Si la API no responde, continúa con la validación de Supabase
    }

    let sessionEstablished = false;

    const userMeta = {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      name: `${nombre.trim()} ${apellido.trim()}`,
      full_name: `${nombre.trim()} ${apellido.trim()}`,
      cedula: cedula.trim(),
      tipo_documento: tipoDocumento,
      telefono
    };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userMeta
      }
    });

    if (error && (error.status === 429 || error.message?.includes('rate limit') || error.message?.includes('Database error')) && supabaseAdmin) {
      try {
        const adminRes = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: userMeta
        });
        if (adminRes.error) {
          let errorMsg = adminRes.error.message;
          if (errorMsg.toLowerCase().includes('already registered') || errorMsg.toLowerCase().includes('already exists')) {
             errorMsg = 'Este correo electrónico ya se encuentra registrado. Debes usar un correo diferente.';
          } else if (adminRes.error.status === 429) {
             errorMsg = 'Demasiados intentos de registro desde tu conexión. Por favor, espera unos minutos e intenta de nuevo.';
          } else if (adminRes.error.status === 400) {
             errorMsg = 'El correo ingresado ya existe o es inválido. Prueba con un correo diferente.';
          }
          setErrors(prev => ({ ...prev, general: errorMsg }));
          setLoading(false);
          return;
        } else {
          // Creación exitosa por admin
          sessionEstablished = true; // fingimos sesión para redirigir, o intentamos login real abajo
        }
      } catch (err) {
        setErrors(prev => ({ ...prev, general: 'Error del servidor al registrar usuario administrador.' }));
        setLoading(false);
        return;
      }
    } else if (error) {
      let errorMsg = error.message;
      if (errorMsg.toLowerCase().includes('already registered')) {
        errorMsg = 'Este correo electrónico ya se encuentra registrado. Debes usar un correo diferente para crear una cuenta nueva.';
      } else if (error.status === 429 || errorMsg.toLowerCase().includes('rate limit')) {
        errorMsg = 'Has intentado registrarte demasiadas veces (límite de seguridad). Espera una hora o intenta con otro correo.';
      } else if (error.status === 400) {
        errorMsg = 'Solicitud inválida. Es probable que este correo ya esté en uso o tenga un formato bloqueado. Prueba con otro correo.';
      } else if (errorMsg.includes('Database error saving new user')) {
        errorMsg = 'Error al registrar usuario en la base de datos. Por favor, intenta de nuevo.';
      }
      setErrors(prev => ({ ...prev, general: errorMsg }));
      setLoading(false);
      return;
    }

    // Si llegamos aquí sin error en signUp, revisamos la data retornada:
    if (data?.user) {
      // Detección de cuenta falsa por ofuscación de Supabase (correo ya existía)
      if (data.user.identities && data.user.identities.length === 0) {
        setErrors(prev => ({ ...prev, general: 'Este correo electrónico ya se encuentra registrado. Usa uno diferente o inicia sesión.' }));
        setLoading(false);
        return;
      }
    }

    if (data?.session) {
      sessionEstablished = true;
    } else if (data?.user?.id) {
      // El usuario se creó pero NO hay sesión (requiere confirmar correo)
      if (supabaseAdmin) {
        try {
          // Intentamos auto-confirmarlo si tenemos la llave admin
          await supabaseAdmin.auth.admin.updateUserById(data.user.id, { email_confirm: true });
          const { data: loginData } = await supabase.auth.signInWithPassword({ email, password });
          if (loginData?.session) {
            sessionEstablished = true;
          }
        } catch (err) {
          console.warn('Auto confirm error:', err);
        }
      } 
      
      if (!sessionEstablished) {
        // Mostrar mensaje verde de éxito pidiendo confirmación de correo
        setErrors(prev => ({ ...prev, general: '¡Registro exitoso! Por seguridad, revisa tu correo electrónico para confirmar tu cuenta y luego inicia sesión.' }));
        // Opcionalmente podríamos vaciar el formulario aquí para dar feedback de éxito
        setNombre('');
        setApellido('');
        setCedula('');
        setTelefono('');
        setEmail('');
        setPassword('');
        setLoading(false);
        setLoading(false);
        return; // Terminamos aquí sin redirigir, ya que debe confirmar
      }
    }

    if (sessionEstablished) {
      window.location.href = '/';
    }
    setLoading(false);
  };

  // Sanitizadores con mensajes de error en tiempo real
  const handleNombreChange = (e) => {
    const rawValue = e.target.value;
    const hasInvalid = /[^A-Za-záéíóúÁÉÍÓÚñÑ\s]/.test(rawValue);
    const hasSpaces = /\s{2,}/.test(rawValue) || /^\s/.test(rawValue);

    let val = rawValue.replace(/[^A-Za-záéíóúÁÉÍÓÚñÑ\s]/g, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' ');

    let errorMsg = '';
    if (hasInvalid) {
      errorMsg = 'Solo se permiten letras, sin números ni símbolos.';
    } else if (hasSpaces) {
      errorMsg = 'No se permiten espacios al inicio ni consecutivos.';
    }

    setErrors(prev => ({ ...prev, nombre: errorMsg, general: '' }));
    if (val.length <= 50) setNombre(val);
  };

  const handleApellidoChange = (e) => {
    const rawValue = e.target.value;
    const hasInvalid = /[^A-Za-záéíóúÁÉÍÓÚñÑ\s]/.test(rawValue);
    const hasSpaces = /\s{2,}/.test(rawValue) || /^\s/.test(rawValue);

    let val = rawValue.replace(/[^A-Za-záéíóúÁÉÍÓÚñÑ\s]/g, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' ');

    let errorMsg = '';
    if (hasInvalid) {
      errorMsg = 'Solo se permiten letras, sin números ni símbolos.';
    } else if (hasSpaces) {
      errorMsg = 'No se permiten espacios al inicio ni consecutivos.';
    }

    setErrors(prev => ({ ...prev, apellido: errorMsg, general: '' }));
    if (val.length <= 50) setApellido(val);
  };

  const handleCedulaChange = (e) => {
    const rawValue = e.target.value;
    if (tipoDocumento === 'PASAPORTE') {
      const sanitized = rawValue.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      let errorMsg = '';
      if (/[^A-Za-z0-9]/.test(rawValue)) {
        errorMsg = 'El pasaporte solo puede contener letras y números.';
      }
      setErrors(prev => ({ ...prev, cedula: errorMsg, general: '' }));
      if (sanitized.length <= 15) setCedula(sanitized);
    } else {
      const hasInvalid = /\D/.test(rawValue);
      const val = rawValue.replace(/\D/g, '');

      let errorMsg = '';
      if (hasInvalid) {
        errorMsg = 'La cédula solo puede contener números.';
      }

      setErrors(prev => ({ ...prev, cedula: errorMsg, general: '' }));
      if (val.length <= 10) setCedula(val);
    }
  };

  const handleCedulaBlur = async () => {
    if (!cedula || cedula.length < 6) return;
    try {
      const { data: valData } = await api.post('/clientes/validar-identificacion', {
        identificacion: cedula.trim(),
        tipo: tipoDocumento
      });
      if (valData && !valData.valido) {
        setErrors(prev => ({ ...prev, cedula: valData.razon || 'Identificación inválida.', general: '' }));
      } else if (valData && valData.registrado) {
        setErrors(prev => ({
          ...prev,
          cedula: `Esta identificación ya se encuentra registrada en Booking Central (${valData.cliente_existente?.email_enmascarado || 'cuenta existente'}). Por favor inicia sesión.`,
          general: ''
        }));
      }
    } catch (_) {}
  };

  const handleTelefonoChange = (e) => {
    const rawValue = e.target.value;
    const hasInvalid = /\D/.test(rawValue);
    const val = rawValue.replace(/\D/g, '');

    let errorMsg = '';
    if (hasInvalid) {
      errorMsg = 'El teléfono solo puede contener números.';
    } else if (val.length > 0 && !val.startsWith('0')) {
      errorMsg = 'El celular debe iniciar con 09.';
    } else if (val.length > 1 && !val.startsWith('09')) {
      errorMsg = 'El celular debe iniciar con 09.';
    }

    setErrors(prev => ({ ...prev, telefono: errorMsg, general: '' }));
    if (val.length <= 10) setTelefono(val);
  };

  const handleEmailChange = (e) => {
    const rawValue = e.target.value;
    const hasInvalid = /[^a-zA-Z0-9.@_-]/.test(rawValue);
    const val = rawValue.replace(/[^a-zA-Z0-9.@_-]/g, '');

    let errorMsg = '';
    if (hasInvalid) {
      errorMsg = 'Caracteres inválidos para correo electrónico.';
    }

    setErrors(prev => ({ ...prev, email: errorMsg, general: '' }));
    if (val.length <= 30) setEmail(val);
  };

  const handlePasswordChange = (e) => {
    const rawValue = e.target.value;
    const hasSpaces = /\s/.test(rawValue);
    const val = rawValue.replace(/\s/g, '');

    if (hasSpaces) {
      setErrors(prev => ({ ...prev, password: 'La contraseña no puede contener espacios.', general: '' }));
    } else {
      setErrors(prev => ({ ...prev, password: '', general: '' }));
    }
    setPassword(val);
  };

  const inputStyle = (errorField) => ({
    width: '100%', 
    padding: '0.75rem', 
    borderRadius: '4px', 
    border: errorField ? '2px solid #d93025' : '1px solid #ccc',
    backgroundColor: errorField ? '#fce8e6' : '#fff', // Fondo rojo si hay error
    outline: 'none',
    transition: 'background-color 0.2s, border-color 0.2s'
  });

  const labelStyle = { display: 'block', marginBottom: '0.5rem', fontWeight: '500' };
  const errorMsgStyle = { color: '#d93025', fontSize: '0.8rem', marginTop: '4px', fontWeight: '500' };

  return (
    <main className="main-content" id="contenido-principal">
      <div className="state-container" style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'left' }}>
        <h1 className="state-title" style={{ textAlign: 'center' }}>Crear una cuenta</h1>
        
        {errors.general && <div style={{ color: '#d93025', marginBottom: '1rem', textAlign: 'center', backgroundColor: '#fce8e6', padding: '10px', borderRadius: '4px', fontWeight: '500' }}>{errors.general}</div>}

        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <legend className="sr-only">Datos personales</legend>
          <div>
            <label htmlFor="reg-nombre" style={labelStyle}>Nombre</label>
            <input 
              id="reg-nombre"
              type="text" 
              required 
              autoComplete="given-name"
              value={nombre} 
              onChange={handleNombreChange}
              placeholder="Ej. Juan"
              style={inputStyle(errors.nombre)}
            />
            {errors.nombre && <div style={errorMsgStyle}>{errors.nombre}</div>}
          </div>
          
          <div>
            <label htmlFor="reg-apellido" style={labelStyle}>Apellido</label>
            <input 
              id="reg-apellido"
              type="text" 
              required 
              autoComplete="family-name"
              value={apellido} 
              onChange={handleApellidoChange}
              placeholder="Ej. Pérez"
              style={inputStyle(errors.apellido)}
            />
            {errors.apellido && <div style={errorMsgStyle}>{errors.apellido}</div>}
          </div>
          
          <div>
            <label htmlFor="reg-tipo-doc" style={labelStyle}>Tipo de Identificación</label>
            <select
              id="reg-tipo-doc"
              value={tipoDocumento}
              onChange={(e) => {
                setTipoDocumento(e.target.value);
                setCedula('');
                setErrors(prev => ({ ...prev, cedula: '', general: '' }));
              }}
              style={{
                ...inputStyle(false),
                cursor: 'pointer',
                backgroundColor: '#ffffff',
                fontWeight: '600'
              }}
            >
              <option value="CEDULA">🇪🇨 Cédula Ecuatoriana (10 dígitos)</option>
              <option value="PASAPORTE">🌐 Pasaporte Extranjero</option>
            </select>
          </div>

          <div>
            <label htmlFor="reg-cedula" style={labelStyle}>
              {tipoDocumento === 'PASAPORTE' ? 'Número de Pasaporte' : 'Cédula de Identidad'}
            </label>
            <input 
              id="reg-cedula"
              type="text" 
              required 
              autoComplete="off"
              value={cedula} 
              onChange={handleCedulaChange}
              onBlur={handleCedulaBlur}
              placeholder={tipoDocumento === 'PASAPORTE' ? 'Ej. A12345678 (6 a 15 caracteres)' : '10 dígitos numéricos'}
              style={inputStyle(errors.cedula)}
            />
            {errors.cedula && <div style={errorMsgStyle}>{errors.cedula}</div>}
          </div>
          
          <div>
            <label htmlFor="reg-telefono" style={labelStyle}>Teléfono</label>
            <input 
              id="reg-telefono"
              type="tel" 
              required 
              autoComplete="tel-national"
              maxLength={10}
              value={telefono} 
              onChange={handleTelefonoChange}
              placeholder="Ej. 0912345678"
              style={inputStyle(errors.telefono)}
            />
            {errors.telefono && <div style={errorMsgStyle}>{errors.telefono}</div>}
          </div>
          
          <div>
            <label htmlFor="reg-email" style={labelStyle}>Correo electrónico</label>
            <input 
              id="reg-email"
              type="email" 
              required 
              autoComplete="email"
              maxLength={30}
              value={email} 
              onChange={handleEmailChange}
              placeholder="ejemplo@correo.com"
              style={inputStyle(errors.email)}
            />
            {errors.email && <div style={errorMsgStyle}>{errors.email}</div>}
          </div>
          
          <div>
            <label htmlFor="reg-password" style={labelStyle}>Contraseña</label>
            <input 
              id="reg-password"
              type="password" 
              required 
              autoComplete="new-password"
              maxLength={30}
              value={password} 
              onChange={handlePasswordChange}
              placeholder="Crea una contraseña segura"
              style={{ ...inputStyle(errors.password), marginBottom: '8px' }}
            />
            <div style={{ fontSize: '0.75rem', color: '#555', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ color: reqLength ? '#1e8e3e' : '#595959' }}>{reqLength ? '✓' : '○'} Al menos 8 caracteres</span>
              <span style={{ color: reqUpper ? '#1e8e3e' : '#595959' }}>{reqUpper ? '✓' : '○'} Al menos 1 mayúscula</span>
              <span style={{ color: reqLower ? '#1e8e3e' : '#595959' }}>{reqLower ? '✓' : '○'} Al menos 1 minúscula</span>
              <span style={{ color: reqNumber ? '#1e8e3e' : '#595959' }}>{reqNumber ? '✓' : '○'} Al menos 1 número</span>
              <span style={{ color: reqSpecial ? '#1e8e3e' : '#595959' }}>{reqSpecial ? '✓' : '○'} Al menos 1 símbolo especial (!@#$%^&*)</span>
            </div>
            {errors.password && <div style={{...errorMsgStyle, marginTop: '8px'}}>{errors.password}</div>}
          </div>
          
          <button 
            type="submit" 
            className="retry-btn" 
            disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem', background: '#006ce4', color: '#fff', border: 'none', padding: '12px', borderRadius: '4px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer' }}
          >
            {loading ? 'Registrando...' : 'Crear cuenta'}
          </button>
          </fieldset>
        </form>

        <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
          ¿Ya tienes cuenta? <Link to="/login" style={{ color: '#006ce4', fontWeight: '600', textDecoration: 'none' }}>Inicia sesión aquí</Link>
        </p>
      </div>
    </main>
  );
}
