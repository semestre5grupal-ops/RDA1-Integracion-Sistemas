const { createHmac, randomUUID } = require('node:crypto');

const verticales = {
  vuelos: 'https://vuelos.booking.epn.edu.ec',
  autos: 'https://renta-autos.ec/api/v2',
  atracciones: 'https://descubreec.com/api/v2',
  alojamientos: 'https://alojamientos.booking.epn.edu.ec/api/v2',
};

const vertical = process.argv[2];
if (!Object.hasOwn(verticales, vertical)) {
  process.stderr.write('Uso: node scripts/webhooks/sign.js <vuelos|autos|atracciones|alojamientos>\n');
  process.exitCode = 1;
} else {
  const secret = process.env[`WEBHOOK_SECRET_${vertical.toUpperCase()}`];
  if (!secret || secret.length < 16) {
    process.stderr.write(`Configura WEBHOOK_SECRET_${vertical.toUpperCase()} con al menos 16 caracteres.\n`);
    process.exitCode = 1;
  } else {
    const event = {
      specversion: '1.0',
      id: randomUUID(),
      source: verticales[vertical],
      type: `webhook.${vertical}.test`,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      correlationid: `corr-${randomUUID()}`,
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      data: { sample: true },
    };
    const body = JSON.stringify(event);
    const signature = createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('hex');
    process.stdout.write(`Body: ${body}\nX-Webhook-Signature: sha256=${signature}\n`);
  }
}
