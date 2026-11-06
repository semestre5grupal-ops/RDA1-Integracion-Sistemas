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

  const cRes = await fetch('https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v2/atracciones/admin/1563d2a6-65ed-4d4f-a06d-48a6b3ed4ca5/cupos?desde=2026-11-01&hasta=2026-12-31', {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  console.log('Cupos status:', cRes.status);
  const data = await cRes.json();
  console.log('Cupos configured for Gloria attraction:', JSON.stringify(data, null, 2));
}
main();
