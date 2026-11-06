async function testLive() {
  console.log('--- 1. Testing Availability for Gloria attraction ---');
  const availRes = await fetch('https://booking-core-api.azurewebsites.net/api/v1/atracciones/1563d2a6-65ed-4d4f-a06d-48a6b3ed4ca5/availability?date=2026-11-15');
  console.log('Availability HTTP status:', availRes.status);
  const availData = await availRes.json();
  console.log('Slots:', (availData.time_slots || availData.turnos || []).map(s => ({ time: s.time, status: s.status, cupos: s.cupos_disponibles })));

  console.log('\n--- 2. Testing Reservation for Gloria attraction via Booking Core API ---');
  const resPayload = {
    date: '2026-11-15',
    time: '09:00',
    tickets: 1,
    customer_name: 'Estudiante Auditor PUCE',
    customer_email: 'auditor@puce.edu.ec',
    customer_phone: '+593998765432',
    document_id: '1755073481'
  };

  const bookingRes = await fetch('https://booking-core-api.azurewebsites.net/api/v1/atracciones/1563d2a6-65ed-4d4f-a06d-48a6b3ed4ca5/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resPayload)
  });

  console.log('Booking HTTP status:', bookingRes.status);
  const bookingData = await bookingRes.json();
  console.log('Booking Response:', JSON.stringify(bookingData, null, 2));
}

testLive().catch(console.error);

