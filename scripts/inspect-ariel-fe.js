const https = require('https');

https.get('https://ecuatravel-rda1-is.vercel.app/assets/index-yxczcHDY.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const p = data.indexOf('/auth/login');
    console.log('/auth/login at:', p, data.slice(p - 50, p + 150));
  });
});
