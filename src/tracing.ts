/**
 * OpenTelemetry (semana 10). Debe importarse como PRIMERA línea de main.ts,
 * antes de cualquier otro módulo: la instrumentación parchea http al cargarse.
 *
 * Viene APAGADO. Solo arranca si OTEL_ENABLED=true, así que en Azure no cambia
 * nada hasta que alguien lo encienda a propósito. Si algo falla al arrancarlo,
 * se avisa en consola y la API sigue funcionando igual.
 *
 * Variables:
 *   OTEL_ENABLED=true                         enciende el SDK
 *   OTEL_SERVICE_NAME=booking-core-api        nombre que verás en Jaeger
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 *                                             (Jaeger all-in-one; se agrega /v1/traces)
 *   OTEL_TRACES_SAMPLER_ARG=1                 fracción de trazas (1 = 100 %, solo dev/aula)
 *   OTEL_HTTP_INSTRUMENTATION=true            traza también las llamadas http salientes/entrantes
 */
try {
  // Corre antes que main.ts: se cargan aquí las variables de .env para leer OTEL_ENABLED en local.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
} catch (_) {}

if (process.env.OTEL_ENABLED === 'true') {
  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    /* eslint-enable @typescript-eslint/no-var-requires */

    const base = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318').replace(/\/+$/, '');
    const instrumentations: any[] = [];
    if (process.env.OTEL_HTTP_INSTRUMENTATION !== 'false') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
      instrumentations.push(new HttpInstrumentation());
    }

    const sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME || 'booking-core-api',
      traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces` }),
      instrumentations,
    });
    sdk.start();
    // eslint-disable-next-line no-console
    console.log(`[otel] trazas activas → ${base}/v1/traces`);

    const apagar = () => void sdk.shutdown().catch(() => undefined);
    process.once('SIGTERM', apagar);
    process.once('SIGINT', apagar);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn(`[otel] no se pudo iniciar, se sigue sin trazas: ${e?.message}`);
  }
}
