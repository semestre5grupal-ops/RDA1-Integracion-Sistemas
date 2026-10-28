const fs = require('fs');

async function main() {
  const urls = [
    'http://100.64.117.64:3000/api/docs-json',
    'http://100.64.117.64:3000/api/docs-yaml',
    'http://100.64.117.64:3000/api/docs',
    'http://100.64.117.64:3000/api/docs/swagger-ui-init.js'
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      console.log(`${url} -> HTTP ${res.status}`);
      const text = await res.text();
      if (res.status === 200) {
        if (text.trim().startsWith('{')) {
          const doc = JSON.parse(text);
          console.log('INFO:', doc.info);
          console.log('PATHS:', Object.keys(doc.paths || {}));
        } else if (url.includes('swagger-ui-init.js')) {
          console.log('--- swagger-ui-init.js (first 500 chars) ---');
          console.log(text.slice(0, 500));
          // search for swaggerDoc
          const idx = text.indexOf('"paths":');
          if (idx !== -1) {
            console.log('--- Found paths in swagger-ui-init.js ---');
            console.log(text.slice(idx, idx + 600));
          }
        } else if (url.endsWith('/api/docs')) {
          console.log('--- Swagger HTML (first 500 chars) ---');
          console.log(text.slice(0, 500));
        }
      }
    } catch (e) {
      console.log(`${url} -> error: ${e.message}`);
    }
  }
}

main();
