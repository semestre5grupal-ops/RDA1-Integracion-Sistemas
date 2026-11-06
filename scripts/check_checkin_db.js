const { DataSource } = require('typeorm');
const https = require('https');

function getDanielOrders() {
  return new Promise((resolve) => {
    https.get('https://rutalibre-autos-api.azurewebsites.net/api/v3/orders', {
      headers: { 'X-API-Key': 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', () => resolve([]));
  });
}

async function test() {
  const orders = await getDanielOrders();
  console.log('Orders in Daniel API matching daniel@gmail.com or 4469a11f-7667-4ef8-89a0-2a361aa04c66:');
  for (const o of orders) {
    if (o.client_id === '4469a11f-7667-4ef8-89a0-2a361aa04c66' || JSON.stringify(o).includes('daniel')) {
      console.log(o.order_id, o.pnr, 'status:', o.status, 'estado:', o.estado, 'auto:', o.auto_id, 'created:', o.created_at);
    }
  }
}

test();
