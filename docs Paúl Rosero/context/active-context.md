# Contexto Activo — Booking Prototipo (Integración de Sistemas)

## ✅ Estado Actual del Proyecto
**Reto 1 (RDA1): COMPLETADO** — Construcción base API-first finalizada y subida al repositorio `RDA1-Integracion-Sistemas`.

El stack completo está operativo en local:
- **Docker:** PostgreSQL corriendo en `localhost:5432` (contenedor `booking_db_container`)
- **Backend NestJS:** `http://localhost:3000/api/v1` | Swagger: `http://localhost:3000/api/docs`
- **Frontend React:** `http://localhost:5173`

## Equipo "Booking Prototipo" (El Integrador)
Somos un grupo de 3 estudiantes responsables de crear la plataforma central (Marketplace + Admin) que consumirá las APIs de nuestros compañeros.
- **Tu Rol:** Integración vertical de la categoría **Atracciones** ✅ COMPLETO
- **Alejo:** Integración de Vuelos (pendiente de su parte).
- **Lizz:** Integración de Alojamientos (pendiente de su parte).

## Arquitectura Implementada (Reto 1)
- **Repositorio:** `RDA1-Integracion-Sistemas`.
- **Base de Datos (Docker):** PostgreSQL con **8 tablas core** auto-generadas por TypeORM (`usuarios`, `carritos`, `carrito_items`, `facturas`, `factura_items`, `api_request_logs`, `estado_servicios`, `configuraciones`).
- **Backend:** NestJS con `AtraccionesModule` como BFF: usa `@nestjs/axios` para consumir la API externa. CORS habilitado para el frontend.
- **Frontend:** React + Vite en `/frontend`. Diseño estilo Booking.com con Axios.

## Tareas Completadas — RDA1
1. ✅ `docker-compose.yml` con PostgreSQL operativo.
2. ✅ 8 entidades TypeORM en `src/core/entities/`.
3. ✅ `AtraccionesModule` con `@nestjs/axios` como integrador HTTP (BFF).
4. ✅ Swagger activo en `http://localhost:3000/api/docs`.
5. ✅ CORS habilitado en `main.ts` para `localhost:5173`.
6. ✅ Frontend React con buscador, filtros, tarjetas paginadas y vista detalle.
7. ✅ Todo subido a GitHub (`semestre5grupal-ops/RDA1-Integracion-Sistemas`).

## Próximos Pasos — RDA2
- Esperar la URL de la API real de Atracciones del compañero responsable.
- Actualizar `ATRACCIONES_API_URL` en `.env` apuntando a esa URL real.
- Preparar el API Gateway para el Reto 2.
