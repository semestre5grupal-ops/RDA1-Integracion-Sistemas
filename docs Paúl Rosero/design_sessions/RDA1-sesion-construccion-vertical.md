# Sesión de Desarrollo — RDA1 Completo
**Fecha:** 19 de Septiembre, 2026  
**Autor:** Paúl Rosero  
**Estado:** ✅ COMPLETADO

---

## Resumen de la Sesión

En esta sesión se completó la construcción vertical completa del módulo de **Atracciones** para el Booking Prototipo (Reto 1), cumpliendo los criterios C03, C04, y C05 de la rúbrica.

---

## Decisiones de Diseño Tomadas

### 1. Arquitectura BFF (Backend For Frontend)
- El `AtraccionesModule` **NO tiene base de datos propia**. Actúa como proxy HTTP.
- El `AtraccionesService` usa `@nestjs/axios` para consumir la API externa del compañero de Atracciones.
- Mientras la API real no exista, se usa `https://jsonplaceholder.typicode.com/posts` como mock temporal.
- **Variable de entorno:** `ATRACCIONES_API_URL` en `.env` para fácil configuración.

### 2. Base de Datos Docker — Tablas Core
Las 8 tablas del Booking Prototipo son exclusivamente de **administración y ventas**:
- `usuarios`, `carritos`, `carrito_items`
- `facturas`, `factura_items`
- `api_request_logs`, `estado_servicios`, `configuraciones`
- **NO hay tablas** de `atracciones`, `vuelos`, `alojamientos`, `autos`. Esos datos vienen por HTTP de los compañeros.

### 3. Frontend React + Vite
- Creado en `/frontend` como proyecto independiente (no mezcla con el backend).
- El `tsconfig.json` del backend tiene `"exclude": ["frontend"]` para evitar conflictos.
- Vite corre en `puerto 5173`, NestJS en `puerto 3000`.
- CORS habilitado en NestJS para `localhost:5173`.

---

## Archivos Clave Creados/Modificados

### Backend (NestJS — raíz del proyecto)
| Archivo | Cambio |
|---|---|
| `src/app.module.ts` | Importa `CoreModule` y `AtraccionesModule` |
| `src/main.ts` | CORS habilitado + Swagger configurado |
| `src/core/core.module.ts` | Módulo con las 8 entidades core |
| `src/core/entities/*.entity.ts` | 8 archivos de entidades TypeORM |
| `src/modules/atracciones/atracciones.module.ts` | Importa `HttpModule` |
| `src/modules/atracciones/atracciones.service.ts` | Cliente HTTP BFF |
| `src/modules/atracciones/atracciones.controller.ts` | Endpoints documentados con Swagger |
| `tsconfig.json` | Excluye `frontend/` de la compilación del backend |
| `docker-compose.yml` | PostgreSQL 16 en contenedor `booking_db_container` |
| `.env` | `DATABASE_URL` y `ATRACCIONES_API_URL` |

### Frontend (React — carpeta `/frontend`)
| Archivo | Descripción |
|---|---|
| `src/main.tsx` | Entry point React con `createRoot` |
| `src/App.jsx` | Componente raíz |
| `src/index.css` | Estilos globales estilo Booking.com |
| `src/pages/AtraccionesPage.jsx` | Página completa con Hero, buscador, filtros, grid, detalle |
| `src/components/Navbar.jsx` | Barra de navegación azul |
| `src/components/AtraccionCard.jsx` | Tarjeta de atracción con precio |
| `src/components/Footer.jsx` | Pie de página |
| `src/services/atraccionesApi.js` | Servicio Axios → `GET /api/v1/atracciones` |
| `.env` | `VITE_API_URL=http://localhost:3000/api/v1` |
| `tsconfig.json` | Configurado para React JSX + TypeScript |

---

## Cómo Levantar el Stack

```powershell
# Terminal 1
docker compose up -d

# Terminal 2 (raíz del proyecto)
npm run start:dev

# Terminal 3
cd frontend
npm run dev
```

- **Frontend:** http://localhost:5173
- **API REST:** http://localhost:3000/api/v1/atracciones
- **Swagger Docs:** http://localhost:3000/api/docs

---

## Criterios de Rúbrica Cubiertos

| Criterio | Estado | Evidencia |
|---|---|---|
| C03 - Marketplace Funcional | ✅ | UI de Atracciones en React consumiendo el backend |
| C04 - APIs Documentadas | ✅ | Swagger activo en `/api/docs` |
| C05 - Base de Datos Operativa | ✅ | 8 tablas core en PostgreSQL vía Docker |

---

## Preguntas para la Defensa (registradas en `context/preguntas.md`)
- ¿Qué es Axios y cómo funciona?
- ¿Por qué usamos Docker en lugar de instalar PostgreSQL directamente?
- ¿Qué es un BFF (Backend For Frontend) y cómo lo aplicamos?
