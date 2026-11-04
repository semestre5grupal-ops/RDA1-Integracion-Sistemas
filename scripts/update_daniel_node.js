const fs = require('fs');
require('dotenv').config();
if (fs.existsSync('frontend/.env')) {
  require('dotenv').config({ path: 'frontend/.env' });
}
const { createClient } = require('@supabase/supabase-js');

const serviceKey = process.env.VITE_SUPABASE_SECRET_KEY || process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(process.env.SUPABASE_URL, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function checkAndPing() {
  const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: 'admin@booking.com' });
  if (error || !data) {
    console.error('generateLink error:', error);
    return;
  }
  const verifyRes = await supabase.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  const token = verifyRes.data.session.access_token;

  console.log('Ensuring Daniel apiKey in Azure...');
  const putRes = await fetch('https://booking-core-api.azurewebsites.net/api/v3/admin/nodes/NODE_AUT_RUTALIBRE', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      apiKey: 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA',
      baseUrlRest: 'https://rutalibre-autos-api.azurewebsites.net/api/v3',
      nombreProveedor: 'RutaLibre Renta de Autos (Daniel González)'
    })
  });
  console.log('PUT status:', putRes.status, await putRes.text());

  // Ping Daniel
  const pingRes = await fetch('https://booking-core-api.azurewebsites.net/api/v3/nodes/NODE_AUT_RUTALIBRE/ping', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const pingData = await pingRes.json();
  console.log('Daniel ping:', pingData);
}

checkAndPing().catch(console.error);
