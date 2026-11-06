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

  const cRes = await fetch('https://ms-catalog.yellowsky-d7d7b363.brazilsouth.azurecontainerapps.io/api/v2/clientes?identificacion=1722959465', {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  console.log('1722959465 Response:', await cRes.json());
}
main();
