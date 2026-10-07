import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

const C = { blue: '#006ce4', darkBlue: '#003b95', lightBlue: '#ebf3ff', green: '#008009', red: '#d32f2f', gray: '#595959', border: '#d4d4d4', text: '#1a1a1a' };

const TIPOS = [
  { id: 'hospedaje', icon: '🏨', label: 'Hospedaje', sub: 'Hotel, hostal, cabaña' },
  { id: 'vuelos', icon: '✈️', label: 'Vuelos', sub: 'Aerolínea' },
  { id: 'autos', icon: '🚗', label: 'Autos', sub: 'Rentadora de vehículos' },
  { id: 'atracciones', icon: '🎡', label: 'Atracciones', sub: 'Tours, parques, museos' },
];

const VACIO = { empresa: '', ruc: '', tipo: '', contactoNombre: '', email: '', telefono: '', ciudad: '', sitioWeb: '', descripcion: '' };

function validar(f) {
  const e = {};
  if (f.empresa.trim().length < 3) e.empresa = 'Escribe el nombre de tu empresa (mínimo 3 caracteres).';
  if (!/^\d{13}$/.test(f.ruc.replace(/\s/g, ''))) e.ruc = 'El RUC debe tener 13 dígitos.';
  if (!f.tipo) e.tipo = 'Elige qué tipo de servicio ofreces.';
  if (f.contactoNombre.trim().length < 3) e.contactoNombre = 'Escribe el nombre de la persona de contacto.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'Escribe un correo válido.';
  if (!/^\+?[\d\s-]{7,20}$/.test(f.telefono.trim())) e.telefono = 'Escribe un teléfono válido (solo números).';
  return e;
}

function mensajeError(err) {
  if (!err?.response) return 'No pudimos contactar al servidor. Revisa tu conexión e inténtalo de nuevo.';
  const d = err.response.data || {};
  const det = d.detail || d.message || d.title;
  return Array.isArray(det) ? det.join(' ') : det || 'No se pudo enviar la solicitud.';
}

function Campo({ id, label, error, opcional, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={id} style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: 6, color: C.text }}>
        {label} {opcional && <span style={{ fontWeight: 400, color: C.gray }}>(opcional)</span>}
      </label>
      {children}
      {error && <div id={`${id}-error`} role="alert" style={{ color: C.red, fontSize: '0.8rem', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

const input = (err) => ({
  width: '100%', boxSizing: 'border-box', padding: '11px 12px', fontSize: '0.95rem',
  border: `1px solid ${err ? C.red : C.border}`, borderRadius: 6, outlineColor: C.blue, fontFamily: 'inherit',
});

export function QuieroSerProveedorPage() {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState('');
  const [resultado, setResultado] = useState(null);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errores[k]) setErrores((x) => ({ ...x, [k]: undefined }));
  };

  const enviar = async (e) => {
    e.preventDefault();
    setErrorGeneral('');
    const e2 = validar(form);
    setErrores(e2);
    if (Object.keys(e2).length) {
      document.getElementById(Object.keys(e2)[0] === 'tipo' ? 'tipo-hospedaje' : Object.keys(e2)[0])?.focus();
      return;
    }
    setEnviando(true);
    try {
      const { data } = await api.post('/proveedores/solicitudes', { ...form, ruc: form.ruc.replace(/\s/g, '') });
      setResultado(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorGeneral(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  if (resultado) {
    return (
      <main style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
        <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>✅</div>
          <h1 style={{ fontSize: '1.5rem', color: C.darkBlue, margin: '8px 0' }}>¡Solicitud enviada!</h1>
          <p style={{ color: C.gray, lineHeight: 1.5 }}>{resultado.mensaje}</p>
          <div style={{ background: C.lightBlue, borderRadius: 8, padding: 16, margin: '20px 0' }}>
            <div style={{ fontSize: '0.8rem', color: C.gray, textTransform: 'uppercase', fontWeight: 600 }}>Código de solicitud</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: C.darkBlue, letterSpacing: '0.05em' }}>{resultado.codigo}</div>
            <div style={{ fontSize: '0.85rem', color: C.gray, marginTop: 4 }}>Estado: Pendiente de revisión</div>
          </div>
          <Link to="/" style={{ display: 'inline-block', background: C.blue, color: 'white', padding: '10px 24px', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>Volver al inicio</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 760, margin: '32px auto 48px', padding: '0 16px' }}>
      <div style={{ background: `linear-gradient(135deg, ${C.darkBlue}, ${C.blue})`, color: 'white', borderRadius: 12, padding: '28px 28px', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: '1.7rem' }}>Quiero ser proveedor</h1>
        <p style={{ margin: '8px 0 0', opacity: 0.92, lineHeight: 1.5 }}>
          Publica tu hotel, aerolínea, rentadora o atracción en Booking Ecuador. Completa el formulario y nuestro equipo revisará tu solicitud.
        </p>
      </div>

      <form onSubmit={enviar} noValidate style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: 28 }}>
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 20px' }}>
          <legend style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 10, color: C.text }}>¿Qué servicio ofreces?</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {TIPOS.map((t) => {
              const activo = form.tipo === t.id;
              return (
                <label key={t.id} htmlFor={`tipo-${t.id}`} style={{ border: `2px solid ${activo ? C.blue : errores.tipo ? C.red : C.border}`, background: activo ? C.lightBlue : 'white', borderRadius: 8, padding: '12px 10px', cursor: 'pointer', textAlign: 'center', position: 'relative' }}>
                  <input id={`tipo-${t.id}`} type="radio" name="tipo" value={t.id} checked={activo} onChange={set('tipo')} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
                  <div style={{ fontSize: '1.6rem' }}>{t.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t.label}</div>
                  <div style={{ fontSize: '0.75rem', color: C.gray }}>{t.sub}</div>
                </label>
              );
            })}
          </div>
          {errores.tipo && <div role="alert" style={{ color: C.red, fontSize: '0.8rem', marginTop: 6 }}>{errores.tipo}</div>}
        </fieldset>

        <h2 style={{ fontSize: '1rem', margin: '0 0 12px' }}>Datos de la empresa</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', columnGap: 16 }}>
          <Campo id="empresa" label="Nombre de la empresa" error={errores.empresa}>
            <input id="empresa" value={form.empresa} onChange={set('empresa')} autoComplete="organization" style={input(errores.empresa)} aria-invalid={!!errores.empresa} />
          </Campo>
          <Campo id="ruc" label="RUC" error={errores.ruc}>
            <input id="ruc" value={form.ruc} onChange={set('ruc')} inputMode="numeric" maxLength={13} placeholder="13 dígitos" style={input(errores.ruc)} aria-invalid={!!errores.ruc} />
          </Campo>
          <Campo id="ciudad" label="Ciudad" opcional>
            <input id="ciudad" value={form.ciudad} onChange={set('ciudad')} autoComplete="address-level2" style={input()} />
          </Campo>
          <Campo id="sitioWeb" label="Sitio web" opcional>
            <input id="sitioWeb" type="url" value={form.sitioWeb} onChange={set('sitioWeb')} placeholder="https://" style={input()} />
          </Campo>
        </div>

        <h2 style={{ fontSize: '1rem', margin: '8px 0 12px' }}>Persona de contacto</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', columnGap: 16 }}>
          <Campo id="contactoNombre" label="Nombre completo" error={errores.contactoNombre}>
            <input id="contactoNombre" value={form.contactoNombre} onChange={set('contactoNombre')} autoComplete="name" style={input(errores.contactoNombre)} aria-invalid={!!errores.contactoNombre} />
          </Campo>
          <Campo id="email" label="Correo electrónico" error={errores.email}>
            <input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" style={input(errores.email)} aria-invalid={!!errores.email} />
          </Campo>
          <Campo id="telefono" label="Teléfono" error={errores.telefono}>
            <input id="telefono" type="tel" value={form.telefono} onChange={set('telefono')} autoComplete="tel" placeholder="+593 99 123 4567" style={input(errores.telefono)} aria-invalid={!!errores.telefono} />
          </Campo>
        </div>

        <Campo id="descripcion" label="Cuéntanos sobre tu servicio" opcional>
          <textarea id="descripcion" rows={4} value={form.descripcion} onChange={set('descripcion')} maxLength={2000} placeholder="Ej.: 12 habitaciones frente al mar, desayuno incluido…" style={{ ...input(), resize: 'vertical' }} />
        </Campo>

        {errorGeneral && <div role="alert" style={{ background: '#ffebee', border: `1px solid ${C.red}`, color: C.red, borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: '0.9rem' }}>{errorGeneral}</div>}

        <button type="submit" disabled={enviando} style={{ width: '100%', background: C.blue, color: 'white', border: 'none', borderRadius: 6, padding: '13px', fontSize: '1rem', fontWeight: 700, cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.8 : 1 }}>
          {enviando ? 'Enviando…' : 'Enviar solicitud'}
        </button>
        <p style={{ fontSize: '0.78rem', color: C.gray, marginTop: 12, textAlign: 'center' }}>
          Al enviar aceptas que revisemos tus datos para verificar tu empresa. Consulta nuestra <Link to="/privacidad">política de privacidad</Link>.
        </p>
      </form>
    </main>
  );
}
