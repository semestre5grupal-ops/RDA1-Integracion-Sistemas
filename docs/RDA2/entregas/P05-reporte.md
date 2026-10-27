# Reporte P05 — Facturación y Comprobantes Fiscales v2 (contrato OpenAPI)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/facturacion-openapi-v2.yaml` | Creado | Contrato OpenAPI 3.0.3 del microservicio de facturación fiscal (`MS_FAC`) y el orquestador agregador (`ORQ_FAC`). Documenta la ruta implementada (`POST /facturas/enviar`), la ruta agregada del ESB (`GET /esb/aggregate/facturas/{facturaId}`) y las rutas planificadas del contrato v1. |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P05-01 a H-P05-04 (discrepancia v1 vs código, generación client-side en jsPDF, persistencia relacional desvinculada y discrepancia histórica en `CAMBIOS_CONTRATOS.md`). |
| `docs/RDA2/entregas/P05-reporte.md` | Creado | Reporte formal de entrega de la tarea P05. |

---

## Cobertura de rutas y clasificación (código vs contrato v1 vs contrato v2)

| Ruta | Método | Handler / Origen | ¿Existe en código? | x-status | x-microservice | Justificación técnica |
|---|---|---|:---:|---|---|---|
| `/facturas/enviar` | `POST` | `FacturasController.enviar` | **Sí** | `implemented` | `MS_FAC` | Implementada en `src/modules/facturas/facturas.controller.ts`. Recibe PDF en Base64, valida `%PDF-` y límite de 2.5 MB, y reenvía por SMTP al correo extraído del token Supabase. |
| `/esb/aggregate/facturas/{facturaId}` | `GET` | `EsbController.getFacturaCompleta` | **Sí** | `implemented` | `ORQ_FAC` | Implementada en `src/modules/esb/esb.controller.ts` y consumida por GraphQL BFF (`obtenerFacturaCompleta`). Ensambla factura, cliente e ítems en memoria sin cross-schema SQL JOINs. |
| `/facturas` | `POST` | n/a (v1) | **No** | `planned` | `MS_FAC` | Soportada por la entidad `Factura` (`schema_facturacion.facturas_encabezado`) pero ausente en el controlador REST. Diseñada para emisión transaccional con `Idempotency-Key`. |
| `/facturas` | `GET` | n/a (v1) | **No** | `planned` | `MS_FAC` | No implementada en controlador. Soportada por el modelo de datos para listar facturas del usuario autenticado por estado y fecha. |
| `/facturas/{facturaId}` | `GET` | n/a (v1) | **No** | `planned` | `MS_FAC` | Consulta directa de factura cruda en `MS_FAC`. Enlazada con el agregador ESB en `/esb/aggregate/facturas/{facturaId}`. |
| `/facturas/{facturaId}/pdf` | `GET` | n/a (v1) | **No** | `planned` | `MS_FAC` | En la arquitectura actual el PDF se genera exclusivamente en el cliente browser mediante `jsPDF` (`frontend/src/utils/facturaPdf.js`). Se planifica para generación server-side. |
| `/facturas/{facturaId}/anular` | `PATCH` | n/a (v1) | **No** | `planned` | `MS_FAC` | Soportada por la columna `estado` de `Factura` (`'ANULADA_POR_COMPENSACION'`), pero ausente en el controlador REST. |

**Cobertura del controlador:** 1/1 rutas implementadas en `FacturasController` cubiertas (100%).  
**Cobertura agregador ESB:** 1/1 rutas fiscales de agregación en `EsbController` cubiertas (100%).  
**Rutas v1 planificadas:** 5/5 rutas evaluadas y clasificadas formalmente con evidencia técnica del modelo de datos.

---

## Validación (comando y resultado resumido)

```bash
npx --yes @redocly/cli@1 lint contracts/facturacion-openapi-v2.yaml
```

**Resultado:**
- **0 errores** (`Woohoo! Your API description is valid. 🎉`).
- **1 warning esperado:**
  - `no-server-example.com`: En `servers[0].url` (`http://localhost:3000/api/v2`), requerido por la convención de desarrollo local del proyecto.

---

## Supuestos y decisiones tomadas

1. **Cómo nace una factura hoy en el sistema (Evidencia empírica):**
   - El nacimiento del comprobante fiscal es **100% client-side**: se produce en el navegador web cuando el usuario finaliza una compra en cualquiera de las cuatro verticales turísticas.
   - La librería `frontend/src/utils/facturaPdf.js` compone el comprobante usando `jsPDF`. Genera un RUC institucional (`1722418520001`), razón social (`BOOKING ECUADOR S.A.`), formato correlativo SRI (`001-002-XXXXXXXXX`), una clave de acceso sintética de 49 dígitos generada con `Math.random()`, y desglosa el IVA 15% ecuatoriano dividiendo el total para 1.15 (`subtotal = total / 1.15`, `iva = total - subtotal`).
   - El usuario puede descargar el PDF directamente (`doc.save()`) o invocar el servicio de correo.
   - Para el correo, el frontend convierte el PDF a Base64 (`facturaComoBase64`) y llama a `POST /facturas/enviar`. El backend valida la firma mágica `%PDF-`, extrae el correo del token JWT de Supabase (`req.user.email`), sanitiza el PNR para el nombre del archivo (`Factura_<pnr>.pdf`), y lo despacha como adjunto por SMTP (Nodemailer hacia Gmail).
2. **Mapeo de `producto_id_externo` por vertical:**
   - Se verificó la consistencia de los identificadores externos que pueblan `FacturaItem.producto_id_externo`:
     - **Vuelos:** `bookingId` (de `vuelos-openapi-v2.yaml` / `schema_vuelos.vuelos_reservas.id`).
     - **Alojamientos:** `order_id` (de `alojamientos-openapi-v2.yaml` / `schema_alojamientos.alojamientos_reservas.id`).
     - **Atracciones:** `reservation_id` (de `atracciones-openapi-v2.yaml` / `schema_atracciones.atracciones_reservas.id`).
     - **Autos:** `order_id` / `pnr` (de `autos-openapi-v2.yaml` / `schema_autos.autos_reservas.id`).
3. **Mapeo de eventos EDA que deben disparar la facturación (Planned — Cátedra RDA2):**
   - Se documentaron formalmente los eventos CloudEvents v1.0 que en la arquitectura objetivo dispararán la emisión del comprobante:
     - `ec.edu.epn.booking.vuelos.booking.ticket_issued`
     - `ec.edu.epn.booking.alojamientos.order_created`
     - `ec.edu.epn.booking.atracciones.reservation_confirmed`
     - `ec.edu.epn.booking.autos.order.confirmed`
     - `ec.edu.epn.booking.saga.checkout_completed`
4. **Seguridad y Prevención de Abuso (Anti-Spam / Anti-Relay):**
   - En `POST /facturas/enviar` el cliente no puede especificar el campo `to` o destinatario en el body. El controlador extrae el destinatario exclusivamente de `req.user.email` (validado previamente por `SupabaseAuthGuard`). Si el token carece de correo, rechaza con HTTP 401. Esto previene que el servidor actúe como relay abierto de spam.
5. **Reutilización de componentes comunes (`components-v2.yaml`):**
   - El contrato reutiliza cabeceras `X-Correlation-Id`, `Idempotency-Key`, `Idempotent-Replayed`, esquema de seguridad `SupabaseBearer`, y respuestas de error RFC 7807 (`Problem400`, `Problem401`, `Problem403`, `Problem404`, `Problem409`, `Problem422`, `Problem502`, `Problem503`).

---

## Hallazgos registrados (IDs)

| ID | Severidad | Resumen del Hallazgo |
|---|---|---|
| **H-P05-01** | Alta | Discrepancia crítica entre contrato v1 (5 endpoints prometidos) y backend real (solo 1 endpoint `POST /facturas/enviar` expuesto). |
| **H-P05-02** | Media | Comprobantes fiscales generados en el navegador con `jsPDF` y claves de acceso SRI aleatorias; el backend solo actúa como pasarela SMTP sin generación server-side ni firma electrónica. |
| **H-P05-03** | Media | Tablas `schema_facturacion.facturas_encabezado` y `facturas_detalle` desconectadas de los flujos de compra (ni la Saga ni pagos insertan registros en la base de datos). |
| **H-P05-04** | Baja | Discrepancia en `contracts/CAMBIOS_CONTRATOS.md` que afirmaba completitud del contrato v1 bajo diseño API-First sin advertir la ausencia de implementación en NestJS. |

---

## Dudas para el revisor

1. ¿Se prevé para la fase final de integración que la Saga de checkout multivertical invoque directamente un servicio de persistencia en `schema_facturacion`, o se delegará completamente a los eventos asíncronos de RabbitMQ (`ec.edu.epn.booking.saga.checkout_completed`)?
2. Para la generación server-side de PDFs (`GET /facturas/{id}/pdf`), ¿se adoptará una librería como Puppeteer/PDFKit en NestJS, o se mantendrá la exportación client-side de jsPDF para no sobrecargar de renderizado la instancia de Render?
