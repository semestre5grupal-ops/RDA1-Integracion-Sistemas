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