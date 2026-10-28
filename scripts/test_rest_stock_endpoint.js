// Test script for POST /api/v3/inventory/stock
const axios = require('axios');

async function testStockEndpoint() {
  const url = 'http://localhost:3000/api/v3/inventory/stock';
  const apiKey = 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA';

  const payload = {
    item_id: 'auto-daniel-001',
    available_units: 4,
    date: '2026-10-28',
    time_slot: 'DEFAULT',
    timestamp: Date.now()
  };

  console.log(`Enviando POST a ${url} con X-API-Key...`);
  try {
    const res = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      }
    });

    console.log('✅ Respuesta exitosa (Status ' + res.status + '):');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('❌ Error llamando endpoint:', err.response ? {
      status: err.response.status,
      data: err.response.data
    } : err.message);
  }

  // Ahora probemos también consultar el registro en /api/v3/inventory
  try {
    const statusRes = await axios.get('http://localhost:3000/api/v3/inventory', {
      headers: { 'X-API-Key': apiKey }
    });
    console.log('📊 Estado general del inventario:');
    console.log(JSON.stringify(statusRes.data, null, 2));
  } catch (err) {
    console.error('Error consultando /api/v3/inventory:', err.message);
  }
}

testStockEndpoint();
