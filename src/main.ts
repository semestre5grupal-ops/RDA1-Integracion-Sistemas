import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Rfc7807ExceptionFilter } from './core/filters/rfc7807-exception.filter';
import { crearValidationPipeGlobal } from './core/validation/validation-pipe';
import { HateoasInterceptor } from './core/interceptors/hateoas.interceptor';

/**
 * Limite del cuerpo JSON, en bytes.
 *
 * MEDIDO con el layout real (`prueba-tamano-pdf.mjs`): la factura pesa 12.6 KB y
 * su Base64 17 KB, o sea un JSON de ~17 KB. El limite por defecto de
 * `body-parser` (100 KB) alcanzaria de sobra HOY.
 *
 * Se sube a 5 MB por margen, no por necesidad inmediata: el PDF es TEXTO y no
 * tiene imagenes, pero en cuanto se le meta el logo, un QR o un sello, jsPDF
 * deja de comprimir igual y el Base64 (que infla un 33%) se dispara. El dia que
 * eso ocurra, un 413 aparece ANTES de llegar al controlador y el mensaje que ve
 * el usuario no tiene nada que ver con su correo.
 *
 * 5 MB no convierte el endpoint en una via de subida arbitraria porque el limite
 * real de UNA factura lo impone `@MaxLength(2_500_000)` en `EnviarFacturaDto`: un
 * payload entre 2.5 MB y 5 MB pasa el parser y muere en la validacion, con un 400
 * que si explica el motivo.
 *
 * ── Por que `bodyParser: false` + `useBodyParser` y no solo `useBodyParser` ──
 * `app.useBodyParser()` ANADE un parser con el limite nuevo, pero Nest tambien
 * registra los suyos durante `init()` con el limite de 100 KB. Como Express
 * ejecuta los middleware en orden de registro, el de 100 KB CORTA la peticion
 * antes de que llegue al que se acaba de añadir.
 *
 * `bodyParser: false` desactiva los automaticos, y `useBodyParser` monta
 * entonces solo los dos de aqui, ya con el limite correcto. Se usa
 * `useBodyParser` y no importar `json`/`urlencoded` de `express` porque `express`
 * no es dependencia directa de este proyecto: llega anidada bajo
 * `@nestjs/platform-express` y un `import` desde aqui falla en tiempo de
 * ejecucion aunque compile. `useBodyParser` es la API pública de Nest para esto.
 */
const LIMITE_CUERPO = '5mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    { bodyParser: false },
  );

  app.useBodyParser('json', { limit: LIMITE_CUERPO });
  app.useBodyParser('urlencoded', { limit: LIMITE_CUERPO, extended: true });

  // Habilita CORS para que el frontend pueda llamar al backend.
  //
  // `X-Device-Fingerprint` es OBLIGATORIA en `POST /vuelos/search` (contrato
  // v1.5.0.0). Como es una cabecera no simple, el navegador dispara un PREFLIGHT:
  // si no aparece en `allowedHeaders`, el navegador rechaza la peticion ANTES de
  // salir, y la busqueda falla con un error de red sin llegar al controlador.
  //
  // `credentials: true` es necesario para las rutas autenticadas, que viajan con
  // `withCredentials: true` para enviar la cookie httpOnly de sesion. Al
  // activarlo, el navegador exige que `origin` sea un valor EXACTO (nunca `*`),
  // por eso se mantiene la lista de origenes concreta en lugar de un comodin.
  app.enableCors({
    origin: [
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.onrender\.com$/
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'idempotency-key',
      'Idempotency-Key',
      'x-device-fingerprint',
      'X-Device-Fingerprint',
    ],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  // `whitelist: true` + `forbidNonWhitelisted: true` es lo que hace que un campo
  // no declarado en el DTO sea un 400 y no se ignore en silencio. Sin eso, un
  // cliente podria mandar `{ departureDate: 'ayer' }` creyendo que habia
  // programado un vuelo.
  app.useGlobalPipes(crearValidationPipeGlobal());

  // Registrar el filtro global de excepciones para cumplir con la RFC 7807
  app.useGlobalFilters(new Rfc7807ExceptionFilter());

  // HATEOAS: inyectar enlaces en las respuestas (Richardson Nivel 3)
  app.useGlobalInterceptors(new HateoasInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Booking Prototipo API')
    .setDescription(
      'API del Booking: Vuelos, Autos, Atracciones, Alojamientos, Facturas, Chatbot, Telemetría, ' +
      'Panel de Administración (usuarios, finanzas, payouts, auditoría, ajustes) y Configuración pública.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Swagger UI (interactivo) + JSON del contrato OpenAPI
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
  // ReDoc (documentación de lectura) usando el mismo contrato OpenAPI
  app.getHttpAdapter().get('/api/redoc', (_req: any, res: any) => {
    res.type('html').send(`<!DOCTYPE html><html><head><title>Booking Prototipo API - ReDoc</title>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><redoc spec-url="/api/docs-json"></redoc>
<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script></body></html>`);
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
