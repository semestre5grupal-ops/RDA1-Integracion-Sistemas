import { useCallback, useState } from 'react';
import { FormularioBusquedaVuelos } from '../components/FormularioBusquedaVuelos';
import { VueloGroupCard } from '../components/VueloGroupCard';
import { ResumenViaje } from '../components/ResumenViaje';
import { FormularioReserva } from '../components/FormularioReserva';
import { crearHold, agregarEquipaje, liberarHold } from '../services/vuelosApi';
import { PantallaReservaConfirmada } from '../components/PantallaReservaConfirmada';
import { formatearFecha, obtenerHuellaDispositivo } from '../services/formato';
import { aplicarRecargoBusqueda } from '../utils/precioBooking';
import { buscarVuelos } from '../services/vuelosApi';

// Destinos nacionales de Ecuador que el API soporta
const DESTINOS_ECUADOR = [
  {
    codigo: 'GYE',
    nombre: 'Guayaquil',
    descripcion: 'La Perla del Pacífico',
    imagen: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=240&fit=crop',
    desde: '$49',
  },
  {
    codigo: 'CUE',
    nombre: 'Cuenca',
    descripcion: 'Ciudad Patrimonio de la Humanidad',
    imagen: 'https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=400&h=240&fit=crop',
    desde: '$59',
  },
  {
    codigo: 'LOH',
    nombre: 'Loja',
    descripcion: 'La Capital Musical del Ecuador',
    imagen: 'https://images.unsplash.com/photo-1465447142348-e9952c393450?w=400&h=240&fit=crop',
    desde: '$69',
  },
  {
    codigo: 'GPS',
    nombre: 'Galápagos',
    descripcion: 'Paraíso natural único en el mundo',
    imagen: 'https://images.unsplash.com/photo-1547459124-e23883747a40?w=400&h=240&fit=crop',
    desde: '$119',
  },
];

/**
 * Pagina de Busqueda de Vuelos (Fase 4) + Bloqueo de Cupos (Fase 6).
 *
 * ── Endpoint ────────────────────────────────────────────────────────────────
 * Llama a `POST /vuelos/search`, NO a `GET /offers`: ese endpoint no existe en
 * `contracts/vuelos-openapi.yaml`. Las unicas rutas `/offers/*` del contrato son
 * `/offers/{offerId}/seatmap`, `/offers/hold` y `/offers/hold/{holdId}`.
 *
 * Nota de enrutado: el prefijo `/vuelos` se mantiene en TODAS las rutas aunque el
 * contrato las declare en la raiz (`POST /search`, `/offers/hold`). Es una
 * decision del Auditor: el contrato asume un microservicio de vuelos solo, y este
 * proyecto es un monolito modular que tambien sirve Atracciones y Autos, donde
 * `/search` en la raiz colisionaria.
 */
export function VuelosPage() {
  const [resultados, setResultados] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [busquedaActiva, setBusquedaActiva] = useState(null);
  const [ofertaAbierta, setOfertaAbierta] = useState(null);
  const [holdActivo, setHoldActivo] = useState(null);
  const [creandoHold, setCreandoHold] = useState(false);
  const [reserva, setReserva] = useState(null);
  // Pre-fill state for destination cards
  const [preOrigen, setPreOrigen] = useState('UIO');
  const [preDestino, setPreDestino] = useState('');
  const [formKey, setFormKey] = useState(0); // Force remount when destination is clicked

  // ── NOTA: ningun `return` ANTES de la ultima llamada a un hook ─────────────
  // Este `return` estaba antes de los `useCallback` de mas abajo, y React
  // fallaba con el error minificado #300: en el primer render se ejecutaban
  // tres hooks y en los siguientes (con `reserva` ya puesta) no se ejecutaba
  // ninguno. React exige que el numero de hooks sea el MISMO en cada render,
  // porque los guarda en un array por posicion; saltarselo cambia el orden de
  // la memoria interna.
  //
  // Regla general: todos los hooks arriba, y a partir de ahi se puede devolver
  // lo que haga falta.

  async function manejarBusqueda(criterios) {
    setCargando(true);
    setError(null);
    setBusquedaActiva(criterios);

    try {
      const respuesta = await buscarVuelos(criterios, obtenerHuellaDispositivo());
      // Precios finales de Booking: tarifa de la aerolínea + cargo por servicio.
      setResultados(aplicarRecargoBusqueda(respuesta));
    } catch (fallo) {
      setResultados(null);
      // ProblemDetails del contrato: { code, title, detail, status }.
      const cuerpo = fallo?.response?.data;
      setError({
        status: fallo?.response?.status ?? null,
        code: cuerpo?.code ?? null,
        title: cuerpo?.title ?? 'No se pudo completar la busqueda',
        detail: cuerpo?.detail ?? fallo?.message ?? null,
      });
    } finally {
      setCargando(false);
    }
  }

  function seleccionarDestino(codigoDestino) {
    setPreOrigen('UIO');
    setPreDestino(codigoDestino);
    setFormKey(k => k + 1); // remount to apply new props
    // Scroll to the search form
    document.querySelector('.buscador-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const ofertas = resultados?.offers ?? [];
  // RDA2: Booking agrega a las aerolíneas socias; `sources` dice cuál respondió.
  const fuentes = resultados?.sources ?? [];
  const fuentesCaidas = fuentes.filter(f => !f.ok);

  // Agrupar ofertas por número de vuelo para el diseño de acordeón moderno
  const ofertasAgrupadas = Object.values(
    ofertas.reduce((acc, oferta) => {
      // Usamos los números de vuelo de todos los segmentos como clave de agrupación
      // Se incluye la aerolínea socia para no mezclar vuelos de dos e-commerce distintos.
      const key = `${oferta.provider?.nodeCode ?? ''}|${oferta.itineraries?.[0]?.segments?.map(s => s.flightNumber).join('-')}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(oferta);
      return acc;
    }, {})
  );

  // `useCallback` para que el `onSeleccionar` que se pasa a cada tarjeta sea
  // estable: si fuera una funcion nueva en cada render, las tarjetas del
  // grid se re-renderizarian cada vez que cambiara cualquier estado.
  const abrirBloqueo = useCallback((oferta, tarifa) => setOfertaAbierta({oferta, tarifa}), []);
  const cerrarBloqueo = useCallback(() => setOfertaAbierta(null), []);

  const confirmarResumen = useCallback(async (oferta, tarifa) => {
    setCreandoHold(true);
    setError(null);
    try {
      // El UUID lo creamos inline para idempotencia de esta transaccion
      const clave = crypto.randomUUID();
      // El contrato exige UNA tarifa por cada itinerario de la oferta (ida y
      // vuelta = 2). Antes solo se enviaba la de la ida y la aerolínea respondía
      // 422 "itinerarySelections must choose a fare for every itinerary".
      // Para cada tramo se usa la misma cabina y marca elegidas si existen ahí;
      // si no, la misma cabina, y si tampoco, la primera tarifa del tramo.
      const cabina = tarifa?.cabinClass || oferta.itineraries[0]?.pricingOptions?.[0]?.cabinClass || 'ECONOMY';
      const marca = tarifa?.fareBrand || oferta.itineraries[0]?.pricingOptions?.[0]?.fareBrand || 'STANDARD';
      const selecciones = (oferta.itineraries ?? []).map((it) => {
        const opciones = it.pricingOptions ?? [];
        const elegida =
          opciones.find((p) => p.cabinClass === cabina && p.fareBrand === marca) ||
          opciones.find((p) => p.cabinClass === cabina) ||
          opciones[0] || { cabinClass: cabina, fareBrand: marca };
        return { itineraryId: it.itineraryId, cabinClass: elegida.cabinClass, fareBrand: elegida.fareBrand };
      });

      const respuesta = await crearHold(
        {
          offerId: oferta.offerId,
          itinerarySelections: selecciones,
          passengersBreakdown: busquedaActiva?.passengers,
        },
        clave,
        obtenerHuellaDispositivo(),
      );
      // El formulario necesita los vuelos del hold y la cabina pagada para
      // mostrar el mapa de asientos real de cada tramo.
      const tramos = (oferta.itineraries ?? []).flatMap((it, idx) =>
        (it.segments ?? []).map((seg) => ({
          segmentId: seg.segmentId,
          flightNumber: seg.flightNumber,
          origen: seg.departure?.iataCode ?? seg.departureIataCode,
          destino: seg.arrival?.iataCode ?? seg.arrivalIataCode,
          cabina: selecciones[idx]?.cabinClass ?? cabina,
        })),
      );
      // La edad de cada pasajero se mide el día del primer vuelo.
      const fechaViaje = busquedaActiva?.itineraries?.[0]?.departureDate ?? null;
      setHoldActivo({ ...respuesta, offerId: oferta.offerId, tramos, fechaViaje });
    } catch (error) {
      const detalle = error?.response?.data?.detail ?? 'No se pudo procesar tu selección. Inténtalo de nuevo.';
      setError({ title: 'Error al continuar', detail: detalle });
      setOfertaAbierta(null);
    } finally {
      setCreandoHold(false);
    }
  }, [busquedaActiva]);

  // El hold se guarda en la pagina y se pasa al formulario: asi el formulario
  // sabe el `holdId`, el TTL y el precio congelado sin tener que repetir la
  // llamada ni guardarlo en `localStorage` (que ademas es PII).
  // Si el cliente sale del formulario sin comprar, el cupo se libera en la
  // aerolínea (DELETE /offers/hold/{holdId}) para que otro lo pueda comprar.
  // Si el hold ya venció, la aerolínea responde 404/410 y no pasa nada.
  const cerrarFormulario = useCallback(() => {
    setHoldActivo((actual) => {
      if (actual?.holdId) liberarHold(actual.holdId).catch(() => {});
      return null;
    });
  }, []);

  /**
   * Al confirmar el pago se cambia por completo de vista. Es una navegacion
   * DENTRO de la pagina, no un cambio de ruta: el flujo de reserva es de un
   * solo sentido, y volver atras con el boton del navegador dejaria al usuario
   * en un formulario cuyo hold ya esta CONSUMED, que no sirve de nada.
   *
   * Va DESPUES de todos los hooks a proposito (ver la nota de mas arriba).
   */
  if (reserva) {
    return (
      <PantallaReservaConfirmada
        reserva={reserva}
        onVolver={() => {
          setReserva(null);
          setHoldActivo(null);
          setResultados(null);
          setBusquedaActiva(null);
          setOfertaAbierta(null);
        }}
      />
    );
  }

  const hayResultados = !cargando && !error && ofertas.length > 0;
  const sinResultados = !cargando && !error && resultados && ofertas.length === 0;

  return (
    <main id="contenido-principal">

      {/* ── BUSCADOR ────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="vuelos-titulo"
        style={{
          background: '#003b95',
          padding: '60px 0 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          color: 'white'
        }}
      >
        <div style={{ maxWidth: '1100px', width: '100%', padding: '0 20px' }}>
          <h1
            id="vuelos-titulo"
            style={{
              fontSize: '3rem',
              fontWeight: 'bold',
              marginBottom: '10px',
              textAlign: 'left',
              lineHeight: '1.2'
            }}
          >
            Vuelos nacionales
          </h1>
          <p style={{ fontSize: '1.4rem', marginBottom: '30px', textAlign: 'left' }}>
            Encuentra y reserva tu vuelo en Ecuador al mejor precio.
          </p>

          <FormularioBusquedaVuelos
            key={formKey}
            onBuscar={manejarBusqueda}
            cargando={cargando}
            origenInicial={preOrigen}
            destinoInicial={preDestino}
          />
        </div>
      </section>

      {/* ── RESULTADOS ──────────────────────────────────────────────────── */}
      <section
        className="vuelo-resultados"
        aria-labelledby="resultados-titulo"
        aria-live="polite"
        aria-busy={cargando}
        style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}
      >
        {cargando && (
          <div className="state-container">
            <div className="spinner" aria-hidden="true" />
            <p className="state-subtitle" role="status">
              Buscando vuelos disponibles…
            </p>
          </div>
        )}

        {!cargando && error && (
          <div className="state-container" role="alert">
            <div className="error-icon" aria-hidden="true">⚠️</div>
            <h3 className="state-title">{error.title}</h3>
            {error.code && (
              <p className="state-subtitle">
                Codigo de error: <code>{error.code}</code>
                {error.status ? ` (HTTP ${error.status})` : ''}
              </p>
            )}
            {error.detail && <p className="state-subtitle">{error.detail}</p>}
            {error.status === 404 && (
              <p className="state-subtitle">
                {error.status
                  ? `El servidor respondio con el estado ${error.status}.`
                  : 'No hubo respuesta del servidor.'}{' '}
                {error.detail ?? 'Revisa los datos e intentalo de nuevo.'}
              </p>
            )}
          </div>
        )}

        {sinResultados && (
          <div className="state-container">
            <div className="error-icon" aria-hidden="true">🔎</div>
            <h3 className="state-title">No encontramos vuelos</h3>
            {resultados?.meta?.fuente && fuentes.length === 0 && (
              <p className="state-subtitle">
                Aún no hay aerolíneas socias conectadas. Regístralas en Admin → Servicios &amp; Prov. (tipo Vuelos).
              </p>
            )}
            {fuentesCaidas.length > 0 && (
              <p className="state-subtitle">
                No respondieron: {fuentesCaidas.map(f => `${f.nombre} (${f.error || 'sin respuesta'})`).join(', ')}.
              </p>
            )}
            <p className="state-subtitle">
              No encontramos vuelos para esta ruta en la fecha seleccionada.<br /><br />
              <b>💡 Consejo:</b> Intenta mover tu fecha de salida un día antes o un día después.
            </p>
          </div>
        )}

        {hayResultados && (
          <>
            <p className="section-subtitle" role="status" style={{ marginBottom: '16px' }}>
              {resultados.totalOffers}{' '}
              {resultados.totalOffers === 1 ? 'oferta encontrada' : 'ofertas encontradas'}
              {busquedaActiva && (
                <>
                  {' '}
                  para{' '}
                  {busquedaActiva.itineraries[0].origin} →{' '}
                  {busquedaActiva.itineraries[0].destination} del{' '}
                  {formatearFecha(busquedaActiva.itineraries[0].departureDate)}
                </>
              )}
              .
            </p>
            {fuentes.length > 0 && (
              <p className="section-subtitle" style={{ marginTop: '-8px', marginBottom: '16px', fontSize: '0.9rem' }}>
                ✈️ {fuentes.length - fuentesCaidas.length} de {fuentes.length} aerolíneas respondieron
                {fuentesCaidas.length > 0 && <> · sin respuesta: {fuentesCaidas.map(f => f.nombre).join(', ')}</>}
              </p>
            )}

            <div className="atracciones-grid vuelo-grid">
              {ofertasAgrupadas.map((grupoOfertas, indice) => (
                <VueloGroupCard
                  key={indice}
                  ofertasGrupo={grupoOfertas}
                  onSeleccionarTarifa={abrirBloqueo}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── HERO BANNER (visible cuando no hay búsqueda activa) ─────────── */}
      {!resultados && !cargando && (
        <>
          {/* Hero */}
          <section
            style={{
              maxWidth: '1024px',
              margin: '0 auto 0',
              padding: '0 24px 24px',
            }}
          >
            <div
              style={{
                borderRadius: '16px',
                overflow: 'hidden',
                position: 'relative',
                minHeight: '300px',
                background: '#1a2a4a',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {/* Background image */}
              <img
                src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&h=400&fit=crop"
                alt="Viaje aéreo"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: 0.45,
                }}
              />
              {/* Text overlay */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  padding: '40px 48px',
                  maxWidth: '520px',
                }}
              >
                <h2
                  style={{
                    color: '#fff',
                    fontSize: '2.2rem',
                    fontWeight: 800,
                    lineHeight: 1.2,
                    marginBottom: '12px',
                    textShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  }}
                >
                  Hay un Ecuador esperándote
                </h2>
                <p
                  style={{
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: '1.05rem',
                    lineHeight: 1.6,
                    textShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  }}
                >
                  Te llevamos a los mejores destinos dentro del país para que encuentres los lugares que te muevan. Reserva hoy tu próximo vuelo nacional.
                </p>
              </div>
            </div>
          </section>

          {/* ── DESTINOS ────────────────────────────────────────────────── */}
          <section
            style={{
              maxWidth: '1024px',
              margin: '0 auto',
              padding: '0 24px 32px',
            }}
          >
            <h2
              style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                color: '#1a1a1a',
                marginBottom: '4px',
              }}
            >
              Ofertas desde{' '}
              <span style={{ color: '#0057b8' }}>Quito ▾</span>
            </h2>
            <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '20px' }}>
              Haz clic en un destino para iniciar tu búsqueda directamente.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '16px',
              }}
            >
              {DESTINOS_ECUADOR.map((dest) => (
                <button
                  key={dest.codigo}
                  type="button"
                  onClick={() => seleccionarDestino(dest.codigo)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    textAlign: 'left',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)';
                  }}
                  aria-label={`Buscar vuelos a ${dest.nombre}`}
                >
                  {/* Card image */}
                  <div style={{ position: 'relative', height: '150px' }}>
                    <img
                      src={dest.imagen}
                      alt={dest.nombre}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                      onError={(e) => {
                        e.target.src = `https://picsum.photos/seed/${dest.codigo}/400/240`;
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        background: 'rgba(255,255,255,0.92)',
                        color: '#0057b8',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '12px',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Acumula millas
                    </span>
                  </div>
                  {/* Card info */}
                  <div style={{ padding: '14px 16px', background: '#fff' }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '1.05rem',
                        color: '#1a1a1a',
                        marginBottom: '2px',
                      }}
                    >
                      {dest.nombre}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.82rem', marginBottom: '8px' }}>
                      {dest.descripcion}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#888', fontSize: '0.8rem' }}>Desde</span>
                      <span
                        style={{
                          color: '#0057b8',
                          fontWeight: 700,
                          fontSize: '1rem',
                        }}
                      >
                        {dest.desde}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ── CHECK-IN ────────────────────────────────────────────────── */}
          <section
            style={{
              background: '#f8f8f8',
              borderTop: '1px solid #e7e7e7',
              padding: '32px 24px',
            }}
          >
            <div style={{ maxWidth: '1024px', margin: '0 auto' }}>
              <h2
                style={{
                  fontSize: '1.3rem',
                  fontWeight: 700,
                  color: '#1a1a1a',
                  textAlign: 'center',
                  marginBottom: '24px',
                }}
              >
                Prepárate para viajar
              </h2>
              <div style={{ maxWidth: '340px', margin: '0 auto' }}>
                <a
                  href="/mis-reservas"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '20px 24px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                    border: '1px solid #e7e7e7',
                    textDecoration: 'none',
                    transition: 'box-shadow 0.2s, border-color 0.2s',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.14)';
                    e.currentTarget.style.borderColor = '#0057b8';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)';
                    e.currentTarget.style.borderColor = '#e7e7e7';
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: '#fff3f3',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.6rem',
                      flexShrink: 0,
                    }}
                  >
                    🎫
                  </div>
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '1rem',
                        color: '#1a1a1a',
                        marginBottom: '4px',
                      }}
                    >
                      Check-in online
                    </div>
                    <div style={{ color: '#0057b8', fontSize: '0.85rem', lineHeight: 1.4 }}>
                      Obtén tu pase de abordar y ahorra tiempo en el aeropuerto.
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Resumen de Viaje flotante al seleccionar una tarifa */}
      {ofertaAbierta && !holdActivo && (
        <ResumenViaje
          oferta={ofertaAbierta?.oferta}
          tarifaSeleccionada={ofertaAbierta?.tarifa}
          pasajeros={busquedaActiva?.passengers}
          onContinuar={(o) => confirmarResumen(o, ofertaAbierta.tarifa)}
          onModificar={cerrarBloqueo}
        />
      )}

      {/* Pantalla de carga superpuesta si estamos creando el hold */}
      {creandoHold && (
        <div className="modal-overlay" style={{ zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="state-container" style={{ background: 'white', padding: '40px', borderRadius: '12px' }}>
            <div className="spinner" aria-hidden="true" />
            <h3 className="state-title">Preparando tu reserva...</h3>
            <p className="state-subtitle">Asegurando los mejores precios para ti.</p>
          </div>
        </div>
      )}

      {/* El formulario se abre cuando el hold se ha completado */}
      <FormularioReserva
        abierto={Boolean(holdActivo)}
        hold={holdActivo}
        pasajeros={busquedaActiva?.passengers}
        onCerrar={cerrarFormulario}
        onConfirmada={async (reservaData, pasajerosState) => {
          if (pasajerosState) {
            try {
              const itinerarioId = ofertaAbierta?.oferta?.itineraries?.[0]?.itineraryId;
              if (itinerarioId) {
                for (const p of pasajerosState) {
                  if (p.maletasExtra > 0) {
                    await agregarEquipaje(reservaData.bookingId, {
                      passengerId: p.passengerId,
                      itineraryId: itinerarioId,
                      quantity: p.maletasExtra,
                      payment: { paymentReference: 'EXTRABAG-UI' }
                    }, crypto.randomUUID());
                  }
                }
              }
            } catch(e) {
              console.error('Error al agregar maletas extra', e);
            }
          }
          setReserva(reservaData);
        }}
      />
    </main>
  );
}
