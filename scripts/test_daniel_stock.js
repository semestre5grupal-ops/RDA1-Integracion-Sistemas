async function testStock() {
  const url = 'https://booking-core-api.azurewebsites.net/api/v3/inventory/stock';
  
  // Test 1: Sending with Daniel's new key and NODE_AUT_RUTALIBRE
  console.log('Sending stock update with NODE_AUT_RUTALIBRE...');
  const res1 = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA'
    },
    body: JSON.stringify({
      service_id: 'NODE_AUT_RUTALIBRE',
      item_id: 'auto-101',
      date: '2026-11-05',
      time_slot: 'DEFAULT',
      available_units: 3
    })
  });
  console.log('Res 1 Status:', res1.status, await res1.text());

  // Test 2: Sending without service_id, only apiKey
  console.log('Sending stock update with only apiKey...');
  const res2 = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA'
    },
    body: JSON.stringify({
      item_id: 'auto-101',
      date: '2026-11-05',
      available_units: 3
    })
  });
  console.log('Res 2 Status:', res2.status, await res2.text());
}

testStock().catch(console.error);

