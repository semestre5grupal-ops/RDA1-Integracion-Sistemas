async function main() {
  const loginRes = await fetch('https://ms-identity.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v2/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@booking.com',
      password: 'NuevaClave#2026Segura'
    })
  });
  const { access_token } = await loginRes.json();

  console.log('Testing checkin on Gloria for 2d6a013c-348f-42f5-a72f-4b7b4c111373 with 1722959465...');
  const res = await fetch('https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v2/atracciones/reservas/2d6a013c-348f-42f5-a72f-4b7b4c111373/checkin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${access_token}`
    },
    body: JSON.stringify({
      documento_identidad: '1722959465',
      guia_codigo: 'Carlos Villacís'
    })
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Checkin response:', JSON.stringify(data, null, 2));
}
main();

