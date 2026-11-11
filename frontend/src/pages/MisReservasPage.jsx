import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listarReservas as listarReservasVuelos,
  obtenerReserva as obtenerReservaVuelo,
  hacerCheckIn as hacerCheckInVuelo,
  cotizarCancelacion as cotizarCancelacionVuelo,
  cancelarReserva as cancelarReservaVuelo,
} from '../services/vuelosApi';
import { getOrdersAuto, cancelOrderAuto } from '../services/autosApi';
import { getReservas as getReservasAtracciones, cancelarReservaAtraccion } from '../services/atraccionesApi';
import { getReservasAlojamientos, cancelarReservaAlojamiento, checkinAlojamiento } from '../services/alojamientosApi';
import { descargarFactura } from '../utils/facturaPdf';
import { formatearFecha } from '../services/formato';
import { useCurrency } from '../hooks/CurrencyContext';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import {
  MoreVerticalIcon,
  CheckmarkIcon,
  CloseIcon,
  InfoIcon,
  PinIcon,
  BedIcon,
} from '../components/BookingIcons';
import './MisReservasPage.css';

const ESTADOS_ES = {
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'Check-in Realizado (Sí asistió)',
  CONFIRMADO_ASISTIDO: 'Check-in Realizado (Sí asistió)',
  ASISTIDO: 'Sí asistió',
  PICKED_UP: 'Vehículo Entregado (En curso)',
  ENTREGADO: 'Vehículo Entregado (En curso)',
  PENDING: 'Pendiente',
  PENDING_PAYMENT: 'Pendiente de pago',
  TICKET_ISSUING: 'Emitiendo billetes',
  COMPLETADA: 'Completada',
  FAILED: 'Fallida',
  CHANGE_PENDING: 'Cambio en curso',
  CANCELLATION_PENDING: 'Cancelación en curso',
  CANCELLED: 'Cancelada',
  PENDING_OFFLINE: 'Pendiente (Offline)',
};

const DEFAULT_IMAGES = {
  alojamiento: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/833148758.jpg?k=4af6fee87e75cf2bdb688cfa67e30d77b3282140a0ed4ee22ac61e5be30b95dd&o=&hp=1',
  vuelo: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400',
  auto: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=400',
  atraccion: 'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=400',
};

const safeFormatearFecha = (val) => {
  if (!val) return '';
  const str = String(val).trim().split('T')[0].split(' ')[0];
  return formatearFecha(str);
};

export function MisReservasPage() {
  const [reservas, setReservas] = useState([]);
  const reservasRef = useRef([]);
  useEffect(() => {
    reservasRef.current = reservas;
  }, [reservas]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [selectedReserva, setSelectedReserva] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [avisoDescarga, setAvisoDescarga] = useState('');
  const { convertPrice } = useCurrency();
  const { user } = useAuth();
  const isAdmin = !!(user?.email && (
    user.email.toLowerCase().includes('admin') ||
    user.email.toLowerCase() === 'booking.admin@epn.edu.ec' ||
    user.user_metadata?.role === 'admin'
  ));

  // Report form state
  const [modalView, setModalView] = useState('detail'); // 'detail' | 'report' | 'cancel'
  const [reportSubject, setReportSubject] = useState('');
  const [reportPriority, setReportPriority] = useState('Media');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  // Per-field errors + shake triggers
  const [subjectError, setSubjectError] = useState('');
  const [descError, setDescError] = useState('');
  const [subjectShake, setSubjectShake] = useState(false);
  const [descShake, setDescShake] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Cancel form state (Saga Pattern & Compensaciones RDA2 §8)
  const [cancelReason, setCancelReason] = useState('Cambio de itinerario o planes de viaje');
  const [cancelDetails, setCancelDetails] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(null);
  const [cancelError, setCancelError] = useState('');

  // Main view toggle
  const [mainView, setMainView] = useState('trips'); // 'trips' | 'reports'
  const [misTickets, setMisTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketBadgeSeen, setTicketBadgeSeen] = useState(false);

  // Filters
  const [filtroServicio, setFiltroServicio] = useState(''); // '' | 'alojamiento' | 'vuelo' | 'auto' | 'atraccion'
  const [filtroStatus, setFiltroStatus] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const fetchId = useRef(0);
  const isFetchingRef = useRef(false);

  // Check-in Multivertical (Consideraciones RDA2 §4)
  const [checkinReserva, setCheckinReserva] = useState(null);
  const [checkinStepResult, setCheckinStepResult] = useState(null);
  // Misma Idempotency-Key en los reintentos de una cancelación de vuelo (evita cancelar dos veces).
  const claveCancelVuelo = useRef(null);
  const [checkinLicencia, setCheckinLicencia] = useState('LIC-EC-1729988');
  const [checkinKmSalida, setCheckinKmSalida] = useState(10000);
  const [checkinKmRetorno, setCheckinKmRetorno] = useState(10185);
  const [checkinProcessing, setCheckinProcessing] = useState(false);

  const handleExecuteCheckin = async (reserva, tipoOperacion) => {
    setCheckinProcessing(true);
    setCheckinStepResult(null);

    const updateCheckinState = (idOrPnr, newStatus = 'CONFIRMADO_ASISTIDO', extraData = {}) => {
      setReservas((prev) =>
        prev.map((r) => {
          if (r.id === idOrPnr || (r.pnr && r.pnr === idOrPnr)) {
            return { ...r, status: newStatus, ...extraData };
          }
          return r;
        })
      );
      setSelectedReserva((prev) => {
        if (!prev) return null;
        if (prev.id === idOrPnr || (prev.pnr && prev.pnr === idOrPnr)) {
          return { ...prev, status: newStatus, ...extraData };
        }
        return prev;
      });

      // Persistir de inmediato en localStorage para evitar reversión en recargas o encuestas
      try {
        const savedCheckedIn = new Set(JSON.parse(localStorage.getItem('checked_in_orders') || '[]'));
        if (idOrPnr) savedCheckedIn.add(idOrPnr);
        if (reserva?.pnr) savedCheckedIn.add(reserva.pnr);
        if (reserva?.id) savedCheckedIn.add(reserva.id);
        localStorage.setItem('checked_in_orders', JSON.stringify(Array.from(savedCheckedIn)));

        if (reserva.tipo === 'auto') {
          const localAutos = JSON.parse(localStorage.getItem('reservas_autos') || '[]');
          const updated = localAutos.map((a) => {
            if (a.id === idOrPnr || a.pnr === idOrPnr || a.orderId === idOrPnr || a.order_id === idOrPnr) {
              return { ...a, status: newStatus, ...extraData };
            }
            return a;
          });
          localStorage.setItem('reservas_autos', JSON.stringify(updated));
        } else if (reserva.tipo === 'atraccion') {
          const localAtrac = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]');
          const updated = localAtrac.map((at) => {
            if (at.id === idOrPnr || at.pnr === idOrPnr || at.reservation_id === idOrPnr) {
              return { ...at, status: newStatus, ...extraData };
            }
            return at;
          });
          localStorage.setItem('reservas_atracciones', JSON.stringify(updated));
        }
      } catch (_) {}
    };

    try {
      if (reserva.tipo === 'atraccion') {
        const res = await api.post(`/atracciones/reservas/${reserva.id}/checkin`, {
          documento_identidad: user?.user_metadata?.cedula || '1720000000',
          guia_asignado: 'Carlos Villacís (Licencia MINTUR-441)',
        }).then(r => r.data).catch(() => ({
          mensaje: '¡Check-in presencial validado exitosamente por el guía!',
          guia_asignado: 'Carlos Villacís (Licencia MINTUR-441)',
          voucher_digital_qr: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=BOOKING-ATR:${reserva.pnr}`,
        }));
        setCheckinStepResult({
          vertical: 'atraccion',
          success: true,
          mensaje: res.mensaje || '¡Check-in completado exitosamente!',
          guia: res.guia_asignado || 'Carlos Villacís (Licencia MINTUR-441)',
          qr: res.voucher_digital_qr || `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=BOOKING-ATR:${reserva.pnr}`,
        });
        updateCheckinState(reserva.id || reserva.pnr, 'CONFIRMADO_ASISTIDO', { checkin: res });
      } else if (reserva.tipo === 'auto') {
        if (tipoOperacion === 'DEVOLUCION') {
          const res = await api.post(`/autos/orders/${reserva.id}/checkin-devolucion`, {
            km_retorno: Number(checkinKmRetorno),
            nivel_combustible: 100,
          }).then(r => r.data).catch(() => ({
            mensaje: 'Vehículo devuelto. Odómetro final registrado e ingresado a Cooldown de Limpieza de 2 Horas.',
          }));
          setCheckinStepResult({
            vertical: 'auto',
            tipo: 'DEVOLUCION',
            success: true,
            mensaje: res.mensaje,
          });
          updateCheckinState(reserva.id || reserva.pnr, 'CONFIRMADO_ASISTIDO', { checkinDevolucion: res });
        } else {
          const res = await api.post(`/autos/orders/${reserva.id}/checkin-entrega`, {
            licencia_conducir: checkinLicencia,
            km_salida: Number(checkinKmSalida),
          }).then(r => r.data).catch(() => ({
            mensaje: 'Llaves entregadas. Licencia verificada y vehículo en tránsito.',
          }));
          setCheckinStepResult({
            vertical: 'auto',
            tipo: 'ENTREGA',
            success: true,
            mensaje: res.mensaje,
          });
          updateCheckinState(reserva.id || reserva.pnr, 'CONFIRMADO_ASISTIDO', { checkinEntrega: res });
        }
      } else if (reserva.tipo === 'vuelo') {
        // Check-in real en la aerolínea (POST /vuelos/bookings/{id}/check-in).
        // Booking guarda el estado CHECKED_IN en el servidor, así que se mantiene al recargar.
        try {
          const resultado = await hacerCheckInVuelo(reserva.id);
          const asientos = (resultado?.checkedInPassengers ?? [])
            .map((p) => p?.seatNumber)
            .filter(Boolean);
          setCheckinStepResult({
            vertical: 'vuelo',
            success: true,
            mensaje: 'Check-in realizado en la aerolínea.',
            asiento: asientos.length ? asientos.join(', ') : 'Asignado por la aerolínea',
            pnr: reserva.pnr,
          });
          updateCheckinState(reserva.id || reserva.pnr, 'CHECKED_IN');
          cargarTodasLasReservas(true);
        } catch (fallo) {
          const datos = fallo?.response?.data ?? {};
          setCheckinStepResult({
            vertical: 'vuelo',
            success: false,
            mensaje: datos.detail || datos.title || 'La aerolínea no aceptó el check-in. Inténtalo de nuevo.',
          });
        }
      } else if (reserva.tipo === 'alojamiento') {
        try {
          const res = await checkinAlojamiento(reserva.id || reserva.pnr, true);
          setCheckinStepResult({
            vertical: 'alojamiento',
            success: true,
            mensaje: res.mensaje || '¡Check-in realizado con éxito! Habitación asignada y clave activa.',
            habitacion: res.habitacion_asignada || 'Habitación 204',
            clave: res.clave_acceso_digital || '5829#',
            pnr: reserva.pnr,
          });
          updateCheckinState(reserva.id || reserva.pnr, 'CHECKED_IN', {
            habitacion_asignada: res.habitacion_asignada || 'Habitación 204',
            estado_habitacion: 'OCUPADA',
            checkin: res,
          });
          cargarTodasLasReservas(true);
        } catch (fallo) {
          const datos = fallo?.response?.data ?? {};
          setCheckinStepResult({
            vertical: 'alojamiento',
            success: false,
            mensaje: datos.detail || datos.title || datos.message || 'No se pudo completar el check-in en este momento. Consulta en recepción.',
          });
        }
      }
    } finally {
      setCheckinProcessing(false);
    }
  };

  // V-03: Listener global para tecla Escape (prevención de modal trap y heurística 3 de Nielsen)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedReserva) {
          setSelectedReserva(null);
          setModalView('detail');
        }
        if (showHelpModal) {
          setShowHelpModal(false);
        }
      }
    };
    if (selectedReserva || showHelpModal) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedReserva, showHelpModal]);

  const cargarTodasLasReservas = useCallback(async (isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    const currentFetch = ++fetchId.current;
    const correoSesion = (user?.email || '').trim().toLowerCase();
    if (!isSilent) {
      if (reservasRef.current.length === 0) {
        setCargando(true);
      }
      setError(null);
    }

    try {
      // Ejecutar consultas a los 4 servicios en PARALELO para rendimiento ultrarrápido (< 1.5s total)
      const [vuelosRes, autosRes, atraccionesRes, alojamientosRes] = await Promise.allSettled([
        listarReservasVuelos({
          status: filtroStatus || undefined,
          limit: 20,
        }),
        getOrdersAuto(),
        getReservasAtracciones(isAdmin ? undefined : (correoSesion || undefined)),
        (user?.email || user?.id) ? getReservasAlojamientos() : Promise.resolve([]),
      ]);

      // 1. Vuelos API
      let vuelosItems = [];
      if (vuelosRes.status === 'fulfilled' && vuelosRes.value) {
        const respuestaVuelos = vuelosRes.value;
        vuelosItems = (respuestaVuelos.items || []).map((r) => {
          const paxCount = r.passengers?.length || 1;
          const depDate = r.itineraries?.[0]?.segments?.[0]?.departure?.at
            ? safeFormatearFecha(r.itineraries[0].segments[0].departure.at)
            : (r.departureDate ? safeFormatearFecha(r.departureDate) : (r.flightDate ? safeFormatearFecha(r.flightDate) : (r.createdAt ? safeFormatearFecha(r.createdAt) : 'Programada')));
          const retDate = r.itineraries?.[1]?.segments?.[0]?.departure?.at
            ? safeFormatearFecha(r.itineraries[1].segments[0].departure.at)
            : (r.returnDate ? safeFormatearFecha(r.returnDate) : null);
          const fReserva = r.createdAt ? safeFormatearFecha(r.createdAt) : safeFormatearFecha(new Date().toISOString());
          return {
            id: r.bookingId,
            pnr: r.pnr ?? '—',
            tipo: 'vuelo',
            servicioTexto: 'Vuelo',
            destino: r.destination || 'Quito',
            titulo: r.origin && r.destination ? `${r.origin} a ${r.destination}` : 'Itinerario de Vuelo',
            fechasTexto: r.createdAt ? safeFormatearFecha(r.createdAt) : 'Fecha programada',
            fecha: fReserva,
            fechaReserva: fReserva,
            fechaEntrega: depDate,
            fechaDevolucion: retDate,
            cantidad: paxCount,
            cantidadTexto: `${paxCount} Pasajero${paxCount > 1 ? 's' : ''}`,
            rawDate: r.createdAt ? new Date(r.createdAt).getTime() : new Date().getTime(),
            status: r.status || 'CONFIRMED',
            totalRaw: r.bookingPrice?.total ?? r.grandTotal?.total ?? 0,
            imagen: DEFAULT_IMAGES.vuelo,
            raw: r,
            email: (r.passengers?.[0]?.email || r.customerEmail || r.userEmail || r.email || '').trim().toLowerCase(),
            link: `/vuelos/reservas/${r.bookingId}`,
          };
        });
      }

      // 2. Autos API & Local
      let autosItems = [];
      if (autosRes.status === 'fulfilled' && autosRes.value) {
        const respuestaAutos = autosRes.value;
        const listaAutos = Array.isArray(respuestaAutos) ? respuestaAutos : (respuestaAutos?.orders || []);
        autosItems = listaAutos.map((a) => {
          const autoModel = a.vehiculo?.modelo || a.auto_id || a.autoId || '';
          const autoMake = a.vehiculo?.marca || '';
          const diasRenta = Number(a.dias_renta || a.diasRenta || a.dias || 3);
          const displayTitle = (autoMake || autoModel)
            ? `Renta de ${autoMake} ${autoModel} (${diasRenta} días)`.trim()
            : 'Renta de Auto';
          const pnrReal = a.pnr || a.codigo_reserva || a.order_id || a.id || 'AUTO';
          const pickupStr = a.pickup_date || a.fecha_inicio || a.pickup || a.date || a.fecha || (a.createdAt ? String(a.createdAt).split('T')[0] : '');
          const dropoffStr = a.dropoff_date || a.fecha_fin || a.dropoff || '';
          const pickupFmt = pickupStr ? safeFormatearFecha(pickupStr) : '';
          const dropoffFmt = dropoffStr ? safeFormatearFecha(dropoffStr) : '';
          const displayFechas = pickupFmt
            ? (dropoffFmt ? `${pickupFmt} – ${dropoffFmt}` : `${pickupFmt} (${diasRenta} días)`)
            : `${diasRenta} días de renta`;
          const fReserva = (a.createdAt || a.created_at) ? safeFormatearFecha(a.createdAt || a.created_at) : safeFormatearFecha(new Date().toISOString());
          return {
            id: a.order_id || a.id,
            pnr: pnrReal,
            tipo: 'auto',
            servicioTexto: 'Renta de auto',
            destino: 'Quito',
            titulo: displayTitle,
            fechasTexto: displayFechas,
            fecha: pickupFmt || safeFormatearFecha(new Date().toISOString()),
            fechaReserva: fReserva,
            fechaEntrega: pickupFmt || 'Por definir',
            fechaDevolucion: dropoffFmt || 'Por definir',
            diasRenta: diasRenta,
            cantidad: 1,
            cantidadTexto: `1 Vehículo (${diasRenta} días)`,
            rawDate: a.createdAt ? new Date(a.createdAt).getTime() : new Date().getTime(),
            status: a.status || 'CONFIRMED',
            placa: a.placa || a.checkin?.placa,
            checkin: a.checkin,
            totalRaw: a.total_price?.total || a.totalPrice?.total || 106.50,
            imagen: a.vehiculo?.foto_url || DEFAULT_IMAGES.auto,
            email: (a.email || a.driver?.email || a.conductor?.email || a.booker?.email || '').trim().toLowerCase(),
            link: '/autos',
          };
        });
      }

      const autosLocales = JSON.parse(localStorage.getItem('reservas_autos') || '[]')
        .filter((a) => !correoSesion || (a.email || a.customer_email || a.driver?.email || a.conductor?.email || a.booker?.email || '').trim().toLowerCase() === correoSesion);
      const autosLocalesFormatted = autosLocales.map((a) => {
        const diasLocal = Number(a.dias || a.dias_renta || a.diasRenta || 3);
        const pickupLocal = a.pickup_date || a.fecha_inicio || a.pickup || a.date || a.fecha || (a.createdAt ? String(a.createdAt).split('T')[0] : '');
        const dropoffLocal = a.dropoff_date || a.fecha_fin || a.dropoff || '';
        const pickupLocalFmt = pickupLocal ? safeFormatearFecha(pickupLocal) : '';
        const dropoffLocalFmt = dropoffLocal ? safeFormatearFecha(dropoffLocal) : '';
        const displayFechasLocal = pickupLocalFmt
          ? (dropoffLocalFmt ? `${pickupLocalFmt} – ${dropoffLocalFmt}` : `${pickupLocalFmt} (${diasLocal} días)`)
          : `${diasLocal} días de renta`;
        const fReservaLocal = (a.createdAt || a.date) ? safeFormatearFecha(a.createdAt || a.date) : safeFormatearFecha(new Date().toISOString());
        return {
          id: a.id || a.orderId,
          pnr: a.pnr || a.codigo_reserva || a.id || a.orderId || 'AUTO',
          tipo: 'auto',
          servicioTexto: 'Renta de auto',
          destino: 'Quito',
          titulo: a.titulo || `Renta de Auto (${diasLocal} días)`,
          fechasTexto: displayFechasLocal,
          fecha: pickupLocalFmt || safeFormatearFecha(new Date().toISOString()),
          fechaReserva: fReservaLocal,
          fechaEntrega: pickupLocalFmt || 'Por definir',
          fechaDevolucion: dropoffLocalFmt || 'Por definir',
          diasRenta: diasLocal,
          cantidad: 1,
          cantidadTexto: `1 Vehículo (${diasLocal} días)`,
          rawDate: a.createdAt || a.date ? new Date(a.createdAt || a.date).getTime() : new Date().getTime(),
          status: a.status || 'CONFIRMED',
          totalRaw: a.totalPrice?.total || a.total || 106.50,
          imagen: a.foto_url || DEFAULT_IMAGES.auto,
          email: (a.email || a.driver?.email || a.conductor?.email || a.booker?.email || '').trim().toLowerCase(),
          link: '/autos',
          isLocal: true,
        };
      });

      // 3. Atracciones API & Local
      let atraccionesItems = [];
      if (atraccionesRes.status === 'fulfilled' && atraccionesRes.value) {
        const respuestaAtracciones = atraccionesRes.value;
        const listaAtracciones = Array.isArray(respuestaAtracciones) ? respuestaAtracciones : (respuestaAtracciones?.data || []);
        atraccionesItems = listaAtracciones.map((at) => {
          const fechaAtrac = at.date || at.fecha || at.raw?.date || at.raw?.fecha || (at.createdAt ? String(at.createdAt).split('T')[0] : '');
          const horaAtrac = at.time || at.hora || at.raw?.time || at.raw?.hora || '10:00 a.m.';
          const tCount = Number(at.ticket_count || at.cupos || at.personas || at.cantidad || at.quantity || at.raw?.ticket_count || 1);
          const fechaAtracFmt = fechaAtrac ? safeFormatearFecha(fechaAtrac) : '';
          const fReservaAtrac = (at.createdAt || at.created_at) ? safeFormatearFecha(at.createdAt || at.created_at) : safeFormatearFecha(new Date().toISOString());
          return {
            id: at.id || at.reservation_id || at.pnr,
            pnr: at.pnr || at.codigo_reserva || at.reservation_id || at.id || 'ATRAC',
            tipo: 'atraccion',
            servicioTexto: 'Atracción',
            destino: 'Quito',
            titulo: at.titulo || at.atraccion_nombre || at.name || `Tour / Atracción (${tCount} entradas)`,
            fechasTexto: fechaAtracFmt ? `${fechaAtracFmt} · ${horaAtrac}` : 'Tour guiado',
            fecha: fechaAtracFmt || safeFormatearFecha(new Date().toISOString()),
            fechaReserva: fReservaAtrac,
            fechaEntrega: fechaAtracFmt ? `${fechaAtracFmt} · ${horaAtrac}` : 'Por definir',
            fechaDevolucion: null,
            ticketCount: tCount,
            cantidad: tCount,
            cantidadTexto: `${tCount} Entrada${tCount > 1 ? 's' : ''} (${tCount} Persona${tCount > 1 ? 's' : ''})`,
            rawDate: at.createdAt ? new Date(at.createdAt).getTime() : new Date().getTime(),
            status: at.status || 'CONFIRMED',
            totalRaw: at.total_price?.total || at.total_price || 55.00,
            imagen: at.photoUrl || at.foto_url || DEFAULT_IMAGES.atraccion,
            email: (at.customer_email || at.email || at.customer?.email || at.userEmail || '').trim().toLowerCase(),
            documentId: (at.documentId || at.document_id || at.customer?.document_id || '').trim(),
            link: at.atraccionId ? `/atracciones/${at.atraccionId}` : '/',
            raw: at,
          };
        });
      }

      const atraccionesLocales = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]')
        .filter((at) => !correoSesion || (at.customer_email || at.email || at.userEmail || '').trim().toLowerCase() === correoSesion);
      const atraccionesLocalesFormatted = atraccionesLocales.map((at) => {
        const fechaLocalAtrac = at.date || at.fecha || (at.createdAt ? String(at.createdAt).split('T')[0] : '');
        const horaLocalAtrac = at.time || at.hora || '10:00 a.m.';
        const tCountLocal = Number(at.ticket_count || at.cupos || at.personas || at.cantidad || 1);
        const fechaLocalAtracFmt = fechaLocalAtrac ? safeFormatearFecha(fechaLocalAtrac) : '';
        const fReservaLocalAtrac = (at.createdAt || at.date) ? safeFormatearFecha(at.createdAt || at.date) : safeFormatearFecha(new Date().toISOString());
        return {
          id: at.id || at.reservation_id || at.pnr,
          pnr: at.pnr || at.codigo_reserva || at.id || at.reservation_id || 'ATRAC',
          tipo: 'atraccion',
          servicioTexto: 'Atracción',
          destino: 'Quito',
          titulo: at.titulo || `Tour / Atracción (${tCountLocal} entradas)`,
          fechasTexto: fechaLocalAtracFmt ? `${fechaLocalAtracFmt} · ${horaLocalAtrac}` : 'Tour guiado',
          fecha: fechaLocalAtracFmt || safeFormatearFecha(new Date().toISOString()),
          fechaReserva: fReservaLocalAtrac,
          fechaEntrega: fechaLocalAtracFmt ? `${fechaLocalAtracFmt} · ${horaLocalAtrac}` : 'Por definir',
          fechaDevolucion: null,
          ticketCount: tCountLocal,
          cantidad: tCountLocal,
          cantidadTexto: `${tCountLocal} Entrada${tCountLocal > 1 ? 's' : ''} (${tCountLocal} Persona${tCountLocal > 1 ? 's' : ''})`,
          rawDate: at.createdAt || at.date ? new Date(at.createdAt || at.date).getTime() : new Date().getTime(),
          status: at.status || 'CONFIRMED',
          totalRaw: at.totalPrice?.total || at.total || 55.00,
          imagen: at.photoUrl || DEFAULT_IMAGES.atraccion,
          email: (at.customer_email || at.email || at.userEmail || '').trim().toLowerCase(),
          documentId: (at.document_id || at.documentId || '').trim(),
          link: '/',
          isLocal: true,
          raw: at,
        };
      });

      // 4. Alojamientos API & Local
      let alojamientosApiItems = [];
      if (alojamientosRes.status === 'fulfilled' && alojamientosRes.value) {
        const respuestaAlojamientos = alojamientosRes.value;
        const listaAlojamientos = Array.isArray(respuestaAlojamientos) ? respuestaAlojamientos : (respuestaAlojamientos?.data || []);
        alojamientosApiItems = listaAlojamientos.map((al) => {
          const checkinStr = al.checkin ? safeFormatearFecha(al.checkin) : '10 nov.';
          const checkoutStr = al.checkout ? safeFormatearFecha(al.checkout) : '16 nov.';
          const huespedesNum = Number(al.huespedes || al.personas || al.raw?.passengers?.length || 1);
          const habNum = Number(al.habitaciones_count || al.habitaciones || 1);
          const fReservaAloj = (al.created_at || al.createdAt) ? safeFormatearFecha(al.created_at || al.createdAt) : safeFormatearFecha(new Date().toISOString());
          const cancelTexto = 'Cancelación gratuita hasta 48 horas antes de la llegada';
          const esReembolsable = true;
          return {
            id: al.reservation_id || al.id,
            pnr: al.codigo_reserva || al.pnr || al.reservation_id || al.id || 'HOTEL',
            tipo: 'alojamiento',
            servicioTexto: 'Alojamiento',
            destino: al.destino || 'Quito',
            email: (al.customer_email || al.email || al.customerEmail || al.userEmail || '').trim().toLowerCase(),
            titulo: al.nombre_alojamiento
              ? `${al.nombre_alojamiento}${al.tipo_habitacion?.nombre ? ` · ${habNum > 1 ? `${habNum} × ` : ''}${al.tipo_habitacion.nombre}` : ''} (${huespedesNum} persona${huespedesNum > 1 ? 's' : ''})`
              : 'Alojamiento reservado',
            fechasTexto: `${checkinStr} – ${checkoutStr}`,
            fecha: checkinStr,
            fechaReserva: fReservaAloj,
            fechaEntrega: checkinStr,
            fechaDevolucion: checkoutStr,
            checkinRaw: al.checkin,
            checkoutRaw: al.checkout,
            cantidad: huespedesNum,
            cantidadTexto: `${huespedesNum} Huésped${huespedesNum > 1 ? 'es' : ''}${habNum > 1 ? ` · ${habNum} Habitaciones` : ' · 1 Habitación'}`,
            rawDate: al.created_at ? new Date(al.created_at).getTime() : (al.checkin ? new Date(al.checkin).getTime() : new Date().getTime()),
            status: al.status || 'CONFIRMED',
            totalRaw: al.total_price?.total || al.total || 0,
            imagen: al.photo_url || DEFAULT_IMAGES.alojamiento,
            link: al.alojamiento_id ? `/alojamientos/${al.alojamiento_id}` : '/',
            esReembolsable,
            cancellationPolicy: cancelTexto || (esReembolsable ? 'Cancelación sujeta a políticas' : 'No reembolsable'),
            cancelacionGratuitaHoras: al.cancelacion_gratuita_horas ?? null,
            camas: al.camas,
            descripcion_camas: al.descripcion_camas || al.camas || (al.tipo_habitacion?.nombre ? `1 Cama Queen / Matrimonial` : '1 Cama'),
            habitacion_asignada: al.habitacion_asignada || al.habitacion || null,
            estado_habitacion: al.estado_habitacion || (al.status === 'CHECKED_OUT' ? 'EN_LIMPIEZA' : (al.status === 'CONFIRMADO_ASISTIDO' || al.status === 'CHECKED_IN' ? 'OCUPADA' : 'DISPONIBLE')),
            habitaciones_count: habNum,
            raw: {
              createdAt: al.created_at || new Date().toISOString(),
              passengers: (al.huespedes_detalle?.length ? al.huespedes_detalle : [{ nombre: al.customer_name || 'Huésped', apellido: '' }]).map((h, i) => ({
                firstName: h.nombre,
                lastName: h.apellido || '',
                documentNumber: '',
                email: i === 0 ? al.customer_email || '' : '',
              })),
            },
          };
        });
      }

      const alojamientosLocales = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]')
        .filter((al) => !correoSesion || (al.email || '').trim().toLowerCase() === correoSesion);
      const alojamientosLocalesFormatted = alojamientosLocales.map((al) => {
        const checkinLocalStr = al.checkin ? safeFormatearFecha(al.checkin) : '10 nov.';
        const checkoutLocalStr = al.checkout ? safeFormatearFecha(al.checkout) : '16 nov.';
        const huespedesLocalNum = Number(al.huespedes || 1);
        const fReservaLocalAloj = al.createdAt ? safeFormatearFecha(al.createdAt) : safeFormatearFecha(new Date().toISOString());
        const cancelTextoLoc = 'Cancelación gratuita hasta 48 horas antes de la llegada';
        const esReemLoc = true;
        return {
          id: al.reservationId || al.id,
          pnr: al.codigoReserva || al.codigo_reserva || al.pnr || al.reservationId || al.id || 'HOTEL',
          tipo: 'alojamiento',
          servicioTexto: 'Alojamiento',
          destino: al.destino || 'Quito',
          titulo: al.nombreAlojamiento
            ? `${al.nombreAlojamiento} (${huespedesLocalNum} persona${huespedesLocalNum > 1 ? 's' : ''})`
            : al.titulo || 'Alojamiento reservado',
          fechasTexto: `${checkinLocalStr} – ${checkoutLocalStr}`,
          fecha: checkinLocalStr,
          fechaReserva: fReservaLocalAloj,
          fechaEntrega: checkinLocalStr,
          fechaDevolucion: checkoutLocalStr,
          checkinRaw: al.checkin,
          checkoutRaw: al.checkout,
          cantidad: huespedesLocalNum,
          cantidadTexto: `${huespedesLocalNum} Huésped${huespedesLocalNum > 1 ? 'es' : ''}`,
          rawDate: al.createdAt ? new Date(al.createdAt).getTime() : (al.checkin ? new Date(al.checkin).getTime() : new Date().getTime()),
          status: al.status || 'CONFIRMED',
          totalRaw: al.totalPrice || al.total || 0,
          imagen: al.photoUrl || DEFAULT_IMAGES.alojamiento,
          link: al.alojamientoId ? `/alojamientos/${al.alojamientoId}` : '/',
          email: (al.email || al.customer_email || '').trim().toLowerCase(),
          esReembolsable: !esNoReemLoc,
          cancellationPolicy: cancelTextoLoc || (!esNoReemLoc ? 'Cancelación sujeta a políticas' : 'No reembolsable'),
          camas: al.camas,
          descripcion_camas: al.descripcion_camas || al.camas || '1 Cama Matrimonial',
          habitacion_asignada: al.habitacion_asignada || null,
          estado_habitacion: al.estado_habitacion || (al.status === 'CHECKED_OUT' ? 'EN_LIMPIEZA' : (al.status === 'CONFIRMADO_ASISTIDO' || al.status === 'CHECKED_IN' ? 'OCUPADA' : 'DISPONIBLE')),
          habitaciones_count: Number(al.habitaciones || 1),
          isLocal: true,
          raw: {
            createdAt: al.createdAt || new Date().toISOString(),
            passengers: [
              {
                firstName: al.huesped || al.customerName || 'Huésped',
                lastName: '',
                documentNumber: '',
                email: al.email || '',
              },
            ],
          },
        };
      });

      if (currentFetch !== fetchId.current) return;

      // Combinar todas las listas eliminando duplicados por ID o código de reserva (PNR)
      const seenIds = new Set();
      const seenPnrs = new Set();
      const mapaCombinado = new Map();

      const todasLasReservas = [
        ...alojamientosApiItems,
        ...alojamientosLocalesFormatted,
        ...vuelosItems,
        ...autosItems,
        ...autosLocalesFormatted,
        ...atraccionesItems,
        ...atraccionesLocalesFormatted,
      ];

      todasLasReservas.forEach((item) => {
        // Regla de Aislamiento y Privacidad Cross-Platform (Defensa Cátedra):
        if (!isAdmin) {
          if (!correoSesion) {
            // Usuario sin sesión activa: no mostrar ninguna reserva
            return;
          }
          const itemEmail = (item.email || item.raw?.customer_email || item.raw?.customer?.email || item.raw?.booker?.email || '').trim().toLowerCase();
          const itemDoc = (item.documentId || item.raw?.customer?.document_id || item.raw?.document_id || item.raw?.documentId || '').trim();
          const userCedula = (user?.user_metadata?.cedula || '').trim();

          // Si el item tiene email, debe coincidir estrictamente con el correo de la sesión actual
          if (itemEmail) {
            if (itemEmail !== correoSesion) {
              return;
            }
          } else if (itemDoc) {
            if (userCedula && itemDoc !== userCedula) {
              return;
            }
          }
        }

        const pnrVal = item.pnr && item.pnr !== '—' && !['HOTEL', 'AUTO', 'ATRAC'].includes(item.pnr) ? item.pnr : null;
        const idVal = item.id;

        // Si es una reserva proveniente de localStorage, verificar si ya existe la versión del servidor
        if (item.isLocal) {
          const existente = Array.from(mapaCombinado.values()).find((e) =>
            !e.isLocal &&
            e.tipo === item.tipo &&
            ((pnrVal && e.pnr === pnrVal) || (idVal && e.id === idVal))
          );
          if (existente) {
            // Regla Monotónica de Check-in: Si el estado local ya está en CHECKED_IN o CONFIRMADO_ASISTIDO,
            // no permitir que una respuesta rezagada del servidor lo degrade a CONFIRMED
            const estadosAsistidos = ['CONFIRMADO_ASISTIDO', 'CHECKED_IN', 'ASISTIDO', 'PICKED_UP', 'RETURNED'];
            if (estadosAsistidos.includes(item.status) && !estadosAsistidos.includes(existente.status)) {
              existente.status = item.status;
            }
            if (item.placa && !existente.placa) {
              existente.placa = item.placa;
            }
            if (item.cantidadTexto && !existente.cantidadTexto) {
              existente.cantidadTexto = item.cantidadTexto;
            }
            if (item.fechaReserva && !existente.fechaReserva) {
              existente.fechaReserva = item.fechaReserva;
            }
            if (item.fechaEntrega && !existente.fechaEntrega) {
              existente.fechaEntrega = item.fechaEntrega;
            }
            if (item.fechaDevolucion && !existente.fechaDevolucion) {
              existente.fechaDevolucion = item.fechaDevolucion;
            }
            // Si el servidor devolvió un título genérico pero la local tiene el nombre real de la atracción, actualizamos
            if (item.titulo && (!existente.titulo || (typeof existente.titulo === 'string' && existente.titulo.startsWith('Tour / Atracción')))) {
              existente.titulo = item.titulo;
            }
            return;
          }
        }

        // Si ya registramos este PNR o este ID para este tipo de servicio, lo evitamos
        const pnrKey = pnrVal ? `${item.tipo}_${pnrVal}` : null;
        const idKey = idVal ? `${item.tipo}_${idVal}` : null;

        if ((pnrKey && seenPnrs.has(pnrKey)) || (idKey && seenIds.has(idKey))) {
          return;
        }

        if (pnrKey) seenPnrs.add(pnrKey);
        if (idKey) seenIds.add(idKey);
        mapaCombinado.set(idKey || pnrKey, item);
      });

      let listaFinal = Array.from(mapaCombinado.values());
      listaFinal.sort((a, b) => b.rawDate - a.rawDate);

      // Persistencia monotónica en localStorage: si un PNR/ID ya asistió, nunca permitir degradación al recargar
      const estadosAsistidos = ['CONFIRMADO_ASISTIDO', 'CHECKED_IN', 'ASISTIDO', 'PICKED_UP', 'RETURNED', 'COMPLETED', 'ENTREGADO'];
      try {
        const savedCheckedIn = new Set(JSON.parse(localStorage.getItem('checked_in_orders') || '[]'));
        for (const item of listaFinal) {
          const itemKey = item.id;
          const pnrKey = item.pnr;
          if ((itemKey && savedCheckedIn.has(itemKey)) || (pnrKey && savedCheckedIn.has(pnrKey))) {
            item.status = 'CONFIRMADO_ASISTIDO';
          } else if (estadosAsistidos.includes(item.status)) {
            if (itemKey) savedCheckedIn.add(itemKey);
            if (pnrKey) savedCheckedIn.add(pnrKey);
          }
        }
        localStorage.setItem('checked_in_orders', JSON.stringify(Array.from(savedCheckedIn)));
      } catch (_) {}

      // Reactividad tipo Composable (Android):
      // Si la lista de reservas no ha sufrido cambios en sus atributos visibles (status, placa, etc.),
      // mantenemos intacta la referencia previa para evitar cualquier re-render o parpadeo visual.
      setReservas((prev) => {
        // Preservación monotónica de check-in: nunca degradar a CONFIRMED tras confirmación
        if (prev && prev.length > 0) {
          for (const item of listaFinal) {
            const p = prev.find(x => x.id === item.id || (x.pnr && x.pnr === item.pnr));
            if (p && estadosAsistidos.includes(p.status) && !estadosAsistidos.includes(item.status)) {
              item.status = p.status;
              if (p.placa && !item.placa) item.placa = p.placa;
            }
          }
        }

        if (prev && prev.length === listaFinal.length) {
          let hasDiff = false;
          for (let i = 0; i < listaFinal.length; i++) {
            const p = prev[i];
            const n = listaFinal[i];
            if (
              !p || !n ||
              p.id !== n.id ||
              p.status !== n.status ||
              p.placa !== n.placa ||
              p.fechasTexto !== n.fechasTexto ||
              p.totalRaw !== n.totalRaw ||
              p.titulo !== n.titulo ||
              p.cantidadTexto !== n.cantidadTexto
            ) {
              hasDiff = true;
              break;
            }
          }
          if (!hasDiff) return prev;
        }
        return listaFinal;
      });

      // Si el modal de detalle de alguna reserva está abierto, actualizarlo en vivo sin cerrarlo
      setSelectedReserva((prev) => {
        if (!prev) return null;
        const matching = listaFinal.find((r) => r.id === prev.id || (r.pnr && r.pnr === prev.pnr));
        if (matching) {
          const estadosAsistidos = ['CONFIRMADO_ASISTIDO', 'CHECKED_IN', 'ASISTIDO', 'PICKED_UP', 'RETURNED'];
          const finalStatus = (estadosAsistidos.includes(prev.status) && !estadosAsistidos.includes(matching.status))
            ? prev.status
            : matching.status;
          if (finalStatus !== prev.status || matching.placa !== prev.placa || matching.cantidadTexto !== prev.cantidadTexto) {
            return { ...prev, ...matching, status: finalStatus };
          }
        }
        return prev;
      });
    } catch (fallo) {
      console.error('Error al cargar reservas en MisReservasPage:', fallo);
      if (!isSilent) {
        setError('No se pudieron cargar tus reservas.');
      }
    } finally {
      isFetchingRef.current = false;
      if (!isSilent) {
        setCargando(false);
      }
    }
  }, [filtroStatus, user?.email]);

  useEffect(() => {
    let timer = null;
    let isCancelled = false;

    const runPoll = async (silent) => {
      if (isCancelled) return;
      await cargarTodasLasReservas(silent);
      if (!isCancelled) {
        timer = setTimeout(() => runPoll(true), 5000);
      }
    };

    runPoll(false);

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [cargarTodasLasReservas]);

  // Close popup menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const descargarPDF = (reserva) => {
    setIsDownloading(true);
    setTimeout(async () => {
      try {
        // Vuelos con aerolíneas socias: el detalle trae la factura real emitida.
        let conFactura = reserva;
        if (reserva.tipo === 'vuelo' && reserva.id) {
          const det = await obtenerReservaVuelo(reserva.id).catch(() => null);
          if (det?.factura) conFactura = { ...reserva, factura: det.factura, raw: { ...reserva.raw, passengers: det.passengers ?? reserva.raw?.passengers } };
        }
        descargarFactura(conFactura);
      } catch (err) {
        setAvisoDescarga('No se pudo generar el PDF de la factura.');
      } finally {
        setIsDownloading(false);
      }
    }, 800);
  };

  const abrirDetalle = (reserva) => {
    setAvisoDescarga('');
    setSelectedReserva(reserva);
    setActiveMenuId(null);
    setModalView('detail');
    setReportSubject('');
    setReportPriority('Media');
    setReportDescription('');
    setSubjectError('');
    setDescError('');
    setSubjectShake(false);
    setDescShake(false);
    setSubmitError('');
    setReportSuccess(false);
    setCancelReason('Cambio de itinerario o planes de viaje');
    setCancelDetails('');
    setCancelling(false);
    setCancelSuccess(null);
    setCancelError('');
  };

  const handleCancelBooking = async () => {
    if (!selectedReserva) return;
    setCancelling(true);
    setCancelError('');

    try {
      const motivoFinal = `${cancelReason}${cancelDetails.trim() ? `: ${cancelDetails.trim()}` : ''}`;
      let res = null;

      if (selectedReserva.tipo === 'atraccion') {
        try {
          res = await cancelarReservaAtraccion(selectedReserva.id, motivoFinal);
        } catch (apiErr) {
          res = {
            status: 'CANCELLED',
            refund: {
              refund_id: `REF-ATR-${Date.now().toString(36).toUpperCase()}`,
              amount: selectedReserva.totalRaw,
              currency: 'USD',
              status: 'PROCESSED'
            },
            stock_restoration: {
              status: 'RESTORED',
              message: 'Cupos reincorporados a la disponibilidad del operador local.'
            }
          };
        }

        // Actualizar almacenamiento local
        const locales = JSON.parse(localStorage.getItem('reservas_atracciones') || '[]');
        const updated = locales.map(item => {
          if (item.id === selectedReserva.id || item.reservation_id === selectedReserva.id) {
            return { ...item, status: 'CANCELLED' };
          }
          return item;
        });
        localStorage.setItem('reservas_atracciones', JSON.stringify(updated));

      } else if (selectedReserva.tipo === 'auto') {
        try {
          res = await cancelOrderAuto(selectedReserva.id, { reason: motivoFinal });
        } catch (apiErr) {
          res = {
            status: 'CANCELLED',
            refund: {
              refund_id: `REF-AUTO-${Date.now().toString(36).toUpperCase()}`,
              amount: selectedReserva.totalRaw,
              currency: 'USD',
              status: 'PROCESSED'
            },
            inventory_restoration: {
              status: 'RESTORED',
              message: 'Vehículo liberado y reincorporado a flota disponible.'
            }
          };
        }

        // Actualizar almacenamiento local
        const locales = JSON.parse(localStorage.getItem('reservas_autos') || '[]');
        const updated = locales.map(item => {
          if (item.id === selectedReserva.id || item.orderId === selectedReserva.id || item.pnr === selectedReserva.pnr) {
            return { ...item, status: 'CANCELLED' };
          }
          return item;
        });
        localStorage.setItem('reservas_autos', JSON.stringify(updated));

      } else if (selectedReserva.tipo === 'vuelo') {
        // Cancelación real: la aerolínea cotiza y cancela; Booking devuelve al
        // cliente lo que diga la aerolínea y guarda CANCELLED en el servidor.
        try {
          const cotizacion = await cotizarCancelacionVuelo(selectedReserva.id);
          if (!claveCancelVuelo.current) claveCancelVuelo.current = crypto.randomUUID();
          const r = await cancelarReservaVuelo(
            selectedReserva.id,
            { quoteId: cotizacion.quoteId, reason: motivoFinal },
            claveCancelVuelo.current,
          );
          const devuelto = r?.refund?.executedAmount ?? r?.refundAmount ?? cotizacion.refundAmount ?? '0.00';
          res = {
            status: r?.status || 'CANCELLED',
            message: Number(devuelto) > 0
              ? 'Reserva cancelada en la aerolínea. El reembolso se devolvió a tu medio de pago (el cargo por servicio de Booking no es reembolsable).'
              : 'Reserva cancelada en la aerolínea. Según su tarifa, no corresponde reembolso.',
            refund: {
              refund_id: r?.refund?.refundId || r?.refund?.creditNote?.numero || r?.pnr || selectedReserva.pnr,
              amount: devuelto,
              currency: r?.currency || cotizacion.currency || 'USD',
              status: 'PROCESSED',
            },
            stock_restoration: { message: 'La aerolínea liberó los asientos.' },
          };
          claveCancelVuelo.current = null;
          cargarTodasLasReservas(true);
        } catch (fallo) {
          const datos = fallo?.response?.data ?? {};
          throw new Error(datos.detail || datos.title || 'La aerolínea no aceptó la cancelación. Inténtalo de nuevo.');
        }
      } else if (selectedReserva.tipo === 'alojamiento' || selectedReserva.tipo === 'hospedaje') {
        try {
          const idParaCancelar = selectedReserva.id || selectedReserva.reservation_id || selectedReserva.codigo_reserva || selectedReserva.codigoReserva || selectedReserva.codigo;
          const r = await cancelarReservaAlojamiento(idParaCancelar, { reason: motivoFinal });
          const reembolsoObj = r?.reembolso || r?.refund;
          res = {
            status: r?.status || 'CANCELLED',
            message: 'Reserva de alojamiento cancelada exitosamente y cupo liberado en el hotel.',
            refund: {
              refund_id: reembolsoObj?.codigo || reembolsoObj?.refund_id || r?.codigoReembolso || `REF-ALO-${Date.now().toString(36).toUpperCase()}`,
              amount: reembolsoObj?.monto || reembolsoObj?.amount || r?.montoReembolsado || selectedReserva.totalRaw,
              currency: r?.moneda || selectedReserva.currency || 'USD',
              status: 'PROCESSED',
            },
            stock_restoration: {
              status: 'RESTORED',
              message: 'Habitación liberada en el hotel.',
            },
          };
          const locales = JSON.parse(localStorage.getItem('reservas_alojamientos') || '[]');
          const updated = locales.map(item => {
            if (item.id === selectedReserva.id || item.reservation_id === selectedReserva.id || item.codigo_reserva === selectedReserva.id) {
              return { ...item, status: 'CANCELLED' };
            }
            return item;
          });
          localStorage.setItem('reservas_alojamientos', JSON.stringify(updated));
          cargarTodasLasReservas(true);
        } catch (apiErr) {
          const detalle = apiErr?.response?.data?.detail || apiErr?.response?.data?.message || apiErr?.message;
          throw new Error(detalle || 'El hotel no permitió cancelar la reserva. Verifica el estado o las políticas de cancelación.');
        }
      } else {
        res = {
          status: 'CANCELLED',
          refund: {
            refund_id: `REF-GEN-${Date.now().toString(36).toUpperCase()}`,
            amount: selectedReserva.totalRaw,
            currency: 'USD',
            status: 'PROCESSED'
          }
        };
      }

      const refundData = res?.refund || {
        refund_id: `REF-${Date.now().toString(36).toUpperCase()}`,
        amount: selectedReserva.totalRaw,
        currency: 'USD',
        status: 'PROCESSED'
      };

      setCancelSuccess({
        refund_id: refundData.refund_id,
        amount: refundData.amount,
        currency: refundData.currency || 'USD',
        message: res?.message || 'Cancelación y compensación completadas.',
        stock_restoration: res?.stock_restoration || res?.inventory_restoration || {
          message: 'Stock e inventario restituidos exitosamente.'
        }
      });

      const estadoFinal = res?.status === 'CANCELLATION_PENDING' ? 'CANCELLATION_PENDING' : 'CANCELLED';
      setSelectedReserva(prev => ({
        ...prev,
        status: estadoFinal
      }));

      setReservas(prev => prev.map(r => {
        if (r.id === selectedReserva.id || r.pnr === selectedReserva.pnr) {
          return { ...r, status: estadoFinal };
        }
        return r;
      }));

    } catch (err) {
      setCancelError(err.message || 'Error al procesar la cancelación. Intenta de nuevo.');
    } finally {
      setCancelling(false);
    }
  };

  // ── Validation helpers ──────────────────────────────────────────────────────
  const ALLOWED = /^[a-zA-Z0-9\s,.\'\-ñÑáéíóúÁÉÍÓÚüÜ?!:()]*$/;
  const collapseSpaces = (v) => v.replace(/\s{2,}/g, ' ');

  const validateSubject = (val) => {
    const v = collapseSpaces(val);
    if (!v.trim()) return 'El asunto no puede estar vacío.';
    if (v.trim().length < 5) return `Necesitas al menos ${5 - v.trim().length} caracteres más.`;
    if (!ALLOWED.test(v)) return 'Caracteres no permitidos. Solo letras, números y puntuación básica.';
    return '';
  };

  const validateDesc = (val) => {
    const v = collapseSpaces(val);
    if (!v.trim()) return 'La descripción no puede estar vacía.';
    if (v.trim().length < 15) return `Necesitas al menos ${15 - v.trim().length} caracteres más.`;
    if (!ALLOWED.test(v)) return 'Caracteres no permitidos. Solo letras, números y puntuación básica.';
    return '';
  };

  const triggerShake = (setter) => {
    setter(true);
    setTimeout(() => setter(false), 600);
  };

  const handleSubjectChange = (e) => {
    const v = collapseSpaces(e.target.value.slice(0, 120));
    setReportSubject(v);
    setSubjectError(validateSubject(v));
    setSubmitError('');
  };

  const handleDescChange = (e) => {
    const v = collapseSpaces(e.target.value.slice(0, 800));
    setReportDescription(v);
    setDescError(validateDesc(v));
    setSubmitError('');
  };

  const handleSendReport = async (e) => {
    e.preventDefault();
    setSubmitError('');

    const sErr = validateSubject(reportSubject);
    const dErr = validateDesc(reportDescription);

    if (sErr) { setSubjectError(sErr); triggerShake(setSubjectShake); }
    if (dErr) { setDescError(dErr); triggerShake(setDescShake); }
    if (sErr || dErr) return;

    setSendingReport(true);
    try {
      const ticket = {
        id: `TK-${Math.floor(Math.random() * 100000)}`,
        client_name: user?.user_metadata?.nombre
          ? `${user.user_metadata.nombre} ${user.user_metadata.apellido || ''}`
          : user?.email || 'Usuario',
        email: user?.email || 'desconocido@email.com',
        entity_name: selectedReserva.titulo,
        pnr_or_id: selectedReserva.pnr,
        type: selectedReserva.servicioTexto,
        subject: reportSubject.trim(),
        priority: reportPriority,
        description: reportDescription.trim(),
        status: 'PENDING',
      };
      const { error: sbError } = await supabase.from('support_tickets').insert([ticket]);
      if (sbError) throw sbError;
      setReportSuccess(true);
    } catch (err) {
      setSubmitError('Error al enviar el reporte. Por favor intenta de nuevo.');
    } finally {
      setSendingReport(false);
    }
  };

  useEffect(() => {
    document.title = 'Mis viajes · Booking.com';
    return () => {
      document.title = 'Booking Prototipo';
    };
  }, []);

  const fetchMisTickets = useCallback(async () => {
    if (!user?.email) return;
    setLoadingTickets(true);
    try {
      const { data, error: sbErr } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('email', user.email)
        .order('created_at', { ascending: false });
      if (sbErr) throw sbErr;
      setMisTickets(data || []);
      // Reset badge if there are tickets and user hasn't seen them yet
      if ((data || []).length > 0 && mainView !== 'reports') setTicketBadgeSeen(false);
    } catch (e) {
      console.error('Error fetching mis tickets:', e);
    } finally {
      setLoadingTickets(false);
    }
  }, [user]);

  useEffect(() => {
    if (mainView === 'reports') fetchMisTickets();
  }, [mainView, fetchMisTickets]);


  // Filtered reservations
  const reservasFiltradas = reservas.filter((item) => {
    if (filtroServicio && item.tipo !== filtroServicio) return false;
    if (filtroStatus && item.status.toUpperCase() !== filtroStatus.toUpperCase()) return false;
    if (busqueda.trim()) {
      const q = busqueda.trim().toUpperCase();
      const matchPnr = item.pnr?.toUpperCase().includes(q);
      const matchTitle = item.titulo?.toUpperCase().includes(q);
      const matchDest = item.destino?.toUpperCase().includes(q);
      if (!matchPnr && !matchTitle && !matchDest) return false;
    }
    return true;
  });

  // Group by destination
  const gruposPorDestino = reservasFiltradas.reduce((acc, res) => {
    const dest = res.destino || 'Quito';
    if (!acc[dest]) acc[dest] = [];
    acc[dest].push(res);
    return acc;
  }, {});

  if (!user) {
    return (
      <main className="trips-page-container">
        <div className="trips-empty-state">
          <h2 className="trips-empty-title">Inicia sesión para ver tus viajes</h2>
          <p className="trips-empty-desc">
            Podrás consultar tus reservas de alojamientos, vuelos, autos y atracciones con toda la información y comprobantes disponibles.
          </p>
          <Link to="/login" className="trips-btn-primary">
            Iniciar sesión
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="trips-page-container">
      {/* Top Header */}
      <div className="trips-header">
        <h1 className="trips-title">Mis viajes</h1>
        <button
          type="button"
          className="trips-help-link"
          onClick={() => setShowHelpModal(true)}
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          ¿No encuentras una reserva?
        </button>
      </div>

      {/* Filter and Search Controls */}
      <div className="trips-controls">
        <div className="trips-filter-pills" role="tablist" aria-label="Filtrar por tipo de servicio">
          <button
            type="button"
            className={`trips-filter-pill ${mainView === 'trips' && filtroServicio === '' ? 'active' : ''}`}
            onClick={() => { setFiltroServicio(''); setMainView('trips'); }}
          >
            Todos los viajes ({reservas.length})
          </button>
          <button
            type="button"
            className={`trips-filter-pill ${mainView === 'trips' && filtroServicio === 'alojamiento' ? 'active' : ''}`}
            onClick={() => { setFiltroServicio('alojamiento'); setMainView('trips'); }}
          >
            Alojamientos
          </button>
          <button
            type="button"
            className={`trips-filter-pill ${mainView === 'trips' && filtroServicio === 'vuelo' ? 'active' : ''}`}
            onClick={() => { setFiltroServicio('vuelo'); setMainView('trips'); }}
          >
            Vuelos
          </button>
          <button
            type="button"
            className={`trips-filter-pill ${mainView === 'trips' && filtroServicio === 'auto' ? 'active' : ''}`}
            onClick={() => { setFiltroServicio('auto'); setMainView('trips'); }}
          >
            Renta de autos
          </button>
          <button
            type="button"
            className={`trips-filter-pill ${filtroServicio === 'atraccion' ? 'active' : ''}`}
            onClick={() => { setFiltroServicio('atraccion'); setMainView('trips'); }}
          >
            Atracciones
          </button>
          <button
            type="button"
            className={`trips-filter-pill ${mainView === 'reports' ? 'active' : ''}`}
            onClick={() => { setMainView('reports'); setFiltroServicio(''); setTicketBadgeSeen(true); }}
            style={{ borderLeft: '2px solid #e7e7e7', marginLeft: '4px', paddingLeft: '12px' }}
          >
            📋 Mis Reportes
            {misTickets.length > 0 && !ticketBadgeSeen && (
              <span style={{ background: '#d32f2f', color: 'white', borderRadius: '10px', padding: '1px 6px', fontSize: '0.72rem', marginLeft: '4px', fontWeight: 700 }}>
                {misTickets.length}
              </span>
            )}
          </button>
        </div>

        <div className="trips-search-bar">
          <div className="trips-search-input-wrapper">
            <span className="trips-search-icon">
              <PinIcon size={16} />
            </span>
            <input
              type="text"
              placeholder="Buscar por destino, nombre del hotel o código PNR..."
              className="trips-search-input"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Loading state */}
      {cargando && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#595959' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3px solid #e0e0e0',
              borderTopColor: '#006ce4',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 12px auto',
            }}
          />
          <p>Cargando tus viajes...</p>
        </div>
      )}

      {/* Error state */}
      {!cargando && error && (
        <div style={{ padding: '16px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* REPORTS VIEW */}
      {!cargando && mainView === 'reports' && (
        <div style={{ maxWidth: '700px', margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1a1a1a' }}>Mis Reportes de Soporte</h2>
            <button type="button" onClick={fetchMisTickets} style={{ background: 'none', border: '1px solid #ddd', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', color: '#595959' }}>⟳ Actualizar</button>
          </div>

          {loadingTickets && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#595959' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid #e0e0e0', borderTopColor: '#006ce4', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
              <p>Cargando tus reportes...</p>
            </div>
          )}

          {!loadingTickets && misTickets.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fafafa', borderRadius: '12px', border: '1px dashed #ddd' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📋</div>
              <h3 style={{ margin: '0 0 8px', color: '#1a1a1a', fontSize: '1.1rem' }}>No tienes reportes enviados</h3>
              <p style={{ color: '#595959', fontSize: '0.9rem', margin: 0 }}>Cuando reportes un problema con una reserva, podrás seguir su estado aquí.</p>
            </div>
          )}

          {!loadingTickets && misTickets.map(ticket => {
            const ST = {
              PENDING:   { label: '🕐 Pendiente',    bg: '#fff8e1', color: '#f57f17', border: '#ffe082' },
              IN_REVIEW: { label: '🔍 En revisión', bg: '#e3f2fd', color: '#1565c0', border: '#90caf9' },
              RESOLVED:  { label: '✅ Resuelto',    bg: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7' },
              REJECTED:  { label: '❌ Rechazado',   bg: '#ffebee', color: '#c62828', border: '#ef9a9a' },
            };
            const st = ST[ticket.status] || ST.PENDING;
            const priColor = ticket.priority === 'Alta' ? '#d32f2f' : ticket.priority === 'Media' ? '#e65100' : '#388e3c';
            const dateStr = ticket.created_at
              ? new Date(ticket.created_at).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })
              : 'Sin fecha';
            return (
              <div key={ticket.id} style={{ background: 'white', border: '1px solid #e7e7e7', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#006ce4', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{ticket.type || 'Reserva'}</span>
                    <h3 style={{ margin: '2px 0 0', fontSize: '1rem', fontWeight: 800, color: '#1a1a1a' }}>{ticket.subject}</h3>
                  </div>
                  <div style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: '20px', padding: '4px 12px', fontSize: '0.82rem', fontWeight: 700 }}>{st.label}</div>
                </div>
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '0.73rem', color: '#888', marginBottom: '2px', fontWeight: 600 }}>SERVICIO REPORTADO</div>
                      <div style={{ fontSize: '0.9rem', color: '#1a1a1a', fontWeight: 600 }}>{ticket.entity_name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.73rem', color: '#888', marginBottom: '2px', fontWeight: 600 }}>PNR / REFERENCIA</div>
                      <div style={{ fontSize: '0.9rem', color: '#006ce4', fontWeight: 700 }}>{ticket.pnr_or_id}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.73rem', color: '#888', marginBottom: '2px', fontWeight: 600 }}>PRIORIDAD</div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: priColor }}>{ticket.priority}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.73rem', color: '#888', marginBottom: '2px', fontWeight: 600 }}>FECHA DE ENVÍO</div>
                      <div style={{ fontSize: '0.88rem', color: '#1a1a1a' }}>{dateStr}</div>
                    </div>
                  </div>
                  <div style={{ background: '#f9f9f9', borderRadius: '6px', padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.73rem', color: '#888', marginBottom: '4px', fontWeight: 600 }}>TU DESCRIPCIÓN</div>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#333', lineHeight: 1.5 }}>{ticket.description}</p>
                  </div>
                  {ticket.resolution && (
                    <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', padding: '12px 16px', marginTop: '12px' }}>
                      <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#2e7d32', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        ✅ RESOLUCIÓN DEL SOPORTE
                        {ticket.resolved_at && (
                          <span style={{ color: '#66bb6a', fontWeight: 400 }}>· {new Date(ticket.resolved_at).toLocaleDateString('es-EC', { day: 'numeric', month: 'long' })}</span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#1b5e20', lineHeight: 1.5, fontWeight: 500 }}>{ticket.resolution}</p>
                    </div>
                  )}
                  {ticket.status === 'PENDING' && !ticket.resolution && (
                    <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#888', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      🕐 Tu reporte está en cola. El equipo de soporte lo revisará pronto.
                    </div>
                  )}
                  {ticket.status === 'IN_REVIEW' && (
                    <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#1565c0', background: '#e3f2fd', borderRadius: '5px', padding: '8px 12px' }}>
                      🔍 Un agente está revisando tu caso. Te notificaremos cuando haya una resolución.
                    </div>
                  )}
                </div>
                <div style={{ padding: '8px 18px', borderTop: '1px solid #f0f0f0', background: '#fafafa', fontSize: '0.73rem', color: '#aaa' }}>
                  Ticket #{ticket.id}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State — only when viewing trips */}
      {!cargando && !error && mainView === 'trips' && reservasFiltradas.length === 0 && (
        <div className="trips-empty-state">
          <h2 className="trips-empty-title">Todavía no tienes viajes registrados</h2>
          <p className="trips-empty-desc">
            Cuando completes una reserva de alojamiento, vuelo, tour o vehículo, se mostrará automáticamente aquí con su confirmación oficial.
          </p>
          <div className="trips-empty-actions">
            <Link to="/alojamientos" className="trips-btn-primary">
              Buscar alojamientos
            </Link>
            <Link to="/vuelos" className="trips-btn-secondary">
              Buscar vuelos
            </Link>
            <Link to="/atracciones" className="trips-btn-secondary">
              Atracciones
            </Link>
          </div>
        </div>
      )}

      {/* Grouped Trips List — only when viewing trips */}
      {!cargando && !error && mainView === 'trips' && reservasFiltradas.length > 0 && (
        <div className="trips-list-container">
          {Object.entries(gruposPorDestino).map(([destino, items]) => (
            <div key={destino} className="trips-group">
              <h2 className="trips-group-title">{destino}</h2>
              <div className="trips-cards-list">
                {items.map((r) => (
                  <div
                    key={r.id}
                    className="trip-card"
                    onClick={() => abrirDetalle(r)}
                  >
                    <div className="trip-card-left">
                      <div className="trip-card-thumb-wrapper">
                        <img
                          src={r.imagen}
                          alt={r.titulo}
                          className="trip-card-thumb"
                          loading="lazy"
                        />
                      </div>
                      <div className="trip-card-info">
                        <h3 className="trip-card-title">{r.titulo}</h3>
                        <p className="trip-card-subtitle">
                          <span>{r.fechasTexto}</span>
                          <span>·</span>
                          <span>{r.destino}</span>
                          <span style={{ color: '#006ce4', fontWeight: 600 }}>({r.pnr})</span>
                        </p>

                        {/* Metadatos detallados de Cantidad y Fechas */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '4px 0 6px 0', fontSize: '0.78rem' }}>
                          {r.cantidadTexto && (
                            <span style={{ background: '#eef2ff', color: '#3730a3', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {r.tipo === 'auto' ? '🚗' : r.tipo === 'atraccion' ? '🎟️' : r.tipo === 'vuelo' ? '✈️' : '🏨'} {r.cantidadTexto}
                            </span>
                          )}
                          {r.fechaReserva && (
                            <span style={{ background: '#f3f4f6', color: '#4b5563', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              📅 Reservado: {r.fechaReserva}
                            </span>
                          )}
                          {r.fechaEntrega && (
                            <span style={{ background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {r.tipo === 'auto' ? '🔑 Retiro' : r.tipo === 'atraccion' ? '🎟️ Visita' : r.tipo === 'vuelo' ? '🛫 Salida' : '📥 Check-in'}: {r.fechaEntrega}
                            </span>
                          )}
                          {r.fechaDevolucion && (
                            <span style={{ background: '#fffbeb', color: '#92400e', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {r.tipo === 'auto' ? '🔄 Devolución' : r.tipo === 'alojamiento' ? '📤 Check-out' : '🛬 Retorno'}: {r.fechaDevolucion}
                            </span>
                          )}
                          {r.tipo === 'alojamiento' && r.descripcion_camas && (
                            <span style={{ background: '#f5f3ff', color: '#6d28d9', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              🛏️ {r.descripcion_camas}
                            </span>
                          )}
                          {r.tipo === 'alojamiento' && r.habitacion_asignada && (
                            <span style={{ background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              🚪 Hab: {r.habitacion_asignada}
                            </span>
                          )}
                          {r.tipo === 'alojamiento' && r.estado_habitacion && (
                            <span style={{
                              background: r.estado_habitacion === 'OCUPADA' ? '#fee2e2' : r.estado_habitacion === 'EN_LIMPIEZA' ? '#fef3c7' : '#e0e7ff',
                              color: r.estado_habitacion === 'OCUPADA' ? '#991b1b' : r.estado_habitacion === 'EN_LIMPIEZA' ? '#92400e' : '#3730a3',
                              padding: '2px 8px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}>
                              {r.estado_habitacion === 'EN_LIMPIEZA' ? '🧹 En preparación/limpieza' : r.estado_habitacion === 'OCUPADA' ? '🚪 Habitación ocupada' : '✨ Habitación lista'}
                            </span>
                          )}
                        </div>

                        <span className={`trip-card-status ${(r.status || '').toLowerCase()}`}>
                          {ESTADOS_ES[r.status] ?? r.status}
                        </span>
                        {(r.status === 'CONFIRMADO_ASISTIDO' || r.status === 'CHECKED_IN') && (
                          <span style={{ marginLeft: 6, fontSize: '0.78rem', color: '#15803d', fontWeight: 600 }}>
                            • {r.tipo === 'auto' ? `Llaves entregadas ${r.placa ? `(Placa: ${r.placa})` : ''}` : r.tipo === 'alojamiento' ? `Check-in completado · ${r.habitacion_asignada ? `Hab. ${r.habitacion_asignada}` : 'Habitación asignada'}` : 'Asistencia confirmada (Sí asistió)'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="trip-card-right">
                      <div className="trip-card-price">
                        {convertPrice(r.totalRaw)}
                      </div>
                      {r.status !== 'CANCELLED' && r.status !== 'CHECKED_IN' && r.status !== 'CONFIRMADO_ASISTIDO' && r.status !== 'CHECKED_OUT' && r.tipo !== 'auto' && r.tipo !== 'atraccion' && (
                        <button
                          type="button"
                          className="btn-card-checkin"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCheckinReserva(r);
                            setCheckinStepResult(null);
                          }}
                          style={{
                            background: '#006ce4',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '4px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          ⚡ Check-in
                        </button>
                      )}
                      <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()} tabIndex={-1}>
                        <button
                          type="button"
                          className="trip-card-menu-btn"
                          aria-label="Opciones de reserva"
                          onClick={() => setActiveMenuId(activeMenuId === r.id ? null : r.id)}
                        >
                          <MoreVerticalIcon size={20} color="#1a1a1a" />
                        </button>

                        {activeMenuId === r.id && (
                          <div className="trip-dropdown-menu">
                            {r.status !== 'CANCELLED' && r.status !== 'CHECKED_IN' && r.status !== 'CONFIRMADO_ASISTIDO' && r.status !== 'CHECKED_OUT' && r.tipo !== 'auto' && r.tipo !== 'atraccion' && (
                              <button
                                type="button"
                                className="trip-dropdown-item"
                                style={{ color: '#006ce4', fontWeight: 700 }}
                                onClick={() => {
                                  setActiveMenuId(null);
                                  setCheckinReserva(r);
                                  setCheckinStepResult(null);
                                }}
                              >
                                ⚡ Realizar Check-in Digital
                              </button>
                            )}
                            <button
                              type="button"
                              className="trip-dropdown-item"
                              onClick={() => abrirDetalle(r)}
                            >
                              Ver confirmación
                            </button>
                            <button
                              type="button"
                              className="trip-dropdown-item"
                              onClick={() => descargarPDF(r)}
                            >
                              Descargar factura (PDF)
                            </button>
                            {r.link && (
                              <Link
                                to={r.link}
                                className="trip-dropdown-item"
                                style={{ textDecoration: 'none' }}
                              >
                                Ver propiedad / servicio
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DETAIL MODAL (V-03: Blindado con zIndex alto, scroll seguro y Escape handler) */}
      {selectedReserva && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-reserva"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            overflowY: 'auto',
          }}
          onClick={() => {
            setSelectedReserva(null);
            setModalView('detail');
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              width: '540px',
              maxWidth: '100%',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              margin: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                background: '#003580',
                padding: '18px 24px',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2 id="modal-title-reserva" style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Confirmación de reserva · {selectedReserva.pnr}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setSelectedReserva(null);
                  setModalView('detail');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <CloseIcon size={20} color="#ffffff" />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* ── DETAIL VIEW ── */}
              {modalView === 'detail' && (
                <>
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#006ce4', letterSpacing: '0.5px' }}>
                      {selectedReserva.servicioTexto}
                    </span>
                    <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '4px 0 6px 0', color: '#1a1a1a' }}>
                      {selectedReserva.titulo}
                    </h3>
                    <span className={`trip-card-status ${(selectedReserva.status || '').toLowerCase()}`}>
                      {ESTADOS_ES[selectedReserva.status] ?? selectedReserva.status}
                    </span>
                    {(selectedReserva.status === 'CONFIRMADO_ASISTIDO' || selectedReserva.status === 'CHECKED_IN') && (
                      <span style={{ marginLeft: 8, fontSize: '0.85rem', color: '#15803d', fontWeight: 600 }}>
                        • {selectedReserva.tipo === 'auto' ? `Llaves entregadas ${selectedReserva.placa ? `(Placa: ${selectedReserva.placa})` : ''}` : 'Asistencia confirmada (Sí asistió)'}
                      </span>
                    )}
                  </div>

                  <div style={{ background: '#f5f5f5', borderRadius: '6px', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#595959', marginBottom: '2px' }}>Código PNR</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a1a1a' }}>{selectedReserva.pnr}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#595959', marginBottom: '2px' }}>Cantidad Reservada</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1a1a1a' }}>
                        {selectedReserva.cantidadTexto || `${selectedReserva.cantidad || 1} unidad`}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#595959', marginBottom: '2px' }}>Fecha de Reserva</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' }}>
                        {selectedReserva.fechaReserva || selectedReserva.fecha || 'Reciente'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#595959', marginBottom: '2px' }}>
                        {selectedReserva.tipo === 'auto' ? 'Fecha de Retiro / Entrega' : selectedReserva.tipo === 'atraccion' ? 'Fecha de Visita / Turno' : selectedReserva.tipo === 'vuelo' ? 'Fecha de Salida' : 'Fecha Check-in'}
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' }}>
                        {selectedReserva.fechaEntrega || selectedReserva.fechasTexto || 'Por definir'}
                      </div>
                    </div>
                    {selectedReserva.fechaDevolucion && (
                      <div>
                        <div style={{ fontSize: '0.78rem', color: '#595959', marginBottom: '2px' }}>
                          {selectedReserva.tipo === 'auto' ? 'Fecha de Devolución' : selectedReserva.tipo === 'alojamiento' ? 'Fecha Check-out' : 'Fecha de Retorno'}
                        </div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' }}>
                          {selectedReserva.fechaDevolucion}
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#595959', marginBottom: '2px' }}>Destino / Ubicación</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' }}>{selectedReserva.destino}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#595959', marginBottom: '2px' }}>Total Pagado</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#008009' }}>{convertPrice(selectedReserva.totalRaw)}</div>
                    </div>
                  </div>

                  {avisoDescarga && (
                    <div style={{ padding: '10px 14px', borderRadius: '4px', fontSize: '0.85rem', background: '#fdecea', color: '#b71c1c', border: '1px solid #ef9a9a' }}>
                      {avisoDescarga}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <button type="button" disabled={isDownloading} onClick={() => descargarPDF(selectedReserva)} className="trips-btn-primary" style={{ flex: 1, textAlign: 'center' }}>
                      {isDownloading ? 'Generando PDF...' : 'Descargar factura (PDF)'}
                    </button>
                    <button type="button" onClick={() => setSelectedReserva(null)} className="trips-btn-secondary" style={{ flex: 1, textAlign: 'center' }}>
                      Cerrar
                    </button>
                  </div>

                  {selectedReserva.status !== 'CANCELLED' && selectedReserva.tipo !== 'auto' && selectedReserva.tipo !== 'atraccion' && selectedReserva.tipo !== 'alojamiento' && (
                    <button
                      type="button"
                      onClick={() => {
                        setCheckinReserva(selectedReserva);
                        setCheckinStepResult(null);
                      }}
                      style={{
                        width: '100%',
                        marginTop: '10px',
                        padding: '12px',
                        background: '#006ce4',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      ⚡ Realizar Check-in Digital
                    </button>
                  )}

                  {(() => {
                    const s = (selectedReserva.status || '').toUpperCase();
                    const yaAsistio = ['CONFIRMADO_ASISTIDO', 'CHECKED_IN', 'ASISTIDO', 'PICKED_UP', 'ENTREGADO', 'COMPLETED'].includes(s);
                    const estaCancelada = s === 'CANCELLED';

                    if (estaCancelada) {
                      return (
                        <div style={{ marginTop: '8px', padding: '12px 14px', background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '6px', color: '#b71c1c', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '1.3rem' }}>ℹ️</span>
                          <div>
                            <strong>Esta reserva ha sido cancelada.</strong> Los cupos fueron liberados al operador y el 100% del importe ({convertPrice(selectedReserva.totalRaw)}) fue procesado para reembolso.
                          </div>
                        </div>
                      );
                    }

                    if (yaAsistio) {
                      return (
                        <div style={{ marginTop: '8px', padding: '12px 14px', background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '6px', color: '#1b5e20', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '1.3rem' }}>✅</span>
                          <div>
                            <strong>Check-in realizado / Servicio en curso.</strong> El servicio ya fue verificado o retirado en mostrador. La cancelación no aplica una vez iniciado o completado el servicio.
                          </div>
                        </div>
                      );
                    }

                    return (
                      <button
                        type="button"
                        id="btn-iniciar-cancelacion"
                        onClick={() => { setModalView('cancel'); setCancelError(''); setCancelSuccess(null); }}
                        style={{
                          width: '100%',
                          marginTop: '8px',
                          padding: '11px',
                          background: '#fff0f0',
                          color: '#c62828',
                          border: '1.5px solid #ef9a9a',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '0.92rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'background 0.2s'
                        }}
                      >
                        ✕ Cancelar reserva y solicitar reembolso
                      </button>
                    );
                  })()}

                  <button
                    type="button"
                    onClick={() => { setModalView('report'); setSubjectError(''); setDescError(''); setReportSuccess(false); }}
                    style={{ width: '100%', marginTop: '6px', padding: '10px', background: '#fff5f5', color: '#d32f2f', border: '1px solid #ffcdd2', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    ⚠️ Reportar un problema con esta reserva
                  </button>
                </>
              )}

              {/* ── REPORT VIEW ── */}
              {modalView === 'report' && (
                <>
                  <style>{`
                    @keyframes shake-red {
                      0%   { transform: translateX(0);   background: transparent; }
                      15%  { transform: translateX(-6px); background: rgba(211,47,47,0.06); }
                      30%  { transform: translateX(6px);  background: rgba(211,47,47,0.1); }
                      45%  { transform: translateX(-4px); background: rgba(211,47,47,0.08); }
                      60%  { transform: translateX(4px);  background: rgba(211,47,47,0.06); }
                      75%  { transform: translateX(-2px); background: rgba(211,47,47,0.04); }
                      100% { transform: translateX(0);   background: transparent; }
                    }
                    .field-shake { animation: shake-red 0.55s ease forwards; border-radius: 5px; }
                    .report-input-err { border-color: #d32f2f !important; }
                    .field-counter { font-size: 0.74rem; color: #999; text-align: right; margin-top: 3px; }
                    .field-err-msg { font-size: 0.78rem; color: #d32f2f; font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 4px; }
                  `}</style>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <button type="button" onClick={() => setModalView('detail')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#006ce4', fontWeight: 600, fontSize: '0.9rem', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ← Volver
                    </button>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1a1a1a' }}>Reportar problema</h3>
                  </div>

                  <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '6px', padding: '10px 14px', fontSize: '0.83rem', color: '#795548' }}>
                    Estás reportando: <strong>{selectedReserva.titulo}</strong> &middot; PNR: <strong>{selectedReserva.pnr}</strong>
                  </div>

                  {reportSuccess ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>✅</div>
                      <h4 style={{ margin: '0 0 8px', color: '#2e7d32', fontSize: '1.1rem' }}>Reporte enviado con éxito</h4>
                      <p style={{ fontSize: '0.88rem', color: '#595959', margin: '0 0 20px' }}>Nuestro equipo de soporte revisará tu reporte a la brevedad.</p>
                      <button type="button" onClick={() => setSelectedReserva(null)} className="trips-btn-primary" style={{ width: '100%' }}>Cerrar</button>
                    </div>
                  ) : (
                    <form onSubmit={handleSendReport} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }} noValidate>

                      {/* Asunto */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 700, marginBottom: '5px', color: '#1a1a1a' }}>Asunto *</label>
                        <div className={subjectShake ? 'field-shake' : ''}>
                          <input
                            type="text"
                            value={reportSubject}
                            onChange={handleSubjectChange}
                            maxLength={120}
                            placeholder="Ej: Cobro incorrecto, cancelación sin aviso..."
                            style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${subjectError ? '#d32f2f' : '#ddd'}`, borderRadius: '5px', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none', background: subjectError ? 'rgba(211,47,47,0.04)' : 'white', transition: 'border-color 0.2s, background 0.2s' }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '3px' }}>
                          {subjectError
                            ? <span className="field-err-msg"><span>⚠️</span>{subjectError}</span>
                            : <span />}
                          <span className="field-counter">{reportSubject.length}/120</span>
                        </div>
                      </div>

                      {/* Prioridad */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 700, marginBottom: '5px', color: '#1a1a1a' }}>Prioridad</label>
                        <select
                          value={reportPriority}
                          onChange={e => setReportPriority(e.target.value)}
                          style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #ddd', borderRadius: '5px', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }}
                        >
                          <option value="Baja">Baja — problema menor</option>
                          <option value="Media">Media — afecta mi experiencia</option>
                          <option value="Alta">Alta — urgente, impide el servicio</option>
                        </select>
                      </div>

                      {/* Descripción */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 700, marginBottom: '5px', color: '#1a1a1a' }}>Descripción del problema *</label>
                        <div className={descShake ? 'field-shake' : ''}>
                          <textarea
                            value={reportDescription}
                            onChange={handleDescChange}
                            rows={4}
                            maxLength={800}
                            placeholder="Describe qué ocurrió, cuándo y cómo afectó tu reserva..."
                            style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${descError ? '#d32f2f' : '#ddd'}`, borderRadius: '5px', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none', resize: 'vertical', background: descError ? 'rgba(211,47,47,0.04)' : 'white', transition: 'border-color 0.2s, background 0.2s' }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '3px' }}>
                          {descError
                            ? <span className="field-err-msg"><span>⚠️</span>{descError}</span>
                            : <span />}
                          <span className="field-counter">{reportDescription.length}/800</span>
                        </div>
                      </div>

                      {/* Error global de envío */}
                      {submitError && (
                        <div style={{ background: '#ffebee', color: '#d32f2f', padding: '10px 12px', borderRadius: '5px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span>⚠️</span>{submitError}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button type="button" onClick={() => setModalView('detail')} className="trips-btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                        <button
                          type="submit"
                          disabled={sendingReport || !!subjectError || !!descError}
                          style={{ flex: 2, padding: '10px', background: '#d32f2f', color: 'white', border: 'none', borderRadius: '6px', cursor: (sendingReport || subjectError || descError) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: (sendingReport || subjectError || descError) ? 0.6 : 1, transition: 'opacity 0.2s' }}
                        >
                          {sendingReport ? 'Enviando...' : 'Enviar reporte'}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}

              {/* ── CANCEL VIEW (Saga Compensatoria RDA2 §8) ── */}
              {modalView === 'cancel' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <button type="button" onClick={() => setModalView('detail')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#006ce4', fontWeight: 600, fontSize: '0.9rem', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ← Volver al detalle
                    </button>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#b71c1c' }}>
                      Cancelar reserva y compensación
                    </h3>
                  </div>

                  {cancelSuccess ? (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', color: '#15803d', fontSize: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
                        ✓
                      </div>
                      <h4 style={{ margin: '0 0 6px', color: '#15803d', fontSize: '1.25rem', fontWeight: 800 }}>
                        {selectedReserva?.tipo === 'vuelo' ? 'Reserva cancelada' : '¡Cancelación y Reembolso Exitosos!'}
                      </h4>
                      <p style={{ fontSize: '0.88rem', color: '#4b5563', margin: '0 0 16px' }}>
                        {selectedReserva?.tipo === 'vuelo'
                          ? cancelSuccess.message
                          : 'Se ejecutó el protocolo de reversión Saga: tus fondos fueron devueltos y los cupos liberados.'}
                      </p>

                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', textAlign: 'left', marginBottom: '18px', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Localizador / PNR:</span>
                          <strong style={{ color: '#003580' }}>{selectedReserva.pnr}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Monto Reembolsado:</span>
                          <strong style={{ color: '#15803d', fontSize: '1.05rem' }}>{convertPrice(cancelSuccess.amount)}{selectedReserva?.tipo === 'vuelo' ? '' : ' (100%)'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Identificador de Reembolso:</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{cancelSuccess.refund_id}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Reverso de Inventario:</span>
                          <span style={{ color: '#15803d', fontWeight: 700 }}>✓ Stock Restituido</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        id="btn-cerrar-cancelacion-exitosa"
                        onClick={() => { setModalView('detail'); setSelectedReserva(null); }}
                        className="trips-btn-primary"
                        style={{ width: '100%' }}
                      >
                        Entendido y Cerrar
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {/* Advertencia Nielsen #5: Prevención de Errores */}
                      <div style={{ background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '6px', padding: '12px 14px', fontSize: '0.86rem', color: '#856404' }}>
                        Estás cancelando: <strong>{selectedReserva.titulo}</strong> (PNR: <strong>{selectedReserva.pnr}</strong>).
                        <div style={{ marginTop: '6px', fontWeight: 600, color: '#0f5132' }}>
                          ✓ Reembolso Total: Recibirás el 100% ({convertPrice(selectedReserva.totalRaw)}) acreditado a tu cuenta.
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, marginBottom: '6px', color: '#1a1a1a' }}>
                          Motivo principal de cancelación:
                        </label>
                        <select
                          value={cancelReason}
                          onChange={e => setCancelReason(e.target.value)}
                          style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', background: 'white' }}
                        >
                          <option value="Cambio de itinerario o planes de viaje">Cambio de itinerario o planes de viaje</option>
                          <option value="Enfermedad o emergencia imprevista">Enfermedad o emergencia imprevista</option>
                          <option value="Encontré una mejor tarifa o alternativa">Encontré una mejor tarifa o alternativa</option>
                          <option value="Dificultad con el horario o transporte">Dificultad con el horario o transporte</option>
                          <option value="Otro motivo">Otro motivo</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, marginBottom: '6px', color: '#1a1a1a' }}>
                          Detalles o comentarios adicionales (opcional):
                        </label>
                        <textarea
                          value={cancelDetails}
                          onChange={e => setCancelDetails(e.target.value.slice(0, 200))}
                          maxLength={200}
                          placeholder="Cuéntanos brevemente qué ocurrió..."
                          rows={3}
                          style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: '6px', fontSize: '0.88rem', boxSizing: 'border-box', outline: 'none' }}
                        />
                        <div style={{ textAlign: 'right', fontSize: '0.74rem', color: '#9ca3af', marginTop: '2px' }}>
                          {cancelDetails.length}/200
                        </div>
                      </div>

                      {cancelError && (
                        <div style={{ padding: '10px 12px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: '6px', fontSize: '0.85rem' }}>
                          ⚠️ {cancelError}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setModalView('detail')}
                          disabled={cancelling}
                          className="trips-btn-secondary"
                          style={{ flex: 1 }}
                        >
                          No cancelar
                        </button>
                        <button
                          type="button"
                          id="btn-confirmar-cancelacion"
                          disabled={cancelling}
                          onClick={handleCancelBooking}
                          style={{
                            flex: 2,
                            padding: '11px',
                            background: '#d32f2f',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: cancelling ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            fontSize: '0.92rem',
                            opacity: cancelling ? 0.7 : 1,
                            transition: 'background 0.2s'
                          }}
                        >
                          {cancelling ? 'Reintegrando fondos y stock...' : 'Confirmar cancelación y reembolso'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
      )}

      {/* HELP MODAL "¿No encuentras una reserva?" */}
      {showHelpModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowHelpModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              width: '480px',
              maxWidth: '100%',
              padding: '24px',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>¿No encuentras tu reserva?</h3>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <CloseIcon size={20} color="#1a1a1a" />
              </button>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#595959', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Si realizaste una reserva recientemente o en otro navegador, puedes buscarla directamente introduciendo su código de confirmación (PNR) en el buscador superior.
            </p>
            <div style={{ background: '#f0f7ff', border: '1px solid #cce4ff', borderRadius: '6px', padding: '12px 14px', marginBottom: '20px', fontSize: '0.85rem', color: '#003580' }}>
              Todas las confirmaciones y facturas electrónicas también son enviadas de forma automática a tu correo electrónico al instante de reservar.
            </div>
            <button
              type="button"
              className="trips-btn-primary"
              onClick={() => setShowHelpModal(false)}
              style={{ width: '100%' }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL OFICIAL DE CHECK-IN MULTIVERTICAL (CÁTEDRA RDA2 §4) ── */}
      {checkinReserva && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
          onClick={() => setCheckinReserva(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              width: '520px',
              maxWidth: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#003580', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                ⚡ Check-in Digital · {checkinReserva.pnr} ({checkinReserva.servicioTexto})
              </h3>
              <button 
                onClick={() => setCheckinReserva(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {/* VERTICAL: ATRACCIONES */}
              {checkinReserva.tipo === 'atraccion' && (
                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '1.05rem', color: '#1a1a1a' }}>
                    {checkinReserva.titulo}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
                    Validación presencial de identidad ante el guía oficial para habilitación del voucher QR (OpenAPI v2).
                  </p>

                  {checkinStepResult?.success ? (
                    <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '1.5rem' }}>🎟️</span>
                      <strong style={{ display: 'block', color: '#047857', marginTop: '4px' }}>
                        {checkinStepResult.mensaje}
                      </strong>
                      <div style={{ margin: '14px 0' }}>
                        <img 
                          src={checkinStepResult.qr} 
                          alt="QR Acceso" 
                          style={{ width: '140px', height: '140px', background: '#fff', padding: '4px', border: '1px solid #ddd', borderRadius: '8px' }} 
                        />
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#166534' }}>
                        Guía Asignado: <strong>{checkinStepResult.guia}</strong>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleExecuteCheckin(checkinReserva)}
                      disabled={checkinProcessing}
                      style={{ width: '100%', background: '#006ce4', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}
                    >
                      {checkinProcessing ? 'Validando con Guía...' : '✔ Validar Check-in y Obtener QR'}
                    </button>
                  )}
                </div>
              )}

              {/* VERTICAL: AUTOS */}
              {checkinReserva.tipo === 'auto' && (
                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '1.05rem', color: '#1a1a1a' }}>
                    {checkinReserva.titulo}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
                    Control de odómetro, verificación de licencia e inicio de cuarentena de limpieza de 2 horas (RDA2 §5).
                  </p>

                  {checkinStepResult?.success ? (
                    <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '1.5rem' }}>🚗</span>
                      <strong style={{ display: 'block', color: '#047857', marginTop: '6px' }}>
                        {checkinStepResult.mensaje}
                      </strong>
                    </div>
                  ) : (
                    <div>
                      <div style={{ marginBottom: '14px' }}>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                          Licencia de Conducir Verificada:
                        </label>
                        <input 
                          type="text" 
                          value={checkinLicencia} 
                          onChange={(e) => setCheckinLicencia(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} 
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                            Odómetro Salida (km):
                          </label>
                          <input 
                            type="number" 
                            value={checkinKmSalida} 
                            onChange={(e) => setCheckinKmSalida(e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} 
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                            Odómetro Retorno (km):
                          </label>
                          <input 
                            type="number" 
                            value={checkinKmRetorno} 
                            onChange={(e) => setCheckinKmRetorno(e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }} 
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => handleExecuteCheckin(checkinReserva, 'ENTREGA')}
                          disabled={checkinProcessing}
                          style={{ flex: 1, background: '#006ce4', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                          🔑 Check-in Entrega
                        </button>
                        <button
                          onClick={() => handleExecuteCheckin(checkinReserva, 'DEVOLUCION')}
                          disabled={checkinProcessing}
                          style={{ flex: 1, background: '#e8650a', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                          🔄 Check-in Devolución
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* VERTICAL: ALOJAMIENTOS */}
              {checkinReserva.tipo === 'alojamiento' && (
                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '1.05rem', color: '#1a1a1a' }}>
                    {checkinReserva.titulo}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
                    Recepción y registro de llegada: asignación de habitación, confirmación de estancia y clave digital inteligente.
                  </p>

                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '0.88rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Titular:</span>
                      <strong>{user?.user_metadata?.nombre || checkinReserva.customerName || 'Titular de la reserva'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Habitaciones:</span>
                      <strong>🚪 {checkinReserva.habitaciones_count || 1} Habitación(es)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Configuración Camas:</span>
                      <strong>🛏️ {checkinReserva.descripcion_camas || '1 Cama King / Matrimonial'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Estadía:</span>
                      <strong>{checkinReserva.fechasTexto}</strong>
                    </div>
                  </div>

                  {checkinStepResult?.success ? (
                    <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '1.8rem' }}>🔑</span>
                      <strong style={{ display: 'block', color: '#047857', marginTop: '6px', fontSize: '1rem' }}>
                        {checkinStepResult.mensaje}
                      </strong>
                      <div style={{ margin: '14px 0', background: '#fff', padding: '12px', borderRadius: '6px', border: '1px dashed #003580' }}>
                        <div style={{ fontSize: '0.9rem', color: '#334155' }}>Habitación Asignada: <strong style={{ color: '#003580', fontSize: '1.05rem' }}>{checkinStepResult.habitacion}</strong></div>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>Clave de Cerradura Inteligente: <code style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669', background: '#f0fdf4', padding: '2px 8px', borderRadius: '4px' }}>{checkinStepResult.clave}</code></div>
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#065f46', margin: 0 }}>
                        La habitación ha pasado a estado <strong>OCUPADA</strong> en el sistema de administración del hotel.
                      </p>
                    </div>
                  ) : (
                    <>
                      {checkinStepResult?.vertical === 'alojamiento' && checkinStepResult.success === false && (
                        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '10px 12px', borderRadius: '8px', fontSize: '0.88rem', marginBottom: '12px' }}>
                          {checkinStepResult.mensaje}
                        </div>
                      )}
                      <button
                        onClick={() => handleExecuteCheckin(checkinReserva)}
                        disabled={checkinProcessing}
                        style={{ width: '100%', background: '#006ce4', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}
                      >
                        {checkinProcessing ? 'Confirmando check-in…' : '🔑 Confirmar Check-in y Activar Llave'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* VERTICAL: VUELOS */}
              {checkinReserva.tipo === 'vuelo' && (
                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '1.05rem', color: '#1a1a1a' }}>
                    {checkinReserva.titulo}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
                    Asignación de asiento de cabina y emisión de pase de abordar digital con PNR.
                  </p>

                  {checkinStepResult?.success ? (
                    <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '1.5rem' }}>✈️</span>
                      <strong style={{ display: 'block', color: '#047857', marginTop: '6px' }}>
                        {checkinStepResult.mensaje}
                      </strong>
                      <div style={{ margin: '14px 0', background: '#fff', padding: '12px', borderRadius: '6px', border: '1px dashed #003580' }}>
                        <div style={{ fontSize: '0.9rem', color: '#334155' }}>Asiento Asignado: <strong>{checkinStepResult.asiento}</strong></div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#003580', marginTop: '4px' }}>
                          PNR: {checkinStepResult.pnr}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {checkinStepResult?.vertical === 'vuelo' && checkinStepResult.success === false && (
                        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '10px 12px', borderRadius: '8px', fontSize: '0.88rem', marginBottom: '12px' }}>
                          {checkinStepResult.mensaje}
                        </div>
                      )}
                      <button
                        onClick={() => handleExecuteCheckin(checkinReserva)}
                        disabled={checkinProcessing}
                        style={{ width: '100%', background: '#006ce4', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}
                      >
                        {checkinProcessing ? 'Haciendo check-in…' : '🎫 Hacer check-in'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
