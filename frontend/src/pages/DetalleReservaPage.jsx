import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  emitirTickets,
  listarOpcionesEquipaje,
  listarPases,
  listarTickets,
  obtenerReserva,
} from '../services/vuelosApi';
import { formatearFecha, formatearMoneda, extraerHora } from '../services/formato';
import { BoardingPass } from '../components/BoardingPass';
import { ModalPostventa } from '../components/ModalPostventa';
import { ModalCambioFecha } from '../components/ModalCambioFecha';

/**
 * Pagina de detalle de una reserva: `GET /bookings/{id}` + `/tickets` +
 * `/baggage-options`, mas los flujos de postventa.
 *
 * ── Las tres llamadas van en paralelo y por separado ────────────────────────
 * Se lanza `Promise.all`, pero el estado de cada una es independiente a proposito:
 * si `/tickets` falla, el detalle y el equipaje siguen mostrandose. Un
 * `Promise.all` reventaria los tres resultados juntos por un fallo de uno solo, y
 * perder la reserva entera porque no se pudo leer el equipaje es un fallo de
 * disponibilidad innecesario.
 *
 * ── `tickets: []` no es un error ─────────────────────────────────────────────
 * Sin boletos emitidos se muestra un aviso, no un hueco. Es el estado normal de
 * una reserva recien creada.
 *
 * ── Que boton aparece depende del estado ────────────────────────────────────
 * No es decoracion: llamar a la API cuando el estado no lo permite cuesta un
 * 409 que el usuario no puede resolver. `Cancelar reserva` solo existe en
 * `CONFIRMED`, que es lo unico que el trigger `tg_reserva_transicion` acepta
 * como origen de una cancelacion.
 */

const ESTADOS_ES = {
  CHECKED_IN: 'Check-in realizado',
  PENDING: 'Pendiente',
  PENDING_PAYMENT: 'Pendiente de pago',
  TICKET_ISSUING: 'Emitiendo billetes',
  CONFIRMED: 'Confirmada',
  FAILED: 'Fallida',
  CHANGE_PENDING: 'Cambio en curso',
  CANCELLATION_PENDING: 'Cancelación en curso',
  CANCELLED: 'Cancelada',
};

export function DetalleReservaPage({ bookingId }) {
  const [reserva, setReserva] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [equipaje, setEquipaje] = useState([]);
  // Los pases de abordar, con su butaca y su codigo de barras. Antes se
  // "simulaban" a partir del boleto, que no tiene esos datos: la butaca solo
  // existe tras el check-in, en `pase_abordar`.
  const [pases, setPases] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [avisos, setAvisos] = useState({});

  // Postventa: que modal esta abierto (`null` = ninguno) y el aviso de exito.
  const [modal, setModal] = useState(null);
  const [exito, setExito] = useState(null);
  // El check-in ya realizado en ESTA sesion.
  //
  // `GET /bookings/{id}` no expone el estado del check-in, asi que tras recargar
  // la pagina el boton vuelve a estar activo y el siguiente clic recibe un 409.
  // Se podria anadir el estado a la respuesta, pero el backend ya lo impide con
  // `UNIQUE (chi_reservaid)`, que es la garantia que importa. Se mantiene
  // local para no ofrecer un boton que va a fallar en la sesion en la que el
  // usuario acaba de hacer el check-in.
  const [checkinHecho, setCheckinHecho] = useState(false);
  // La emision de boletos esta en vuelo, para deshabilitar el boton y evitar el
  // doble clic. El endpoint es idempotente, pero un boton que permite pulsar
  // mientras corre invite a hacerlo.
  const [emitiendo, setEmitiendo] = useState(false);

  const cargar = useCallback(async () => {
    if (!bookingId) return;
    setCargando(true);
    setError(null);
    setAvisos({});

    const nuevosAvisos = {};

    // Cada bloque se resuelve por separado: un fallo en uno no oculta los otros.
    //
    // `/boarding-passes` se pide siempre y NO es un error que devuelva una lista
    // vacia: significa que aun no hay check-in, y la UI lo pintaria como una
    // invitacion a hacerlo. Solo se avisa si la PETICION falla (red, 500).
    const [rDetalle, rTickets, rEquipaje, rPases] = await Promise.allSettled([
      obtenerReserva(bookingId),
      listarTickets(bookingId),
      listarOpcionesEquipaje(bookingId),
      listarPases(bookingId),
    ]);

    if (rDetalle.status === 'fulfilled') {
      setReserva(rDetalle.value);
    } else {
      setError(
        rDetalle.reason?.response?.data?.detail ??
          'No se pudo cargar la reserva.',
      );
    }
    if (rTickets.status === 'fulfilled') {
      setTickets(rTickets.value?.tickets ?? []);
    } else {
      nuevosAvisos.tickets = 'No se pudieron cargar los billetes.';
    }
    if (rEquipaje.status === 'fulfilled') {
      setEquipaje(rEquipaje.value ?? []);
    } else {
      nuevosAvisos.equipaje = 'No se pudo cargar la informacion de equipaje.';
    }
    if (rPases.status === 'fulfilled') {
      setPases(rPases.value?.boardingPasses ?? []);
    } else {
      nuevosAvisos.pases = 'No se pudieron cargar los pases de abordar.';
    }

    setAvisos(nuevosAvisos);
    setCargando(false);
  }, [bookingId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El titulo lleva el PNR: con varias pestanas abiertas, "Booking Prototipo"
  // no dice en que reserva se esta.
  useEffect(() => {
    document.title = reserva?.pnr
      ? `Reserva ${reserva.pnr} · Booking Prototipo`
      : 'Detalle de reserva · Booking Prototipo';
    return () => {
      document.title = 'Booking Prototipo';
    };
  }, [reserva?.pnr]);

  /**
   * Lo que el modal de postventa ha hecho.
   *
   * Se recarga la pagina entera en vez de parchear el estado a mano: el check-in
   * cambia el estado de la reserva en el servidor, y el cancelacion la pasa a
   * CANCELLED. Mantener una copia local de todo eso es volver a implementar la
   * respuesta del servidor y inevitably se desincroniza.
   */
  const trasPostventa = useCallback(
    ({ tipo, resultado }) => {
      setModal(null);
      if (tipo === 'checkin') {
        setCheckinHecho(true);
        setExito('Check-in registrado. Ya tienes tu pase de abordar.');
      } else if (tipo === 'equipaje') {
        setExito(
          `Maleta añadida. ${resultado.totalBaggage} en total por este trayecto.`,
        );
      } else if (resultado?.status === 'CANCELLATION_PENDING') {
        setExito(
          'Cancelación registrada y pendiente de revisión. Te avisaremos por correo.',
        );
      } else {
        setExito(
          `Reserva cancelada. Se devuelven ${
            resultado?.refundAmount ?? '0.00'
          } ${resultado?.currency ?? ''}`.trim(),
        );
      }
      cargar();
    },
    [cargar],
  );

  /**
   * Emision de boletos.
   *
   * El boton solo aparece cuando la emision es posible, y eso lo decide el estado
   * de la reserva, no el capricho del diseñador: `POST /bookings/{id}/tickets`
   * responde 409 `BOOKING_NOT_CONFIRMED` en `CANCELLED` o `FAILED`, y eso seria un
   * boton que solo puede fallar.
   *
   * Se ofrece en los dos casos en que tiene sentido:
   * · `PENDING` o `TICKET_ISSUING`: la emision se reanuda o arranca.
   * · `CONFIRMED` sin ningun boleto emitido: el endpoint rellena los que falten.
   *   Es posible porque una compra de fases anteriores recorría
   *   `TICKET_ISSUING` sin escribir nada en `boleto`, y desde `CONFIRMED` no se
   *   puede volver a `TICKET_ISSUING`.
   */
  const emitir = useCallback(async () => {
    setEmitiendo(true);
    setError(null);
    try {
      const resultado = await emitirTickets(bookingId);
      setExito(
        resultado.issued > 0
          ? `Billetes emitidos: ${resultado.issued}. Ya puedes hacer el check-in.`
          : 'Los billetes ya estaban emitidos. No ha cambiado nada.',
      );
      cargar();
    } catch (fallo) {
      setError(
        fallo?.response?.data?.detail ?? 'No se pudieron emitir los billetes.',
      );
    } finally {
      setEmitiendo(false);
    }
  }, [bookingId, cargar]);

  /** Lo que ha hecho el modal de cambio de fecha. */
  const trasCambioFecha = useCallback(
    ({ oferta }) => {
      setModal(null);
      const vuelo = oferta?.segments?.[0]?.flightNumber ?? '';
      setExito(
        `Fecha cambiada a ${formatearFecha(oferta?.newDepartureDate)}${
          vuelo ? ` en el vuelo ${vuelo}` : ''
        }. Tu boleto y tu asiento se mantienen.`,
      );
      cargar();
    },
    [cargar],
  );

  if (cargando) {
    return (
      <main className="main-content main-content-vuelos">
        <p className="state-subtitle" role="status">
          Cargando reserva…
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="main-content main-content-vuelos">
        <div className="state-container">
          <div className="error-icon" aria-hidden="true">
            ✈
          </div>
          <h1 className="state-title">No encontramos la reserva</h1>
          <p className="state-subtitle">{error}</p>
          <Link className="btn-primario" to="/vuelos/reservas">
            Ver mis reservas
          </Link>
        </div>
      </main>
    );
  }

  if (!reserva) return null;

  const emitidos = tickets.filter((t) => t.status === 'ISSUED').length;

  // Botones de postventa. Cada uno se habilita solo si el estado de la reserva
  // lo permite, y no solo por esperanza: llamar a la API cuando el estado no lo
  // acepta cuesta un 409 que el usuario no puede resolver desde la UI.
  const confirmada = reserva.status === 'CONFIRMED';
  const cancelable = confirmada || reserva.status === 'CANCELLATION_PENDING';
  const hayBoletos = tickets.some((t) => t.status === 'ISSUED');

  // La emision es posible desde `PENDING`/`TICKET_ISSUING`, y tambien desde
  // `CONFIRMED` mientras falten boletos (ver la nota de `emitir`).
  const emitible =
    ['PENDING', 'TICKET_ISSUING'].includes(reserva.status) ||
    (confirmada && tickets.length === 0);
  // El cambio de fecha solo desde `CONFIRMED`: es el unico estado del que el
  // trigger `tg_reserva_transicion` admite salir hacia `CHANGE_PENDING`.
  const cambiable = confirmada;

  return (
    <main className="main-content main-content-vuelos">
      <nav className="migas" aria-label="Ruta de navegación">
        <Link to="/vuelos/reservas">Mis reservas</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{reserva.pnr}</span>
      </nav>

      <div className="detalle-cabecera">
        <div>
          <h1 className="section-title">Reserva {reserva.pnr}</h1>
          <p className="section-subtitle">
            Creada el {formatearFecha(reserva.createdAt?.slice(0, 10))} ·{' '}
            <span className={`estado-pill estado-${reserva.status.toLowerCase()}`}>
              {ESTADOS_ES[reserva.status] ?? reserva.status}
            </span>
          </p>
        </div>
        <div className="detalle-total">
          <span className="modal-precio-etiqueta">Total</span>
          <span className="modal-precio-valor">
            {formatearMoneda(reserva.bookingPrice?.total ?? reserva.grandTotal?.total, reserva.grandTotal?.currency)}
          </span>
        </div>
      </div>

      {error && !cargando && (
        <p className="modal-error" role="alert">
          {error}
        </p>
      )}

      {exito && (
        <p className="postventa-exito" role="status">
          {exito}
        </p>
      )}

      {/* ── Barra de postventa ─────────────────────────────────────────────
          Cada boton explica por que esta deshabilitado en vez de desaparecer:
          un boton que no esta, no se explica. El de cancelar exige `CONFIRMED`
          o `CANCELLATION_PENDING`, que es lo que el trigger de la maquina de
          estados acepta como origen de una cancelacion.

          El bloque se muestra si hay ALGO que hacer. Con la reserva en
          `CANCELLED` no queda ninguna accion posible, y una barra con tres
          botones muertos solo confunde. */}
      {(cancelable || emitible || cambiable) && (
        <div className="postventa-acciones">
          {/* La emision va PRIMERA: sin boleto no hay check-in ni boarding pass,
              asi que es el paso que desbloquea todos los demas. */}
          {emitible && (
            <button
              type="button"
              className="btn-primario"
              onClick={emitir}
              disabled={emitiendo}
              title={
                emitiendo ? 'Los billetes se estan emitiendo.' : undefined
              }
            >
              {emitiendo ? 'Emitiendo…' : 'Emitir billetes'}
            </button>
          )}
          <button
            type="button"
            className="btn-primario"
            onClick={() => setModal('checkin')}
            disabled={!confirmada || !hayBoletos || checkinHecho}
            title={
              checkinHecho
                ? 'Ya hiciste el check-in de esta reserva.'
                : !confirmada
                  ? 'Solo las reservas confirmadas pueden hacer check-in.'
                  : !hayBoletos
                    ? 'Necesitas un boleto emitido para hacer check-in.'
                    : undefined
            }
          >
            {checkinHecho ? 'Check-in hecho' : 'Hacer check-in'}
          </button>

        </div>
      )}

      {/* ── Itinerario ──────────────────────────────────────────────────── */}
      <section className="card" aria-labelledby="det-itin">
        <div className="card-body">
          <h2 className="card-title" id="det-itin">
            Itinerario
          </h2>
          {(reserva.itineraries ?? []).map((itinerario) => (
            <div key={itinerario.itineraryId}>
              {itinerario.segments.map((seg) => (
                <div className="detalle-segmento" key={seg.segmentId}>
                  <span className="detalle-hora boarding-mono">
                    {extraerHora(seg.departureAt ?? seg.departure?.at)}
                  </span>
                  <span className="detalle-iata">{seg.departureIataCode}</span>
                  <span className="vuelo-linea" aria-hidden="true">
                    ─────────
                  </span>
                  <span className="detalle-hora boarding-mono">
                    {extraerHora(seg.arrivalAt ?? seg.arrival?.at)}
                  </span>
                  <span className="detalle-iata">{seg.arrivalIataCode}</span>
                  <span className="vuelo-numero">· {seg.flightNumber}</span>
                  {seg.status && (
                    <span className="vuelo-estado">{seg.status}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── Billetes / boarding passes ──────────────────────────────────── */}
      <section className="card" aria-labelledby="det-tickets">
        <div className="card-body">
          <h2 className="card-title" id="det-tickets">
            Billetes
            {tickets.length > 0 && (
              <span className="card-title-nota">
                {' '}
                · {emitidos} de {tickets.length} emitidos
              </span>
            )}
          </h2>

          {avisos.tickets && (
            <p className="aviso-tickets" role="status">
              {avisos.tickets}
            </p>
          )}

          {!avisos.tickets && tickets.length === 0 && (
            <p className="aviso-tickets" role="note">
              Todavía no se han emitido los billetes. Aparecerán aquí en cuanto se
              complete la emisión.
            </p>
          )}

          <div className="boarding-lista">
            {tickets.map((ticket) => (
              <BoardingPass key={ticket.ticketId} ticket={ticket} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Equipaje ────────────────────────────────────────────────────── */}
      <section className="card" aria-labelledby="det-equipaje">
        <div className="card-body">
          <h2 className="card-title" id="det-equipaje">
            Equipaje
          </h2>
          {avisos.equipaje && (
            <p className="aviso-tickets" role="status">
              {avisos.equipaje}
            </p>
          )}
          {!avisos.equipaje && equipaje.length > 0 && (
            <table className="tabla-equipaje">
              <caption className="sr-only">
                Opciones de equipaje por pasajero
              </caption>
              <thead>
                <tr>
                  <th scope="col">Pasajero</th>
                  <th scope="col">Itinerario</th>
                  <th scope="col">Incluido</th>
                  <th scope="col">Comprado</th>
                  <th scope="col">Precio extra</th>
                </tr>
              </thead>
              <tbody>
                {equipaje.map((op) => (
                  <tr key={`${op.passengerId}-${op.itineraryId}`}>
                    <th scope="row">{op.passengerId}</th>
                    <td>{op.itineraryId}</td>
                    <td>{op.maxAllowed}</td>
                    <td>{op.alreadyPurchased}</td>
                    <td>{formatearMoneda(op.price?.total, op.price?.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Pasajeros ───────────────────────────────────────────────────── */}
      <section className="card" aria-labelledby="det-pax">
        <div className="card-body">
          <h2 className="card-title" id="det-pax">
            Pasajeros ({reserva.passengers?.length ?? 0})
          </h2>
          <ul className="lista-pasajeros">
            {(reserva.passengers ?? []).map((p) => (
              <li key={p.passengerId} className="lista-pasajero">
                <span className="lista-pasajero-nombre">
                  {p.firstName} {p.lastName}
                </span>
                <span className="lista-pasajero-detalle">
                  {p.documentType === 'PASSPORT' ? 'Pasaporte' : 'Cédula'}{' '}
                  {p.documentNumber} · {p.nationality} · {p.passengerType}
                </span>
                <span className="lista-pasajero-contacto">{p.contact?.email}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {modal === 'cambiar-fecha' && (
        <ModalCambioFecha
          bookingId={bookingId}
          pnr={reserva.pnr}
          reserva={reserva}
          onCerrar={() => setModal(null)}
          onHecho={trasCambioFecha}
        />
      )}

      {modal && modal !== 'cambiar-fecha' && (
        <ModalPostventa
          tipo={modal}
          bookingId={bookingId}
          pnr={reserva.pnr}
          opcionesEquipaje={equipaje}
          pasajeros={reserva.passengers}
          onCerrar={() => setModal(null)}
          onHecho={trasPostventa}
        />
      )}
    </main>
  );
}
