require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_SECRET_KEY;
const supabase = createClient(process.env.SUPABASE_URL, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function cleanupDuplicatesAndPing() {
  const { data } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'admin@booking.com'
  });
  const verifyRes = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink'
  });
  const token = verifyRes.data.session.access_token;

  // Remove duplicates
  for (const dupe of ['NODE_AUT_DANIEL', 'NODE_AUT_MATEO', 'NODE_ATR_MICHAEL']) {
    const res = await fetch(`https://booking-core-api.azurewebsites.net/api/v3/nodes/${dupe}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`DELETE duplicate ${dupe}: ${res.status}`);
  }

  // Ping Mateo and Gloria to stabilize
  for (const code of ['NODE_AUT_MDU', 'NODE_ATR_GLORIA']) {
    const ping = await fetch(`https://booking-core-api.azurewebsites.net/api/v3/nodes/${code}/ping`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const pData = await ping.json();
    console.log(`Ping ${code}: ${pData.latencia_ms}ms, status: ${pData.health_status}`);
  }

  // Final fetch of all nodes
  const listRes = await fetch('https://booking-core-api.azurewebsites.net/api/v3/nodes');
  const finalNodes = await listRes.json();
  console.log(`\nFinal Node Topology in Panel 1 (${finalNodes.length}):`);
  finalNodes.forEach(n => {
    const led = n.semaforo_led?.icono || '⚪';
    const estado = n.semaforo_led?.estado || n.health_status;
    console.log(`${led} ${(n.codigo_nodo || n.codigo).padEnd(24)} | ${(n.nombre_proveedor || n.nombre).padEnd(38)} | ${estado.padEnd(12)} | ${(n.latencia_ms || 0)}ms | ${n.base_url_rest || n.url}`);
  });
}

cleanupDuplicatesAndPing().catch(console.error);
