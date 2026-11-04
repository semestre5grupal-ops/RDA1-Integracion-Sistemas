import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../hooks/useAuth';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { crearReserva, obtenerMapaAsientos } from '../services/vuelosApi';
import { obtenerHuellaDispositivo, formatearMoneda } from '../services/formato';
import { savePendingReservation } from '../services/offlineSync';
import { enviarFacturaTrasCompra } from '../services/envioFactura';
import { useTelemetry } from '../hooks/useTelemetry';
import { OfflineReservaModal } from './OfflineReservaModal';

const COUNTRIES = [
  { code: 'EC', name: 'Ecuador' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PE', name: 'Perú' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'MX', name: 'México' },
  { code: 'ES', name: 'España' },
  { code: 'BR', name: 'Brasil' },
];

/**
 * Países para el teléfono: prefijo y qué número nacional es válido (sin el 0
 * inicial). El usuario elige el país y escribe solo su número; se valida ahí
 * mismo y se envía en E.164 (+593991234567), que es lo que exigen las aerolíneas.
 */
const PAISES_TELEFONO = [
  { pais: 'EC', bandera: '🇪🇨', prefijo: '593', regla: /^(9\d{8}|[2-7]\d{7})$/, ejemplo: '991234567', ayuda: 'celular de 9 dígitos que empieza con 9, u 8 dígitos fijo' },
  { pais: 'CO', bandera: '🇨🇴', prefijo: '57', regla: /^(3\d{9}|60\d{8})$/, ejemplo: '3001234567', ayuda: '10 dígitos (celular empieza con 3)' },
  { pais: 'PE', bandera: '🇵🇪', prefijo: '51', regla: /^(9\d{8}|[1-8]\d{7})$/, ejemplo: '912345678', ayuda: 'celular de 9 dígitos que empieza con 9' },
  { pais: 'AR', bandera: '🇦🇷', prefijo: '54', regla: /^9?\d{10}$/, ejemplo: '91123456789', ayuda: '10 dígitos con código de área (celular: 9 + 10)' },
  { pais: 'CL', bandera: '🇨🇱', prefijo: '56', regla: /^\d{9}$/, ejemplo: '912345678', ayuda: '9 dígitos' },
  { pais: 'UY', bandera: '🇺🇾', prefijo: '598', regla: /^[249]\d{7}$/, ejemplo: '94123456', ayuda: '8 dígitos (celular empieza con 9)' },
  { pais: 'US', bandera: '🇺🇸', prefijo: '1', regla: /^[2-9]\d{2}[2-9]\d{6}$/, ejemplo: '2025550123', ayuda: '10 dígitos' },
  { pais: 'MX', bandera: '🇲🇽', prefijo: '52', regla: /^\d{10}$/, ejemplo: '5512345678', ayuda: '10 dígitos' },
  { pais: 'ES', bandera: '🇪🇸', prefijo: '34', regla: /^[6-9]\d{8}$/, ejemplo: '612345678', ayuda: '9 dígitos' },
  { pais: 'BR', bandera: '🇧🇷', prefijo: '55', regla: /^[1-9]{2}9?\d{8}$/, ejemplo: '11912345678', ayuda: 'DDD + número (10 u 11 dígitos)' },
];
const PAIS_TELEFONO = Object.fromEntries(PAISES_TELEFONO.map((p) => [p.pais, p]));

/** Solo dígitos y sin el 0 inicial de marcación nacional (099… → 99…). */
export function numeroNacional(valor) {
  return String(valor ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

/** '' si el número es válido para el país; si no, el mensaje a mostrar. */
export function errorTelefono(pais, local) {
  const def = PAIS_TELEFONO[pais];
  if (!def) return 'Elige el país del teléfono.';
  const n = numeroNacional(local);
  if (!n) return 'El teléfono es obligatorio.';
  return def.regla.test(n) ? '' : `Número no válido para ${def.bandera} +${def.prefijo}: ${def.ayuda}.`;
}

/** Teléfono en E.164 (+593991234567) a partir del país y el número local. */
export function telefonoE164(pais, local) {
  const def = PAIS_TELEFONO[pais] ?? PAIS_TELEFONO.EC;
  return `+${def.prefijo}${numeroNacional(local)}`;
}

/** Cédula ecuatoriana: 10 dígitos, provincia 01-24 (o 30) y dígito verificador. */
export function cedulaValida(c) {
  if (!/^\d{10}$/.test(c)) return false;
  const provincia = Number(c.slice(0, 2));
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30) || Number(c[2]) > 5) return false;
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let x = Number(c[i]) * (i % 2 === 0 ? 2 : 1);
    if (x > 9) x -= 9;
    suma += x;
  }
  return (10 - (suma % 10)) % 10 === Number(c[9]);
}


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
    nationality: 'EC',
    birthDate: '',
    gender: '',
    email: '',
    phone: '',
    // Teléfono: país (prefijo) + número local. `phone` se arma en E.164 al enviar.
    phoneCountry: 'EC',
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
  documentNumber: (v, p) => {
    const doc = (v ?? '').trim();
    if (p?.documentType === 'NATIONAL_ID' && p?.nationality === 'EC') {
      if (!/^\d{10}$/.test(doc)) return 'La cédula debe tener 10 dígitos.';
      return cedulaValida(doc) ? '' : 'Cédula no válida: revisa los dígitos.';
    }
    return /^[A-Z0-9][A-Z0-9-]{3,19}$/.test(doc)
      ? ''
      : 'Debe tener entre 4 y 20 caracteres alfanumericos en mayusculas.';
  },
  nationality: (v) =>
    v && /^[A-Z]{2}$/.test(v.trim())
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
  phone: (v, p) => errorTelefono(p?.phoneCountry ?? 'EC', v),
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
  // Mapas de asientos reales por tramo: { [segmentId]: { estado, asientos, error } }
  const [mapas, setMapas] = useState({});
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
    setMapas({}); // hold nuevo: el mapa de asientos se vuelve a pedir
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
   * (nacionalidad ISO alfa-2, documento alfanumerico). Se hace al escribir y no
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

  /** Pide a la aerolínea el mapa de asientos de cada tramo del hold. */
  const cargarMapas = useCallback(async (forzar = false) => {
    const tramos = hold?.tramos ?? [];
    if (!hold?.offerId || !tramos.length) return;
    await Promise.all(tramos.map(async (t) => {
      if (!forzar && mapas[t.segmentId]?.estado === 'ok') return;
      setMapas((m) => ({ ...m, [t.segmentId]: { estado: 'cargando' } }));
      try {
        const data = await obtenerMapaAsientos(hold.offerId, t.segmentId);
        setMapas((m) => ({ ...m, [t.segmentId]: { estado: 'ok', asientos: asientosDeCabina(data, t.cabina) } }));
      } catch {
        setMapas((m) => ({ ...m, [t.segmentId]: { estado: 'error' } }));
      }
    }));
  }, [hold, mapas]);

  useEffect(() => {
    if (pasoActual === 2) cargarMapas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasoActual, hold?.holdId]);

  /** Valida el teléfono del pasajero `i` al momento (al salir del campo o al cambiar el país). */
  const validarTelefonoAhora = useCallback((i, pais, numero) => {
    const mensaje = numero ? errorTelefono(pais, numero) : '';
    setErrores((e) => {
      const clave = `p${i}.phone`;
      if (!mensaje && !e[clave]) return e;
      const copia = { ...e };
      if (mensaje) copia[clave] = mensaje; else delete copia[clave];
      return copia;
    });
  }, []);

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
            contact: { email: p.email.trim(), phone: telefonoE164(p.phoneCountry ?? 'EC', p.phone) },
            ...(p.passengerType !== 'INFANT' && Object.keys(p.asientos ?? {}).length
              ? { assignedSeats: Object.entries(p.asientos).map(([segmentId, seatNumber]) => ({ segmentId, seatNumber })) }
              : {}),
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
            titulo: reserva?.factura?.descripcion || datosFactura.titulo,
            factura: reserva?.factura ?? null,
          });
        }

        trackEvent('payment_succeeded', 'vuelos');
        trackEvent('booking_confirmed', 'vuelos');

        onConfirmada?.(reserva, lista);
      } catch (fallo) {
        trackEvent('payment_failed', 'vuelos', { error: fallo?.message });
        // Un intento fallido no se repite con la misma clave: el siguiente
        // "Confirmar pago" es un intento nuevo.
        claveIdempotencia.current = uuidv4();
        const datos = fallo?.response?.data ?? {};
        // Otro cliente tomó el asiento entre que se vio el mapa y se pagó:
        // el cobro ya se devolvió; se vuelve a Asientos con el mapa actualizado.
        if (fallo?.response?.status === 409 && /seat|asiento/i.test(JSON.stringify(datos))) {
          setPasoActual(2);
          cargarMapas(true);
          setErrorGeneral('Ese asiento lo acaba de ocupar otra persona. Elige otro (el cobro ya se devolvió).');
          return;
        }
        const campos = (datos.invalidParams ?? [])
          .map((p) => `${String(p.name ?? '').replace(/^passengers[.[]?(\d+)\]?\.?/, (_, i) => `Pasajero ${Number(i) + 1}: `)} ${p.reason ?? ''}`.trim())
          .filter(Boolean);
        const titulo = datos.title && !/request failed validation|bad request/i.test(datos.title) ? datos.title : null;
        setErrorGeneral(
          [titulo, campos.length ? campos.join(' · ') : null, datos.detail]
            .filter(Boolean)
            .join(' — ') || 'No se pudo completar la reserva. Intentalo de nuevo.',
        );
      } finally {
        setEnviando(false);
      }
    },
    [enviando, lista, hold, validar, onConfirmada, pasoActual, cargarMapas],
  );

  if (!abierto || !hold) return null;

  const adultos = lista.filter((p) => p.passengerType === 'ADULT');

  return (
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
                    <div className="telefono-pais">
                      <select
                        className={`modal-input telefono-pais-select ${err('phone') ? 'es-error' : ''}`}
                        aria-label="País del teléfono"
                        value={p.phoneCountry ?? 'EC'}
                        onChange={(e) => {
                          cambiar(i, 'phoneCountry', e.target.value);
                          validarTelefonoAhora(i, e.target.value, p.phone);
                        }}
                      >
                        {PAISES_TELEFONO.map((t) => (
                          <option key={t.pais} value={t.pais}>{t.bandera} +{t.prefijo}</option>
                        ))}
                      </select>
                      <input
                        className={`modal-input ${err('phone') ? 'es-error' : ''}`}
                        id={id('phone')}
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder={PAIS_TELEFONO[p.phoneCountry ?? 'EC']?.ejemplo}
                        value={p.phone}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d\s]/g, '');
                          cambiar(i, 'phone', v);
                          // Si ya había error, se quita en cuanto el número es válido.
                          if (err('phone')) validarTelefonoAhora(i, p.phoneCountry ?? 'EC', v);
                        }}
                        onBlur={(e) => validarTelefonoAhora(i, p.phoneCountry ?? 'EC', e.target.value)}
                        aria-required="true"
                        aria-invalid={err('phone') ? 'true' : 'false'}
                        aria-describedby={enlazado('phone')}
                      />
                    </div>
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
              <p className="modal-nota-bloque">
                Mapa real de la aerolínea: los asientos en gris ya están ocupados. Si no eliges, la aerolínea asigna uno.
              </p>
              {lista.map((p, i) =>
                p.passengerType === 'INFANT' ? null : (
                  <fieldset className="bloque-pasajero" key={p.passengerId}>
                    <legend className="bloque-pasajero-legend">
                      Pasajero {i + 1} · {p.firstName || ETIQUETA_TIPO[p.passengerType]}
                    </legend>
                    {(hold?.tramos ?? []).map((t) => (
                      <MapaAsientos
                        key={t.segmentId}
                        tramo={t}
                        mapa={mapas[t.segmentId]}
                        elegido={p.asientos?.[t.segmentId] ?? ''}
                        ocupadosPorOtros={lista
                          .filter((_, idx) => idx !== i)
                          .map((o) => o.asientos?.[t.segmentId])
                          .filter(Boolean)}
                        onElegir={(asiento) =>
                          cambiar(i, 'asientos', { ...(p.asientos ?? {}), [t.segmentId]: asiento })
                        }
                        onReintentar={() => cargarMapas(true)}
                      />
                    ))}
                    {!(hold?.tramos ?? []).length && (
                      <small className="modal-nota-bloque">La aerolínea asignará el asiento al emitir el boleto.</small>
                    )}
                  </fieldset>
                ),
              )}
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

      {/* Modal offline: aparece en paso 3 cuando se pulsa Confirmar pago sin internet */}
      {showOfflineModal && (
        <OfflineReservaModal
          onContinuar={() => {
            setShowOfflineModal(false);
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
    </div>
  );
}

/** Cuenta atras legible a partir de `expiresAt`. */
function formatearRestante(expiresAt) {
  if (!expiresAt) return '';
  const seg = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const m = Math.floor(seg / 60);
  return `${m}:${String(seg % 60).padStart(2, '0')}`;
}

/**
 * Asientos de la cabina pagada a partir del seatmap del contrato
 * (cabins[].rows[].seats[]). Devuelve filas: [{ fila, asientos: [{ numero, libre, extra }] }].
 */
function asientosDeCabina(data, cabina) {
  const cabinas = data?.cabins ?? [];
  const elegida = cabinas.find((c) => c.cabinClass === cabina) ?? (cabinas.length === 1 ? cabinas[0] : null);
  return (elegida?.rows ?? []).map((r) => ({
    fila: r.rowNumber,
    asientos: (r.seats ?? []).map((a) => ({
      numero: a.seatNumber,
      libre: a.isAvailable !== false && String(a.status ?? 'AVAILABLE').toUpperCase() === 'AVAILABLE',
      extra: (a.characteristics ?? []).includes('EXTRA_LEGROOM'),
      ventana: (a.characteristics ?? []).includes('WINDOW'),
    })),
  }));
}

/** Mapa de asientos de un tramo para un pasajero. */
function MapaAsientos({ tramo, mapa, elegido, ocupadosPorOtros, onElegir, onReintentar }) {
  const titulo = `${tramo.flightNumber ?? ''} ${tramo.origen ?? ''} → ${tramo.destino ?? ''}`.trim();
  if (!mapa || mapa.estado === 'cargando') {
    return <div className="mapa-tramo"><div className="mapa-tramo-titulo">{titulo}</div><small className="modal-nota-bloque">Cargando asientos…</small></div>;
  }
  if (mapa.estado === 'error' || !mapa.asientos?.length) {
    return (
      <div className="mapa-tramo">
        <div className="mapa-tramo-titulo">{titulo}</div>
        <small className="modal-nota-bloque">
          No se pudo cargar el mapa de asientos. Puedes continuar y la aerolínea asignará uno.{' '}
          <button type="button" className="enlace-boton" onClick={onReintentar}>Reintentar</button>
        </small>
      </div>
    );
  }
  // Pasillo: en filas de 6 asientos va después del 3.º; en filas de 4, después del 2.º.
  const ancho = Math.max(...mapa.asientos.map((f) => f.asientos.length));
  const pasilloDespues = ancho >= 6 ? 2 : ancho >= 4 ? 1 : -1;
  return (
    <div className="mapa-tramo">
      <div className="mapa-tramo-titulo">
        {titulo}
        <span className="mapa-tramo-elegido">{elegido ? `Asiento ${elegido}` : 'Sin elegir'}</span>
      </div>
      <div className="mapa-asientos-real" role="group" aria-label={`Asientos ${titulo}`}>
        {mapa.asientos.map((f) => (
          <div className="fila-asientos" key={f.fila}>
            <span className="fila-numero">{f.fila}</span>
            {f.asientos.map((a, idx) => {
              const deOtro = ocupadosPorOtros.includes(a.numero);
              const seleccionado = elegido === a.numero;
              const bloqueado = !a.libre || deOtro;
              return (
                <span key={a.numero} className="asiento-celda">
                  <button
                    type="button"
                    className={`asiento ${seleccionado ? 'asiento-elegido' : ''} ${bloqueado ? 'asiento-ocupado' : ''} ${a.extra ? 'asiento-extra' : ''}`}
                    disabled={bloqueado}
                    aria-pressed={seleccionado}
                    title={!a.libre ? `${a.numero}: ocupado` : deOtro ? `${a.numero}: elegido por otro pasajero` : `${a.numero}${a.ventana ? ' · ventana' : ''}${a.extra ? ' · espacio extra' : ''}`}
                    onClick={() => onElegir(seleccionado ? '' : a.numero)}
                  >
                    {a.numero}
                  </button>
                  {idx === pasilloDespues && <span className="asiento-pasillo" aria-hidden="true" />}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mapa-leyenda">
        <span><i className="asiento muestra" /> Libre</span>
        <span><i className="asiento muestra asiento-elegido" /> Tu asiento</span>
        <span><i className="asiento muestra asiento-ocupado" /> Ocupado</span>
        <span><i className="asiento muestra asiento-extra" /> Espacio extra</span>
      </div>
    </div>
  );
}
