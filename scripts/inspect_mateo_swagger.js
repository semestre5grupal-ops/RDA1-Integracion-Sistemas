const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function run() {
  const r = await fetch('https://maneja-de-una-autos-api.azurewebsites.net/swagger');
  const html = await r.text();
  console.log('HTML snippet:');
  console.log(html.slice(0, 1500));
}

run();

