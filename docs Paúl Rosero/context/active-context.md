# Contexto Activo — Booking Prototipo (Integración de Sistemas)

## Estado Actual del Proyecto
Nos encontramos en el **Reto 1: Construcción base API-first sin integración**.
El objetivo es tener la versión funcional del sistema (Monolito) con backend, frontend y base de datos operativa.

## Equipo "Booking Prototipo" (El Integrador)
Somos un grupo de 3 estudiantes responsables de crear la plataforma central (Marketplace + Admin) que consumirá las APIs de nuestros compañeros.
- **Tu Rol:** Integración vertical de la categoría **Atracciones**.
- **Alejo:** Integración de Vuelos (asumido).
- **Lizz:** Integración de Alojamientos (asumido).

## Arquitectura Actual (Reto 1)
- **Repositorio:** `RDA1-Integracion-Sistemas` (Basado en `plantilla inicial`).
- **Base de Datos (Docker):** PostgreSQL con **8 tablas core** (`usuarios`, `carritos`, `facturas`, etc.). **NO** existen tablas de productos (atracciones, vuelos) porque se consultan por HTTP.
- **Backend:** NestJS. Actúa como API Gateway/Integrador. Tu módulo `AtraccionesModule` usará `@nestjs/axios` para hacer peticiones HTTP `GET` a la API de los compañeros.
- **Frontend:** React (Plantilla clon de Booking.com).

## Qué estamos haciendo justo ahora
- Preparando la construcción vertical del módulo de Atracciones.
- Antes de programar, estamos documentando todo en la carpeta `docs Paúl Rosero` para asegurar trazabilidad técnica de cara al Ingeniero.

## Tareas Pendientes Inmediatas
1. ~~Crear `docker-compose.yml` para levantar PostgreSQL.~~ (Completado - Fase 1)
2. ~~Configurar TypeORM en NestJS para que genere las 8 tablas al conectar.~~ (Completado - Fase 1)
3. ~~Crear el módulo integrador de Atracciones en el backend y configurar Swagger.~~ (Completado - Fase 2)
4. ~~Crear frontend React estilo Booking.com con Axios conectado al backend.~~ (Completado - Fase 3)
5. **Siguiente:** Habilitar CORS en NestJS y probar el flujo completo (Docker + Backend + Frontend corriendo juntos).
