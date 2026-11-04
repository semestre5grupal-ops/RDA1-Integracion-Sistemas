const crypto = require('crypto');
const apiKey = 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA';
const baseUrl = 'https://rutalibre-autos-api.azurewebsites.net/api/v3';

async function testOrder() {
  const orderBody = {
    vehicle_id: 'auto-pdb-1517',
    pickup_date: '2026-11-25',
    pickup_time: '10:00:00',
    dropoff_date: '2026-11-26',
    dropoff_time: '12:00:00',
    coverage_type: 'TOTAL',
    driver: {
      full_name: 'Paúl Rosero',
      email: 'paul.rosero@epn.edu.ec',
      phone: '+593988776655',
      license_number: '1710000009',
      age: 28
    }
  };

  console.log('Sending order with UUID v4 to /autos/orders/create...');
  const res = await fetch(`${baseUrl}/autos/orders/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'Idempotency-Key': crypto.randomUUID()
    },
    body: JSON.stringify(orderBody)
  });
  console.log('Order status:', res.status);
  const data = await res.json();
  console.log('Order response:', data);

  // If order created, test cancellation (Saga)
  const orderId = data?.order_id || data?.id || data?.pnr;
  if (orderId && (res.status === 200 || res.status === 201)) {
    console.log('\nTesting cancellation on order:', orderId);
    const cancelRes = await fetch(`${baseUrl}/autos/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify({ reason: 'Test cancel' })
    });
    console.log('Cancel status:', cancelRes.status, await cancelRes.text());
  }
}

testOrder().catch(console.error);
