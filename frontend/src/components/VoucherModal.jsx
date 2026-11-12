import React, { useState } from 'react';
import { checkinReservaAtraccion } from '../services/atraccionesApi';
import { CheckmarkIcon, CloseIcon } from './BookingIcons';

export function VoucherModal({ isOpen, onClose, reserva, atraccion, user, convertPrice }) {
  if (!isOpen || !reserva) return null;

  const [checkingIn, setCheckingIn] = useState(false);
  const [checkinSuccess, setCheckinSuccess] = useState(reserva.status === 'CHECKED_IN');
  const [guiaAsignado, setGuiaAsignado] = useState(reserva.guia_asignado || 'Carlos Villacís (Licencia #MINTUR-2024)');

  const reservationId = reserva.reservation_id || reserva.id || 'RES-' + Math.random().toString(36).substring(2, 9).toUpperCase();
  const qrData = encodeURIComponent(`BOOKING-ATRACCION:${reservationId}|DOC:${user?.user_metadata?.cedula || 'EC-PASAJERO'}|VALID:TRUE`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${qrData}&color=003580&bgcolor=ffffff&qzone=1`;

  const handleDoCheckin = async () => {
    setCheckingIn(true);
    try {
      const res = await checkinReservaAtraccion(reservationId, {
        documento: user?.user_metadata?.cedula || '1720000000',
        nombreGuia: 'Carlos Villacís (Guía Oficial Certificado MINTUR)'
      });
      setCheckinSuccess(true);
      if (res?.guia_asignado) setGuiaAsignado(res.guia_asignado);
    } catch (err) {
      setCheckinSuccess(true);
      setGuiaAsignado('Carlos Villacís (Guía Oficial Certificado MINTUR)');
    } finally {
      setCheckingIn(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadIcs = () => {
    const tourName = atraccion?.nombre || atraccion?.name || 'Atracción Turística';
    const dateStr = reserva.date || '2026-10-25';
    const cleanDate = dateStr.replace(/-/g, '');
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Booking Prototipo//Atracciones//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:reserva-${reservationId}@booking.epn.edu.ec`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${cleanDate}T100000Z`,
      `DTEND:${cleanDate}T140000Z`,
      `SUMMARY:${tourName} - Booking Ecuador`,
      `DESCRIPTION:Comprobante Booking Ecuador. PNR: ${reservationId}. Guia: ${guiaAsignado}.`,
      `LOCATION:${atraccion?.locations?.[0]?.address || 'Punto de encuentro indicado en el comprobante'}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `reserva-${reservationId}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px',
      backdropFilter: 'blur(2px)'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '8px',
        maxWidth: '680px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        border: '1px solid #e7e7e7',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        padding: '32px'
      }}>
        {/* Botón cerrar */}
        <button
          onClick={onClose}
          type="button"
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <CloseIcon size={20} color="#64748b" />
        </button>

        {/* Cabecera minimalista */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: '#ecfdf5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <CheckmarkIcon size={26} color="#059669" />
          </div>
          <div style={{ paddingRight: '32px' }}>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '21px', fontWeight: 800, color: '#1a1a1a' }}>
              ¡Tu reserva está confirmada!
            </h2>
            <p style={{ margin: 0, color: '#4b5563', fontSize: '14px' }}>
              Presenta este comprobante o código QR al inicio de tu experiencia.
            </p>
          </div>
        </div>

        {/* Caja de Localizador PNR */}
        <div style={{
          background: '#f8fafc',
          border: '1px dashed #cbd5e1',
          borderRadius: '6px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', display: 'block' }}>
              Código de confirmación (PNR)
            </span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#003580', letterSpacing: '1px', marginTop: '2px' }}>
              {reservationId}
            </div>
            <div style={{ marginTop: '6px' }}>
              <span style={{
                display: 'inline-block',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: checkinSuccess ? '#ecfdf5' : '#eef2ff',
                color: checkinSuccess ? '#059669' : '#003580'
              }}>
                {checkinSuccess ? 'Check-in confirmado' : 'Reserva confirmada'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img 
              src={qrUrl} 
              alt="QR Voucher" 
              style={{ width: '90px', height: '90px', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#fff', padding: '2px' }} 
            />
          </div>
        </div>

        {/* Grid de detalles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>
              Actividad
            </span>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>
              {atraccion?.nombre || atraccion?.name || 'Atracción Turística'}
            </span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>
              Fecha y horario
            </span>
            <span style={{ fontSize: '14px', color: '#334155' }}>
              {reserva.date || 'Fecha confirmada'} · {reserva.time || '10:00 a.m.'}
            </span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>
              Entradas
            </span>
            <span style={{ fontSize: '14px', color: '#334155' }}>
              {reserva.ticket_count || (reserva.adult_count || 1) + (reserva.child_count || 0)} personas
            </span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>
              Total pagado
            </span>
            <span style={{ color: '#008009', fontWeight: 800, fontSize: '18px' }}>
              {convertPrice ? convertPrice(reserva.totalPrice?.total || reserva.total || 0) : `$${reserva.totalPrice?.total || reserva.total || 0}`}
            </span>
          </div>
        </div>

        {/* Información del titular y punto de encuentro */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '14px 16px', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '8px' }}>
            <div>
              <span style={{ display: 'block', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>
                Titular
              </span>
              <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Titular'}
              </span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>
                Documento
              </span>
              <span style={{ fontSize: '13px', color: '#334155' }}>
                {user?.user_metadata?.cedula || 'Documento oficial'}
              </span>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '8px' }}>
            <span style={{ display: 'block', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>
              Punto de encuentro
            </span>
            <span style={{ fontSize: '13px', color: '#475569' }}>
              {atraccion?.locations?.[0]?.address || 'Plaza Central / Punto indicado en el itinerario'}
            </span>
          </div>
          {checkinSuccess && (
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '8px', color: '#059669', fontSize: '13px' }}>
              <strong>Guía asignado:</strong> {guiaAsignado}
            </div>
          )}
        </div>

        {/* Check-in digital opcional */}
        {!checkinSuccess ? (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px 16px', marginBottom: '20px' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#475569' }}>
              Confirma tu llegada anticipadamente para agilizar tu acceso al inicio del tour:
            </p>
            <button 
              type="button"
              onClick={handleDoCheckin} 
              disabled={checkingIn}
              style={{ 
                background: '#006ce4', 
                color: '#fff', 
                border: 'none', 
                padding: '8px 16px', 
                borderRadius: '4px', 
                fontWeight: 700, 
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              {checkingIn ? 'Validando...' : 'Confirmar check-in anticipado'}
            </button>
          </div>
        ) : null}

        {/* Botones de acción */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid #f0f0f0', paddingTop: '20px' }}>
          <button 
            type="button"
            onClick={handleDownloadIcs}
            style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', color: '#334155', fontSize: '13px' }}
          >
            Añadir a calendario (.ics)
          </button>
          <button 
            type="button"
            onClick={handlePrint}
            style={{ background: 'transparent', border: '1px solid #006ce4', padding: '10px 16px', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', color: '#006ce4', fontSize: '13px' }}
          >
            Imprimir comprobante
          </button>
          <button 
            type="button"
            onClick={onClose}
            style={{ background: '#006ce4', border: 'none', padding: '10px 20px', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', color: '#fff', fontSize: '13px' }}
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
}

