const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const fs = require('fs');

async function run() {
  const r = await fetch('https://maneja-de-una-autos-api.azurewebsites.net/swagger/swagger-ui-init.js');
  const js = await r.text();
  console.log('JS length:', js.length);
  // Extract swaggerDoc
  const match = js.match(/"swaggerDoc":\s*({.+?}),\s*"customOptions"/s);
  if (match) {
    fs.writeFileSync('scripts/mateo_swagger.json', match[1], 'utf8');
    console.log('Saved scripts/mateo_swagger.json');
  } else {
    fs.writeFileSync('scripts/mateo_swagger_raw.js', js, 'utf8');
    console.log('Saved raw js');
  }
}

run();

