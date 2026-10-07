import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../hooks/useAuth';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { crearReserva } from '../services/vuelosApi';
import { obtenerHuellaDispositivo, formatearMoneda } from '../services/formato';
import { savePendingReservation } from '../services/offlineSync';
import { enviarFacturaTrasCompra } from '../services/envioFactura';
import { useTelemetry } from '../hooks/useTelemetry';
import { OfflineReservaModal } from './OfflineReservaModal';

const COUNTRIES = [
  { code: 'ECU', name: 'Ecuador' },
  { code: 'COL', name: 'Colombia' },
  { code: 'PER', name: 'Perú' },
  { code: 'ARG', name: 'Argentina' },
  { code: 'CHL', name: 'Chile' },
  { code: 'USA', name: 'Estados Unidos' },
  { code: 'MEX', name: 'México' },
  { code: 'ESP', name: 'España' },
  { code: 'BRA', name: 'Brasil' },
];


/**
 * Formulario de detalles de pasajeros y pago (`POST /vuelos/bookings`).
 *
 * ── Que es "simulado" y que no ───────────────────────────────────────────────
 * El campo de pago NO simula un cobro: segun el contrato, `BookingRequest`
 * lleva un `paymentReference` que genero otra API de pagos, y el endpoint
 * declara explicitamente que "no procesa tarjetas, 3DS, autorizacion ni captura".
 * Aqui se pide correo y telefono (`ContactInfo`) y se genera una referencia
 * local. Pedir un numero de tarjeta seria inventar un endpoint de cobro que no
 * existe y meter datos financieros en este servicio.
 *
 * ── Cuantos formularios se pintan ───────────────────────────────────────────
 * Uno por pasajero, generado desde el desglose que el usuario eligio en la
 * busqueda (`adults`, `youths`, `children`, `infants`). El backend valida que
 * el numero coincida con el del hold, asi que el formulario DEBE generar
 * exactamente los mismos: si se equivoca, la reserva se rechaza con un 400
 *Despues de haber retenido el cupo.
 *
 * ── Un INFANT necesita `associatedAdultId` ──────────────────────────────────
 * El DDL lo exige como equivalencia bidireccional:
 *     CHECK ((pas_tipo = 'INFANT') = (pas_adultoasociadoid IS NOT NULL))
 * o sea, obligatorio para INFANT y PROHIBIDO para el resto. Por eso el selector
 * de adulto asociado SOLO se pinta para infantes, y su primer valor es el
 * primer adulto del formulario.
 *
 * ── Idempotencia ────────────────────────────────────────────────────────────
 * La clave se genera al ABRIR el modal y se reutiliza en los reintentos. Es
 * todavia mas importante que en el hold: un doble clic en "Confirmar pago"
 * crearia dos reservas con dos PNR distintos sobre el mismo cupo.
 *
 * ── Accesibilidad ───────────────────────────────────────────────────────────
 * · `role="dialog"` + `aria-modal` + `aria-labelledby`, con `useFocusTrap`.
 * · Cada campo tiene `<label htmlFor>`; los errores usan `aria-describedby` y
 *   `role="alert"`.
 * · Los tipos de documento y el genero son radios en `radiogroup`, no `<select>`:
 *   son pocas opciones excluyentes y se recorren mejor con teclado.
 * · Al cambiar de pasajero se conservan los datos ya escritos.
 */
const TIPOS_DOCUMENTO = [
  { valor: 'NATIONAL_ID', texto: 'Cédula de identidad' },
  { valor: 'PASSPORT', texto: 'Pasaporte' },
];

const GENEROS = [
  { valor: 'F', texto: 'F' },
  { valor: 'M', texto: 'M' },
  { valor: 'X', texto: 'X' },
];

const ETIQUETA_TIPO = {
  ADULT: 'Adulto',
  YOUTH: 'Joven',
  CHILD: 'Niño',
  INFANT: 'Infante',
};

/** Desglose del contrato -> lista ordenada de tipos, para generar los formularios. */
function distribuir(tipos) {
  const lista = [];
  const anadir = (tipo, n) => {
    for (let i = 0; i < n; i++) lista.push(tipo);
  };
  anadir('ADULT', tipos?.adults ?? 1);
  anadir('YOUTH', tipos?.youths ?? 0);
  anadir('CHILD', tipos?.children ?? 0);
  anadir('INFANT', tipos?.infants ?? 0);
  return lista;
}

/** Plantilla vacia de un pasajero. */
function pasajeroVacio(tipo, indice, idsAdultos) {
  return {
    passengerId: `pax-${indice + 1}`,
    passengerType: tipo,
    // Un infante nace associado al primer adulto: es el caso mayoritario y
    // evita que el usuario tenga que elegirlo a mano.
    associatedAdultId: tipo === 'INFANT' ? (idsAdultos[0] ?? null) : null,
    // Los NOMBRES son los del DTO, no traducciones al español. Mantenerlos
    // alineados evita toda una clase de fallos: en una version anterior de
    // este archivo el estado local usaba `nombre`/`apellido`/`documento`
    // mientras el DTO pedia `firstName`/`lastName`/`documentNumber`. La
    // validacion leia `p.nombre` (undefined), `undefined.trim()` reventaba, y
    // como la excepcion ocurria DENTRO de `alEnviar` antes de `setErrores`, el
    // formulario se quedaba en silencio: cero errores y cero peticiones, sin
    // mensaje en consola. Los nombres en español se usan solo en los ETIQUETES.
    firstName: '',
    lastName: '',
    documentType: 'NATIONAL_ID',
    documentNumber: '',
    nationality: 'ECU',
    birthDate: '',
    gender: '',
    email: '',
    phone: '',
  };
}

/**
 * Reglas de validacion, una por campo del pasajero.
 *
 * Las claves COINCIDEN con los nombres del estado local, que a su vez coinciden
 * con los del DTO. Si divergen, el error es silencioso (ver nota de arriba).
 */
const REGLAS = {
  firstName: (v) => (v && v.trim() ? '' : 'El nombre es obligatorio.'),
  lastName: (v) => (v && v.trim() ? '' : 'El apellido es obligatorio.'),
  documentNumber: (v) =>
    v && /^[A-Z0-9][A-Z0-9-]{3,19}$/.test(v.trim())
      ? ''
      : 'Debe tener entre 4 y 20 caracteres alfanumericos en mayusculas.',
  nationality: (v) =>
    v && v.trim() !== ''
      ? ''
      : 'Debe seleccionar una nacionalidad.',
  birthDate: (v) => {
    if (!v) return 'La fecha de nacimiento es obligatoria.';
    if (v > new Date().toISOString().slice(0, 10)) return 'No puede ser futura.';
    return '';
  },
  gender: (v) => (v ? '' : 'Selecciona una opcion.'),
  email: (v) =>
    v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? '' : 'Correo no valido.',
  phone: (v) =>
    v && /^\+?[0-9]{7,20}$/.test(v.trim())
      ? ''
      : 'Entre 7 y 20 digitos, con + opcional.',
};

export function FormularioReserva({ abierto, hold, pasajeros, onCerrar, onConfirmada }) {
  const { user } = useAuth();
  const isAdmin = user?.email === 'admin@booking.com' || user?.email === 'alejandroflores@booking.com' || user?.user_metadata?.role === 'admin';
  const navigate = useNavigate();
  const refDialogo = useRef(null);
  const idBase = useId();
  const { trackEvent } = useTelemetry();

  const tipos = useMemo(() => distribuir(pasajeros), [pasajeros]);
  const [lista, setLista] = useState([]);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState(null);
  const claveIdempotencia = useRef(null);
  const refContenedor = useRef(null);

  useFocusTrap(abierto, onCerrar, refDialogo);

  const [tiempoRestante, setTiempoRestante] = useState('');

  useEffect(() => {
    if (!abierto || !hold?.expiresAt) return;
    let intervalId;
    const updateTimer = () => {
      const remaining = new Date(hold.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setTiempoRestante('00:00');
        clearInterval(intervalId); // Ensure we don't trigger multiple times
        alert('El tiempo de reserva ha expirado. Por favor vuelve a seleccionar tu vuelo.');
        onCerrar();
      } else {
        const min = Math.floor(remaining / 60000);
        const sec = Math.floor((remaining % 60000) / 1000);
        setTiempoRestante(`${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`);
      }
    };
    updateTimer();
    intervalId = setInterval(updateTimer, 1000);
    return () => clearInterval(intervalId);
  }, [abierto, hold?.expiresAt, onCerrar]);

  const [pasoActual, setPasoActual] = useState(1); // 1: Pasajeros, 2: Extras, 3: Pago
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [pendingOfflinePay, setPendingOfflinePay] = useState(false);

  // Al abrir: un formulario por pasajero, con una clave de idempotencia nueva
  // para esta intencion de negocio.
  useEffect(() => {
    if (!abierto || !hold) return;
    setPasoActual(1);
    claveIdempotencia.current = uuidv4();
    setErrorGeneral(null);
    setErrores({});
    trackEvent('checkout_started', 'vuelos');

    const idsAdultos = [];
    for (let i = 0; i < (tipos.filter((t) => t === 'ADULT').length || 1); i++) {
      idsAdultos.push(`pax-${i + 1}`);
    }
    setLista(tipos.map((tipo, i) => pasajeroVacio(tipo, i, idsAdultos)));
  }, [abierto, hold, tipos]);

  const cambiar = useCallback((indice, campo, valor) => {
    setLista((prev) =>
      prev.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p)),
    );
  }, []);

  /**
   * Normaliza a mayusculas los campos que el DDL exige en mayusculas
   * (`nacionalidad ^[A-Z]{3}$`, documento alfanumerico). Se hace al escribir y no
   * al enviar para que el usuario vea lo que va a enviarse sin sorpresas.
   */
  const cambiarNormalizado = useCallback(
    (indice, campo, valor) => {
      if (campo === 'nationality' || campo === 'documentNumber') {
        cambiar(indice, campo, valor.toUpperCase());
      } else {
        cambiar(indice, campo, valor);
      }
    },
    [cambiar],
  );

  const validar = useCallback(() => {
    const nuevos = {};
    const vistos = new Set();

    lista.forEach((p, i) => {
      const prefijo = `p${i}`;
      if (vistos.has(p.passengerId)) {
        nuevos[`${prefijo}.passengerId`] = 'El passengerId esta repetido.';
      }
      vistos.add(p.passengerId);

      for (const [campo, regla] of Object.entries(REGLAS)) {
        const mensaje = regla(p[campo], p);
        if (mensaje) nuevos[`${prefijo}.${campo}`] = mensaje;
      }

      if (p.passengerType === 'INFANT' && !p.associatedAdultId) {
        nuevos[`${prefijo}.associatedAdultId`] =
          'Un infante debe ir asociado a un adulto del formulario.';
      }
      if (p.passengerType !== 'INFANT' && p.associatedAdultId) {
        nuevos[`${prefijo}.associatedAdultId`] =
          'Solo un infante puede llevar adulto asociado.';
      }
      // Coherencia con el DDL: el nacimiento de un infante debe ser posterior
      // al de su adulto, y el de un nino menor que el de un adulto.
      if (p.passengerType === 'CHILD' || p.passengerType === 'INFANT') {
        const adultos = lista.filter((o) => o.passengerType === 'ADULT' && o.birthDate);
        if (adultos.some((a) => a.birthDate >= p.birthDate)) {
          nuevos[`${prefijo}.birthDate`] =
            'Un menor no puede nacer antes que su adulto acompañante.';
        }
      }
    });

    setErrores(nuevos);
    return nuevos;
  }, [lista]);

  const alEnviar = useCallback(
    async (evento) => {
      evento.preventDefault();
      if (enviando) return;

      if (pasoActual === 1) {
        const erroresValidacion = validar();
        if (Object.keys(erroresValidacion).length > 0) {
          setErrorGeneral('Por favor, revisa que todos los campos obligatorios esten llenos correctamente antes de enviar.');
          return;
        }
        setErrorGeneral(null);
        setPasoActual(2);
        trackEvent('form_step_completed', 'vuelos', { step: 1 });
        return;
      }

      if (pasoActual === 2) {
        if (!user) {
          navigate('/login');
          return;
        }
        setErrorGeneral(null);
        setPasoActual(3);
        trackEvent('form_step_completed', 'vuelos', { step: 2 });
        return;
      }

      // En el paso 3 (pago), si no hay red, mostrar modal ANTES de guardar
      if (pasoActual === 3 && !navigator.onLine && !pendingOfflinePay) {
        setPendingOfflinePay(true);
        setShowOfflineModal(true);
        return;
      }
      setPendingOfflinePay(false);

      setEnviando(true);
      setErrorGeneral(null);
      trackEvent('payment_started', 'vuelos');
      try {
        // Simulando pasarela de pagos
        await new Promise(resolve => setTimeout(resolve, 2000));

        const payload = {
          holdId: hold.holdId,
          passengers: lista.map((p) => ({
            passengerId: p.passengerId,
            passengerType: p.passengerType,
            ...(p.passengerType === 'INFANT' ? { associatedAdultId: p.associatedAdultId } : {}),
            firstName: p.firstName.trim(),
            lastName: p.lastName.trim(),
            documentType: p.documentType,
            documentNumber: p.documentNumber.trim(),
            nationality: p.nationality.trim(),
            birthDate: p.birthDate,
            gender: p.gender,
            contact: { email: p.email.trim(), phone: p.phone.trim() },
          })),
          payment: { paymentReference: `pay_${uuidv4().slice(0, 18)}` },
        };
        const idempotencyKey = claveIdempotencia.current ?? uuidv4();
        const fingerprint = obtenerHuellaDispositivo();

        // Datos de la factura. `monto` va como string porque `hold.lockedPrice.total`
        // lo declara `MoneyAmount` como texto y convertirlo a `float` aquí perdería
        // precisión en el redondeo que hace el generador del PDF.
        const datosFactura = {
          tipo: 'vuelo',
          pnr: idempotencyKey.toString().substring(0, 8).toUpperCase(),
          titulo: `Reserva de vuelo · ${hold?.itineraries?.length ?? 1} itinerario(s)`,
          total: hold?.lockedPrice?.total,
          pasajeros: lista.map((p) => ({
            firstName: p.firstName,
            lastName: p.lastName,
            documentNumber: p.documentNumber,
            email: p.email,
          })),
        };

        let reserva = null;

        if (!navigator.onLine) {
          await savePendingReservation('vuelo', { ...payload, fingerprint }, idempotencyKey, datosFactura);
          reserva = { bookingId: idempotencyKey, pnr: idempotencyKey, offline: true };
        } else {
          reserva = await crearReserva(payload, idempotencyKey, fingerprint);

          // El PNR lo asigna el servidor. Se usa el suyo y solo se recurre a la
          // clave de idempotencia si la respuesta viniera sin él, porque pintar un
          // PNR distinto al real daría dos referencias para la misma reserva.
          enviarFacturaTrasCompra({
            ...datosFactura,
            pnr: reserva?.pnr || datosFactura.pnr,
            creadaEn: reserva?.createdAt,
          });
        }

        trackEvent('payment_succeeded', 'vuelos');
        trackEvent('booking_confirmed', 'vuelos');

        onConfirmada?.(reserva, lista);
      } catch (fallo) {
        trackEvent('payment_failed', 'vuelos', { error: fallo?.message });
        setErrorGeneral(
          fallo?.response?.data?.detail ??
            'No se pudo completar la reserva. Intentalo de nuevo.',
        );
      } finally {
        setEnviando(false);
      }
    },
    [enviando, lista, hold, validar, onConfirmada, pasoActual],
  );

  if (!abierto || !hold) return null;

  const adultos = lista.filter((p) => p.passengerType === 'ADULT');

  return (
    <>
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <form
        className="modal modal-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idBase}-titulo`}
        ref={refDialogo}
        onSubmit={alEnviar}
        noValidate
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            <h2 className="modal-title" id={`${idBase}-titulo`}>
              Datos de los pasajeros
            </h2>
            <p className="modal-subtitulo">
              Cupo bloqueado por {hold.ttlMinutes} minutos · <strong>{tiempoRestante}</strong>
            </p>
          </div>
          <button
            type="button"
            className="modal-cerrar"
            onClick={onCerrar}
            aria-label="Cerrar sin confirmar"
          >
            ✕
          </button>
        </div>

        <div className="modal-body" ref={refContenedor}>
          <p className="modal-nota-bloque">
            Los datos deben coincidir con el documento de viaje. Esta demo no
            cobra: el pago se referencia, no se procesa.
          </p>

          {pasoActual === 1 && lista.map((p, i) => {
            const err = (campo) => errores[`p${i}.${campo}`];
            const id = (campo) => `${idBase}-p${i}-${campo}`;
            const enlazado = (campo) => (err(campo) ? id(campo) : undefined);

            return (
              <fieldset className="bloque-pasajero" key={p.passengerId}>
                <legend className="bloque-pasajero-legend">
                  Pasajero {i + 1} · {ETIQUETA_TIPO[p.passengerType]}
                </legend>

                <div className="rejilla-campos">
                  <div className="campo">
                    <label className="modal-label" htmlFor={id('firstName')}>
                      Nombres <span aria-hidden="true">*</span>
                    </label>
                    <input
                      className={`modal-input ${err('firstName') ? 'es-error' : ''}`}
                      id={id('firstName')}
                      type="text"
                      value={p.firstName}
                      onChange={(e) => cambiar(i, 'firstName', e.target.value)}
                      aria-required="true"
                      aria-invalid={err('firstName') ? 'true' : 'false'}
                      aria-describedby={enlazado('firstName')}
                    />
                    {err('firstName') && (
                      <span className="modal-error-campo" role="alert">
                        {err('firstName')}
                      </span>
                    )}
                  </div>

                  <div className="campo">
                    <label className="modal-label" htmlFor={id('lastName')}>
                      Apellidos <span aria-hidden="true">*</span>
                    </label>
                    <input
                      className={`modal-input ${err('lastName') ? 'es-error' : ''}`}
                      id={id('lastName')}
                      type="text"
                      value={p.lastName}
                      onChange={(e) => cambiar(i, 'lastName', e.target.value)}
                      aria-required="true"
                      aria-invalid={err('lastName') ? 'true' : 'false'}
                      aria-describedby={enlazado('lastName')}
                    />
                    {err('lastName') && (
                      <span className="modal-error-campo" role="alert">
                        {err('lastName')}
                      </span>
                    )}
                  </div>

                  <div className="campo">
                    <label className="modal-label" htmlFor={id('documentType')}>
                      Tipo de documento <span aria-hidden="true">*</span>
                    </label>
                    <select
                      className="modal-input"
                      id={id('documentType')}
                      value={p.documentType}
                      onChange={(e) => cambiar(i, 'documentType', e.target.value)}
                    >
                      {TIPOS_DOCUMENTO.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.texto}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="campo">
                    <label className="modal-label" htmlFor={id('documentNumber')}>
                      Número de documento <span aria-hidden="true">*</span>
                    </label>
                    <input
                      className={`modal-input ${err('documentNumber') ? 'es-error' : ''}`}
                      id={id('documentNumber')}
                      type="text"
                      value={p.documentNumber}
                      onChange={(e) =>
                        cambiarNormalizado(i, 'documentNumber', e.target.value)
                      }
                      aria-required="true"
                      aria-invalid={err('documentNumber') ? 'true' : 'false'}
                      aria-describedby={enlazado('documentNumber')}
                    />
                    {err('documentNumber') && (
                      <span className="modal-error-campo" role="alert">
                        {err('documentNumber')}
                      </span>
                    )}
                  </div>

                  <div className="campo">
                    <label className="modal-label" htmlFor={id('nationality')}>
                      Nacionalidad <span aria-hidden="true">*</span>
                    </label>
                    <select
                      className={`modal-input ${err('nationality') ? 'es-error' : ''}`}
                      id={id('nationality')}
                      value={p.nationality}
                      onChange={(e) => cambiar(i, 'nationality', e.target.value)}
                      aria-required="true"
                      aria-invalid={err('nationality') ? 'true' : 'false'}
                      aria-describedby={enlazado('nationality')}
                    >
                      <option value="">Selecciona...</option>
                      {COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
                    {err('nationality') && (
                      <span className="modal-error-campo" role="alert">
                        {err('nationality')}
                      </span>
                    )}
                  </div>

                  <div className="campo">
                    <label className="modal-label" htmlFor={id('birthDate')}>
                      Fecha de nacimiento <span aria-hidden="true">*</span>
                    </label>
                    <input
                      className={`modal-input ${err('birthDate') ? 'es-error' : ''}`}
                      id={id('birthDate')}
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={p.birthDate}
                      onChange={(e) => cambiar(i, 'birthDate', e.target.value)}
                      aria-required="true"
                      aria-invalid={err('birthDate') ? 'true' : 'false'}
                      aria-describedby={enlazado('birthDate')}
                    />
                    {err('birthDate') && (
                      <span className="modal-error-campo" role="alert">
                        {err('birthDate')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Genero: radios, no <select>. Son tres opciones excluyentes
                    y el radio se recorre mucho mejor con teclado. */}
                <fieldset className="campo-grupo">
                  <legend className="modal-label">Género {p.passengerType === 'INFANT' ? '(opcional)' : '*'}</legend>
                  <div className="modal-radios-inline" role="radiogroup" aria-labelledby={id('gender-leyenda')}>
                    <span id={id('gender-leyenda')} className="sr-only">
                      Género
                    </span>
                    {GENEROS.map((g) => (
                      <label
                        key={g.valor}
                        className={`modal-radio-mini ${p.gender === g.valor ? 'activo' : ''}`}
                        htmlFor={id(`genero-${g.valor}`)}
                      >
                        <input
                          type="radio"
                          id={id(`genero-${g.valor}`)}
                          name={`${idBase}-genero-${i}`}
                          value={g.valor}
                          checked={p.gender === g.valor}
                          onChange={() => cambiar(i, 'gender', g.valor)}
                        />
                        {g.texto}
                      </label>
                    ))}
                  </div>
                  {err('gender') && (
                    <span className="modal-error-campo" role="alert">
                      {err('gender')}
                    </span>
                  )}
                </fieldset>

                {p.passengerType === 'INFANT' && (
                  <div className="campo campo-ancho">
                    <label className="modal-label" htmlFor={id('associatedAdultId')}>
                      Adulto acompañante <span aria-hidden="true">*</span>
                    </label>
                    <select
                      className={`modal-input ${err('associatedAdultId') ? 'es-error' : ''}`}
                      id={id('associatedAdultId')}
                      value={p.associatedAdultId ?? ''}
                      onChange={(e) => cambiar(i, 'associatedAdultId', e.target.value)}
                      aria-required="true"
                      aria-invalid={err('associatedAdultId') ? 'true' : 'false'}
                      aria-describedby={enlazado('associatedAdultId')}
                    >
                      <option value="">Selecciona un adulto</option>
                      {adultos.map((a, k) => (
                        <option key={a.passengerId} value={a.passengerId}>
                          Adulto {k + 1}
                          {a.firstName ? ` · ${a.firstName} ${a.lastName}`.trimEnd() : ''}
                        </option>
                      ))}
                    </select>
                    {err('associatedAdultId') && (
                      <span className="modal-error-campo" role="alert">
                        {err('associatedAdultId')}
                      </span>
                    )}
                  </div>
                )}

                {/* Contacto: el DDL hace pas_email y pas_telefono NOT NULL, asi
                    que se pide por pasajero y no una sola vez para la reserva. */}
                <div className="rejilla-campos">
                  <div className="campo">
                    <label className="modal-label" htmlFor={id('email')}>
                      Correo <span aria-hidden="true">*</span>
                    </label>
                    <input
                      className={`modal-input ${err('email') ? 'es-error' : ''}`}
                      id={id('email')}
                      type="email"
                      value={p.email}
                      onChange={(e) => cambiar(i, 'email', e.target.value)}
                      aria-required="true"
                      aria-invalid={err('email') ? 'true' : 'false'}
                      aria-describedby={enlazado('email')}
                    />
                    {err('email') && (
                      <span className="modal-error-campo" role="alert">
                        {err('email')}
                      </span>
                    )}
                  </div>

                  <div className="campo">
                    <label className="modal-label" htmlFor={id('phone')}>
                      Teléfono <span aria-hidden="true">*</span>
                    </label>
                    <input
                      className={`modal-input ${err('phone') ? 'es-error' : ''}`}
                      id={id('phone')}
                      type="tel"
                      placeholder="+593991234567"
                      value={p.phone}
                      onChange={(e) => cambiar(i, 'phone', e.target.value)}
                      aria-required="true"
                      aria-invalid={err('phone') ? 'true' : 'false'}
                      aria-describedby={enlazado('phone')}
                    />
                    {err('phone') && (
                      <span className="modal-error-campo" role="alert">
                        {err('phone')}
                      </span>
                    )}
                  </div>
                </div>
              </fieldset>
            );
          })}

          {pasoActual === 2 && (
            <div className="paso-extras" style={{ marginTop: '20px' }}>
              <h3 className="modal-title-secundario" style={{ fontSize: '1.25rem', marginBottom: '10px' }}>Selección de Asientos</h3>
              <p className="modal-nota-bloque">Selecciona tu asiento para cada pasajero.</p>
              
              {lista.map((p, i) => (
                <fieldset className="bloque-pasajero" key={p.passengerId}>
                  <legend className="bloque-pasajero-legend">
                    Pasajero {i + 1} · {p.firstName || ETIQUETA_TIPO[p.passengerType]}
                  </legend>
                  <div className="rejilla-campos">
                    <div className="campo">
                      <label className="modal-label" htmlFor={`${idBase}-p${i}-asiento`}>
                        Selección de Asiento
                      </label>
                      
                      <div className="mapa-asientos" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', maxWidth: '200px', marginTop: '10px' }}>
                        {['1A', '1B', '1C', '2A', '2B', '2C', '3A', '3B', '3C'].map((asiento) => {
                          const estaOcupado = false; // Aquí se podría conectar al backend
                          const estaSeleccionado = p.asiento === asiento;
                          
                          // Evitar que el mismo asiento lo seleccione otro pasajero
                          const loTieneOtro = lista.some((pas, idx) => pas.asiento === asiento && idx !== i);

                          return (
                            <button
                              key={asiento}
                              type="button"
                              className="btn-asiento"
                              disabled={estaOcupado || loTieneOtro}
                              onClick={() => cambiar(i, 'asiento', estaSeleccionado ? '' : asiento)}
                              style={{
                                padding: '10px 5px',
                                border: '2px solid',
                                borderColor: estaSeleccionado ? '#0066cc' : '#ccc',
                                borderRadius: '8px',
                                background: estaSeleccionado ? '#e6f0fa' : (loTieneOtro ? '#f1f1f1' : 'white'),
                                cursor: loTieneOtro ? 'not-allowed' : 'pointer',
                                color: loTieneOtro ? '#999' : 'inherit',
                                fontWeight: estaSeleccionado ? 'bold' : 'normal',
                                transition: 'all 0.2s',
                              }}
                              title={loTieneOtro ? 'Seleccionado por otro pasajero' : `Seleccionar asiento ${asiento}`}
                            >
                              {asiento}
                            </button>
                          );
                        })}
                      </div>
                      <small className="modal-nota-bloque" style={{ display: 'block', marginTop: '10px' }}>
                        {p.asiento ? `Asiento seleccionado: ${p.asiento}` : 'Ningún asiento seleccionado (asignación aleatoria).'}
                      </small>
                    </div>
                  </div>
                </fieldset>
              ))}
            </div>
          )}

          {pasoActual === 3 && (
            <div className="paso-pago" style={{ marginTop: '20px' }}>
              <h3 className="modal-title-secundario" style={{ fontSize: '1.25rem', marginBottom: '10px' }}>Pago Simulado</h3>
              <p className="modal-nota-bloque">
                El total a pagar es de <strong>{formatearMoneda(hold.lockedPrice?.total, hold.lockedPrice?.currency)}</strong>.
              </p>
              
              <div className="tarjeta-simulada" style={{ background: '#f5f7f9', padding: '20px', borderRadius: '12px', border: '1px solid #e1e4e8', marginTop: '20px' }}>
                <div className="campo">
                  <label className="modal-label">Número de tarjeta</label>
                  <input className="modal-input" type="text" placeholder="4111 1111 1111 1111" defaultValue="4111 1111 1111 1111" readOnly style={{ background: 'white' }} />
                </div>
                <div className="rejilla-campos" style={{ marginTop: '16px' }}>
                  <div className="campo">
                    <label className="modal-label">Vencimiento</label>
                    <input className="modal-input" type="text" placeholder="MM/AA" defaultValue="12/28" readOnly style={{ background: 'white' }} />
                  </div>
                  <div className="campo">
                    <label className="modal-label">CVC</label>
                    <input className="modal-input" type="text" placeholder="123" defaultValue="123" readOnly style={{ background: 'white' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {errorGeneral && (
            <p className="modal-error" role="alert">
              {errorGeneral}
            </p>
          )}
        </div>

        <div className="modal-foot">
          <div className="modal-precio">
              <span className="modal-precio-etiqueta">Total a pagar</span>
              <span className="modal-precio-valor">
                {formatearMoneda(hold.lockedPrice?.total, hold.lockedPrice?.currency)}
              </span>
            </div>
          <div className="modal-acciones">
              {pasoActual === 1 ? (
                <button type="button" className="btn-secundario" onClick={onCerrar}>
                  Cancelar
                </button>
              ) : (
                <button type="button" className="btn-secundario" onClick={() => setPasoActual(pasoActual - 1)} disabled={enviando}>
                  Atrás
                </button>
              )}
              {isAdmin && pasoActual === 3 ? (
                <div style={{ padding: '10px', background: '#f8d7da', color: '#721c24', borderRadius: '4px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 'bold' }}>
                  Los administradores no pueden pagar.
                </div>
              ) : (
                <button type="submit" className="btn-primario" disabled={enviando}>
                  {pasoActual === 1 && 'Continuar a Extras'}
                  {pasoActual === 2 && (!user ? 'Inicia sesión para continuar' : 'Continuar al Pago')}
                  {pasoActual === 3 && (enviando ? 'Procesando pago...' : 'Confirmar pago')}
                </button>
              )}
            </div>
        </div>
      </form>
    </div>

      {/* Modal offline: aparece en paso 3 cuando se pulsa Confirmar pago sin internet */}
      {showOfflineModal && (
        <OfflineReservaModal
          onContinuar={() => {
            setShowOfflineModal(false);
            // Disparar el submit del form manualmente
            document.querySelector('.modal-form')?.dispatchEvent(
              new Event('submit', { bubbles: true, cancelable: true })
            );
          }}
          onCancelar={() => {
            setShowOfflineModal(false);
            setPendingOfflinePay(false);
          }}
        />
      )}
    </>
  );
}

/** Cuenta atras legible a partir de `expiresAt`. */
function formatearRestante(expiresAt) {
  if (!expiresAt) return '';
  const seg = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const m = Math.floor(seg / 60);
  return `${m}:${String(seg % 60).padStart(2, '0')}`;
}


