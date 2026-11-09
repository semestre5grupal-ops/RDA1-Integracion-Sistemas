const https = require('https');

async function test() {
  const loginData = JSON.stringify({ email: 'admin@booking.com', password: 'NuevaClave#2026Segura' });
  const loginRes = await fetch('https://ms-identity.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v2/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: loginData
  });
  const { access_token } = await loginRes.json();

  const res = await fetch('https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v2/atracciones/admin/reservas?limit=10&page=1', {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Total reservas in Gloria:', data.total || data.items?.length || data.length);
  const items = data.items || data;
  console.log('Last 3 reservations in Gloria:');
  console.log(JSON.stringify(items.slice(0, 3), null, 2));
}

test().catch(console.error);
