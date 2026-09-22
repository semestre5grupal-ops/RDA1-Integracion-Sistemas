# Preguntas para la Defensa del RDA1

## Sobre las Tecnologías Usadas

**1. ¿Qué es Axios y cómo funciona?**
Investigar: librería HTTP para JavaScript/TypeScript que permite hacer peticiones `GET`, `POST`, etc. a APIs externas desde el navegador o Node.js. La usamos en el frontend para llamar a NestJS, y `@nestjs/axios` en el backend para llamar a las APIs de los compañeros.

**2. ¿Qué es Docker y por qué lo usamos para la base de datos?**
Investigar: Docker crea contenedores aislados. Usamos `docker-compose.yml` para levantar PostgreSQL sin instalarlo directamente. Ventaja: cualquier compañero puede correr `docker compose up -d` y tener la base de datos idéntica.

**3. ¿Qué es un BFF (Backend For Frontend)?**
Investigar: patrón de arquitectura donde el backend actúa de intermediario entre el frontend y los microservicios. Nuestro NestJS es el BFF: recibe petición del React, la reenvía a la API del compañero, y devuelve el resultado formateado.

**4. ¿Qué es TypeORM y cómo genera las tablas?**
Investigar: ORM para TypeScript/Node.js. Define las tablas como clases TypeScript (`@Entity`, `@Column`). Con `synchronize: true`, al arrancar NestJS crea automáticamente las tablas en la base de datos si no existen.

**5. ¿Qué es Swagger y cómo funciona en NestJS?**
Investigar: herramienta que genera documentación automática de APIs REST. En NestJS se usa `@nestjs/swagger` con decoradores (`@ApiTags`, `@ApiOperation`, `@ApiResponse`) sobre los controladores. La UI se ve en `http://localhost:3000/api/docs`.

**6. ¿Qué es CORS y por qué hay que habilitarlo?**
Investigar: política de seguridad de los navegadores que bloquea peticiones entre dominios diferentes. Como el frontend corre en `localhost:5173` y el backend en `localhost:3000`, el browser bloquearía la comunicación si no habilitamos CORS con `app.enableCors()`.

**7. ¿Qué es React + Vite?**
Investigar: React es la librería de UI para crear interfaces web reactivas. Vite es el bundler/servidor de desarrollo moderno que reemplaza a webpack. Juntos permiten crear SPAs (Single Page Applications) muy rápido.

## Sobre la Arquitectura y Código NestJS (DTOs, Controladores, Servicios y Módulos)

**8. ¿Cuántos DTOs hemos utilizado?**
- **Respuesta:** En nuestro desarrollo del módulo de **Atracciones** (BFF), hemos utilizado el DTO `PaginationQueryDto` (ubicado en `src/common/dto/pagination-query.dto.ts`). Este DTO valida y transforma los parámetros de consulta `page` y `limit` utilizando `class-validator` y `class-transformer` (`@IsOptional()`, `@IsInt()`, `@Min()`, `@Type(() => Number)`).
- En la plantilla base del backend también existen DTOs adicionales para otros módulos (como `create-vuelo.dto.ts`, `create-auto.dto.ts`, etc.) destinados a la validación de payloads de entrada en peticiones de creación/actualización.

**9. ¿Cómo funciona el controlador, servicio y módulo?**
- **Controlador (`@Controller`):** Es la capa de entrada HTTP/REST. Escucha las peticiones entrantes desde el cliente (Frontend/Swagger), valida los parámetros (Query, Body, Params) mediante DTOs, documenta los endpoints con decoradores de Swagger (`@ApiTags`, `@ApiOperation`, `@ApiResponse`) y delega la ejecución del trabajo al Servicio. No contiene lógica de negocio ni llamadas directas a HTTP externos.
- **Servicio (`@Injectable`):** Es la capa donde reside la lógica de negocio y la integración externa. En nuestro esquema BFF, el servicio inyecta `HttpService` (`@nestjs/axios`) para comunicarse con la API remota (ej. JSONPlaceholder o APIs de compañeros), procesa las respuestas en formato RxJS (`firstValueFrom`), maneja posibles errores HTTP y retorna los datos limpios al controlador.
- **Módulo (`@Module`):** Es la estructura organizativa de NestJS y el contenedor de Inyección de Dependencias. Declara los controladores (`controllers`), provee los servicios (`providers`) e importa módulos externos requeridos (`HttpModule`). Encapsula todo el contexto de una categoría para que la aplicación NestJS sepa cómo resolver e instanciar sus dependencias.

**10. ¿Existe un solo controlador, servicio y módulo por categoría o no? ¿Cómo cambiaría eso para el RDA2?**
- **En el RDA1 (Estado Actual):** **Sí**, existe una estructura modular de 1 a 1 por categoría (`AtraccionesModule` contiene `AtraccionesController` y `AtraccionesService`). Todas las categorías conviven en la misma aplicación NestJS monolítica que funciona como BFF / API Gateway centralizador.
- **Cambios y Evolución para el RDA2:**
  - **Descomposición en Microservicios:** En el RDA2, las categorías dejarán de coexistir en un mismo monolito NestJS. Cada categoría (Atracciones, Vuelos, Hoteles, etc.) se convertirá en un microservicio totalmente independiente con su propio repositorio, despliegue y base de datos.
  - **Múltiples Controladores/Servicios por Módulo:** Dentro del microservicio de una categoría compleja, ya no habrá solo 1 controlador o servicio, sino múltiples según la responsabilidad (ej. en Atracciones: `AtraccionesCatalogoController`, `AtraccionesReservaController`, `AtraccionesAdminController`).
  - **API Gateway Independiente:** Se incorporará un API Gateway formal (como Kong, KrakenD o NestJS Gateway) que enrutará el tráfico del Frontend hacia los diferentes microservicios independientes de cada categoría.

## Sobre Diseño de APIs REST y Estándares de la Industria

**11. ¿Por qué usamos `POST /atracciones/search` en lugar de `GET` para buscar atracciones?**
- **El Dilema:** En la teoría purista de REST, las operaciones de consulta o lectura deben usar el método HTTP `GET` (con parámetros en la URL como `?categoria=MUSEO`), mientras que `POST` se reserva para crear nuevos recursos. Sin embargo, en nuestro contrato `atracciones-openapi.yaml`, el endpoint de búsqueda es `POST /atracciones/search`.
- **Explicación Detallada (Razones Técnicas e Industriales):**

  1. **Estructuras de Datos Complejas y Anidadas (Payloads Complejos):**
     - Las búsquedas en el sector turístico (vuelos, hoteles, atracciones) no son simples búsquedas por palabra clave. Requieren filtros avanzados con estructuras JSON complejas y jerárquicas: arrays (varias categorías simultáneas `["PARK", "MUSEUM"]`), objetos de rango de fechas, edades de los acompañantes/niños, polígonos de geolocalización, rangos de precios, etc.
     - Pasar este volumen de datos anidados en una URL mediante query parameters genera URLs extremadamente largas, desordenadas y difíciles de parsear.

  2. **Límite de Longitud de la URL (HTTP 414 URI Too Long):**
     - Los navegadores web, servidores proxy (NGINX, Cloudflare) y API Gateways imponen límites estrictos a la longitud de las URLs (típicamente entre 2,048 y 8,192 caracteres).
     - Si un usuario realiza una búsqueda con múltiples filtros y combinaciones, la URL puede exceder este límite, provocando que el servidor rechace la petición con un error `414 URI Too Long`. Con `POST`, los datos van en el cuerpo de la petición (request body), el cual no tiene este límite.

  3. **Incompatibilidad Técnica de `GET` con Request Body en la Práctica:**
     - La especificación de HTTP no prohíbe explícitamente incluir un cuerpo (body) en una petición `GET`, pero en la infraestructura real de internet, la mayoría de librerías cliente (Axios, Fetch), API Gateways y proxies de seguridad **eliminan o borran (strip) el body de una petición GET** antes de enviarla al backend, o lanzan un error `400 Bad Request`.
     - Por lo tanto, para enviar un JSON en el cuerpo de la petición de forma segura y portable, el método estándar debe ser `POST`.

  4. **Seguridad y Privacidad de Logs:**
     - Las URLs de peticiones `GET` (incluyendo los query parameters) se registran automáticamente en texto plano en los archivos de log de servidores NGINX/Apache, firewalls, proxies intermediarios y el historial del navegador.
     - Si la búsqueda incluye datos personales o sensibles (ej. fechas de viaje de menores de edad, presupuestos máximos, IDs de usuarios), exponerlos en la URL es una falla de seguridad. El cuerpo de una petición `POST` se transmite cifrado bajo HTTPS y no se registra automáticamente en los logs del servidor web.

  5. **Estándar Real de la Industria (Pragmatic REST):**
     - Las plataformas de búsqueda y APIs empresariales más importantes del mundo adoptan el patrón `POST /search` cuando manejan payloads de búsqueda complejos:
       - **Elasticsearch / OpenSearch:** `POST /<index>/_search`
       - **APIs de Turismo (Amadeus, Booking.com Demand API, Expedia):** `POST /v1/attractions/search`
       - **GraphQL:** Utiliza exclusivamente `POST /graphql` para todas sus consultas.
     - En el estándar de la IETF existe incluso la propuesta del verbo `SEARCH`, pero mientras no esté soportado por todos los navegadores, `POST /search` es la solución universalmente aceptada.

- **Conclusión del Diseño en nuestro Microservicio:**
  - `GET /atracciones`: Se mantiene para listar el catálogo simple con paginación (`?page=1&limit=10`), aprovechando la memoria caché del navegador/CDN.
  - `POST /atracciones/search`: Se utiliza para búsquedas avanzadas y cálculo de disponibilidad dinámica con cuerpo JSON.
