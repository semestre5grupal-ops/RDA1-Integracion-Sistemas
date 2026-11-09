async function main() {
  const url1 = 'https://booking-core-api.azurewebsites.net/api/v3/reservas/2d6a013c-348f-42f5-a72f-4b7b4c111373/checkin';
  
  // Test with different payloads
  const p1 = { document_id: '1722959465' };
  const res1 = await fetch(url1, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'booking-secret-key-2026' },
    body: JSON.stringify(p1)
  });
  console.log('p1 status:', res1.status, await res1.text());

  const p2 = { documento_identidad: '1722959465', guia_codigo: 'Guía' };
  const res2 = await fetch(url1, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'booking-secret-key-2026' },
    body: JSON.stringify(p2)
  });
  console.log('p2 status:', res2.status, await res2.text());

  // Also test /api/v3/atracciones/reservas/2d6a013c-348f-42f5-a72f-4b7b4c111373/checkin
  const url2 = 'https://booking-core-api.azurewebsites.net/api/v3/atracciones/reservas/2d6a013c-348f-42f5-a72f-4b7b4c111373/checkin';
  const res3 = await fetch(url2, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'booking-secret-key-2026' },
    body: JSON.stringify(p2)
  });
  console.log('url2 status:', res3.status, await res3.text());
}
main();
