const https = require('https');

function post(url, data) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    });
    req.write(body);
    req.end();
  });
}

function get(url, token, params = '') {
  return new Promise((resolve) => {
    const u = new URL(url + (params ? '?' + params : ''));
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Cache-Control': 'no-cache'
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    });
    req.end();
  });
}

async function run() {
  const login = await post('https://ecuatravel-atracciones-api.azurewebsites.net/api/v2/auth/login', {
    email: 'pruebasbooking@gmail.com',
    password: 'pruebasbooking'
  });
  console.log('Login status:', login.status);
  const token = login.data.token || login.data.access_token || login.data.data?.token;
  console.log('Token exists:', !!token);

  if (token) {
    const reservas = await get('https://ecuatravel-atracciones-api.azurewebsites.net/api/v2/admin/reservas', token);
    console.log('Reservas count:', reservas.data?.length || reservas.data?.items?.length || reservas.data);

    const search1 = await get('https://ecuatravel-atracciones-api.azurewebsites.net/api/v2/admin/reservas', token, 'q=1752693620');
    console.log('Search q=1752693620:', search1.data);

    const search2 = await get('https://ecuatravel-atracciones-api.azurewebsites.net/api/v2/admin/reservas', token, 'q=ECT-T8BM8R');
    console.log('Search q=ECT-T8BM8R:', search2.data);
  }
}

run();

