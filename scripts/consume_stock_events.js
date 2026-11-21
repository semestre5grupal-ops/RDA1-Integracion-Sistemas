const amqp = require('amqplib');

// La URL del broker (con su contraseña) viene del entorno; nunca se escribe en el código.
const BROKER_URL = process.env.RABBITMQ_URL;
if (!BROKER_URL) {
  console.error('Falta RABBITMQ_URL. Ejecuta: RABBITMQ_URL="amqps://..." node scripts/consume_stock_events.js');
  process.exit(1);
}
const QUEUE_NAME = 'q.stock.actualizado';

async function runStockConsumer() {
  console.log(`Connecting to CloudAMQP broker: ${BROKER_URL.split('@')[1]}...`);
  const connection = await amqp.connect(BROKER_URL);
  const channel = await connection.createChannel();

  await channel.assertQueue(QUEUE_NAME, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': 'q.dead_letter'
    }
  });

  await channel.prefetch(50);
  console.log(`[*] Esperando mensajes en ${QUEUE_NAME}. Para salir presiona CTRL+C.`);

  let processedCount = 0;
  let mateoFound = false;

  await channel.consume(QUEUE_NAME, (msg) => {
    if (!msg) return;

    try {
      const contentStr = msg.content.toString();
      const props = msg.properties;
      processedCount++;

      let parsed = null;
      try {
        parsed = JSON.parse(contentStr);
      } catch (e) {
        parsed = { raw: contentStr };
      }

      const msgId = props.messageId || parsed?.id || parsed?.messageId;
      const serviceId = parsed?.data?.service_id || parsed?.payload?.service_id || parsed?.service_id;
      const itemId = parsed?.data?.item_id || parsed?.payload?.item_id || parsed?.item_id;

      if (
        contentStr.includes('NODE_AUT_MDU') ||
        (msgId && String(msgId).includes('NODE_AUT_MDU')) ||
        serviceId === 'NODE_AUT_MDU' ||
        itemId === '10000000-0000-4000-8000-000000000118'
      ) {
        mateoFound = true;
        console.log('\n========================================');
        console.log('🎯 ¡EVENTO DE MATEO (NODE_AUT_MDU) PROCESADO CON ÉXITO!');
        console.log(`- messageId: ${msgId || props.messageId}`);
        console.log(`- Vehículo: ${itemId}`);
        console.log(`- Contenido:`, JSON.stringify(parsed, null, 2));
        console.log('========================================\n');
      }

      channel.ack(msg);
    } catch (err) {
      console.error('Error al procesar mensaje:', err.message);
      channel.nack(msg, false, false); // enviar a DLQ si falla
    }
  });

  // Mantener corriendo 5 segundos para vaciar la cola o capturar el mensaje de Mateo
  setTimeout(async () => {
    console.log(`\nResumen: Procesados ${processedCount} mensajes de ${QUEUE_NAME}. Mateo encontrado: ${mateoFound}`);
    await channel.close();
    await connection.close();
    process.exit(0);
  }, 6000);
}

runStockConsumer().catch((err) => {
  console.error('Fatal error in consumer:', err);
  process.exit(1);
});
