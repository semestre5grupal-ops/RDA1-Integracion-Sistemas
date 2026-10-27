# Reporte P17 — Auditoría Transaccional y Forense (`MS_AUD`)

## Archivos creados o modificados

| Archivo | Acción | Descripción |
|---|---|---|
| `contracts/auditoria-openapi-v2.yaml` | Creado | Contrato OpenAPI 3.0.3 del microservicio `MS_AUD` (Auditoría Transaccional y Forense). Formaliza la distinción entre auditoría de negocio (tablas en `schema_auditoria`) y logs técnicos (archivos físicos rotativos JSONL según ADR-003), consultas de "quién compró", acciones de admin con snapshots comparativos, expedientes forenses de Sagas LIFO y enlace con P07. |
| `docs/RDA2/HALLAZGOS_CONTRATOS.md` | Modificado | Registro de hallazgos H-P17-01 a H-P17-04 (inexistencia del microservicio `MS_AUD` dedicado en `src/modules/`, falta de persistencia de transacciones de compra en `schema_auditoria`, desconexión del consumidor de Kafka `cg-audit-analytics`, y ausencia de snapshots estructurados de cambios administrativos en base de datos). |
| `docs/RDA2/entregas/P17-reporte.md` | Creado | Reporte formal de entrega de la tarea P17. |

---

## Cobertura de rutas (controlador vs contrato)

El contrato documenta tanto las rutas existentes en el controlador administrativo (enlazadas a P07) como las rutas objetivo planificadas para `MS_AUD` bajo `/auditoria`:

| Método | Ruta | Handler en Código | En el contrato | x-status | Microservicio |
|---|---|---|:---:|:---:|---|
| `GET` | `/auditoria/transacciones` | `n/a` (planned para `MS_AUD`) | Sí (`auditoria-openapi-v2.yaml`) | `planned` | `MS_AUD` |
| `GET` | `/auditoria/admin` | `n/a` (planned para `MS_AUD`) | Sí (`auditoria-openapi-v2.yaml`) | `planned` | `MS_AUD` |
| `GET` | `/auditoria/sagas` | `n/a` (planned para `MS_AUD`) | Sí (`auditoria-openapi-v2.yaml`) | `planned` | `MS_AUD` |
| `GET` | `/auditoria/sagas/{correlationId}` | `n/a` (planned para `MS_AUD`) | Sí (`auditoria-openapi-v2.yaml`) | `planned` | `MS_AUD` |
| `POST` | `/auditoria/transacciones/ingesta`| `n/a` (worker/ingesta interna) | Sí (`auditoria-openapi-v2.yaml`) | `planned` | `MS_AUD` |
| `GET` | `/admin/auditoria` | `AdminController.getAuditoria` | Sí (Enlace P07 / `admin-audit.service.ts`) | `implemented` | `MS_AUD` |
| `POST` | `/admin/auditoria` | `AdminController.registrarAuditoria`| Sí (Enlace P07 / `admin-audit.service.ts`) | `implemented` | `MS_AUD` |

---

## Distinción Clave: Auditoría de Negocio vs Logs Técnicos (ADR-003)

1. **Auditoría de Negocio (Persistencia en PostgreSQL `schema_auditoria`):**
   * Almacena hechos comerciales y transaccionales con relevancia legal, fiscal y de seguridad: quién compró (`cliente_id`, monto, fecha, IP, `correlation_id`), qué administrador conmutó kill-switches o aprobó liquidaciones (con snapshots del estado `antes` y `despues`), y la bitácora de transacciones Saga con detalle de pasos y compensaciones LIFO.
   * Totalmente consultable mediante sentencias SQL, filtros y paginación por cursor.
2. **Logs Técnicos y Trazabilidad (Archivos Físicos Planos `logs/*.log`):**
   * Almacena tráfico de red perimetral, latencias en milisegundos, pings de sondeo gRPC en puerto 50051, cabeceras W3C (`traceparent`, `span_id`) y volcados de errores no controlados.
   * **Mandato de Cátedra y ADR-003:** **Cero logs técnicos en la base de datos.** Residen exclusivamente en el disco del servidor mediante `winston-daily-rotate-file` con retención de 14 días para no degradar el pool de conexiones de Supabase.

---

## Matriz Comparativa: "Cuál Responde Qué"

| Endpoint | Microservicio | Fuente de Datos Primaria | Propósito y Contenido Principal |
|---|---|---|---|
| `GET /admin/auditoria` | `Admin` / P07 | Streaming de archivos físicos rotativos `logs/audit-*.log` | Bitácora técnica y administrativa en tiempo real registrada por `WinstonPhysicalLoggerService`. |
| `GET /esb/sagas/{id}` | `MS_ESB` / P01 | Memoria / Tabla activa `saga_transacciones` | Estado operativo de la orquestación en caliente y coordinación de compensaciones inmediatas. |
| `GET /auditoria/transacciones` | `MS_AUD` / P17 | Tabla `schema_auditoria.auditoria_transaccional` | Historial forense de compras B2C/B2B (quién compró, montos, IPs, paginación por cursor). |
| `GET /auditoria/admin` | `MS_AUD` / P17 | Tabla `schema_auditoria.auditoria_transaccional` | Historial de mutaciones operativas de administradores con **snapshot anterior/posterior**. |
| `GET /auditoria/sagas/{id}` | `MS_AUD` / P17 | Tablas `saga_transacciones` + `saga_pasos_journal` | Detalle forense histórico post-mortem de fallas transaccionales y pasos revertidos. |
| `GET /observabilidad/telemetry` | `MS_AUD` / P08 | Tabla `telemetry_events` / Logs de red | Métricas de navegación de usuario, conversiones del embudo y latencias APM. |

---

## Políticas de Privacidad y Redacción de Datos Sensibles

1. **Datos Financieros:** Los números de tarjeta de crédito (PAN) **nunca** se almacenan completos en `detalles_json`; viajan enmascarados (ej. `4500********9012`). Las claves de acceso y tokens JWT son redactados antes de la persistencia.
2. **Dirección IP de Origen:** La dirección IP de origen (`ip_origen`) es considerada información reservada y se expone exclusivamente a usuarios autenticados con rol `ADMIN`.

---

## Validación

Comando ejecutado:
```bash
npx --yes @redocly/cli@1 lint contracts/auditoria-openapi-v2.yaml
```

### Resultado de la Validación Sintáctica

```text
validating contracts/auditoria-openapi-v2.yaml...
[1] contracts/auditoria-openapi-v2.yaml:106:10 at #/servers/0/url
Server `url` should not point to example.com or localhost.
Warning was generated by the no-server-example.com rule.

contracts/auditoria-openapi-v2.yaml: validated in 63ms
Woohoo! Your API description is valid. 🎉
You have 1 warning.
```

- **0 errores** (`Your API description is valid. 🎉`).
- **1 warning** permitido por la regla común (apuntamiento de servidor local `localhost:3000`).

### Comprobación de Integridad de Código Fuente (`src/` intacto)

Comando ejecutado:
```bash
git diff --stat src/
```
**Resultado:** Sin salida (`0` modificaciones en `src/`).

---

## Supuestos y decisiones tomadas

1. **Escritura No Pública en `schema_auditoria`:**
   - Se estableció que la auditoría de negocio no se escribe mediante endpoints públicos del frontend, sino a través de eventos asíncronos procesados por el consumidor de Kafka `cg-audit-analytics` (Blueprint §7.4) o llamadas internas del ESB.
2. **Paginación por Cursor Temporal:**
   - Para las consultas forenses masivas de transacciones (`GET /auditoria/transacciones`), se adoptó paginación por cursor basada en timestamp ISO 8601 (`cursor`), garantizando consultas de alto rendimiento indexadas por `created_at`.
3. **Aislamiento Total de Esquemas:**
   - La tabla `schema_auditoria.auditoria_transaccional` mantiene claves lógicas (`usuario_id`, `registro_id`) sin foreign keys físicas hacia `schema_clientes` ni esquemas de verticales, cumpliendo estrictamente con el principio Database-per-Service.

---

## Hallazgos registrados (IDs)

* **H-P17-01 (Severidad Alta):** Inexistencia del microservicio `MS_AUD` dedicado en `src/modules/` (sin módulo ni endpoints `/auditoria/**`).
* **H-P17-02 (Severidad Alta):** Falta de persistencia de transacciones de compra en `schema_auditoria.auditoria_transaccional` (el sistema no asienta quién compró y escanea tablas ajenas).
* **H-P17-03 (Severidad Media):** Desconexión del consumidor de Apache Kafka (`cg-audit-analytics`) para alimentar la tabla de auditoría.
* **H-P17-04 (Severidad Media):** Ausencia de snapshots estructurados de cambios administrativos en base de datos (`antes`/`despues`).

---

## Dudas para el revisor

1. ¿Se debe migrar la lectura de `GET /admin/auditoria` en `AdminDashboard.jsx` para que consuma prioritariamente `GET /api/v2/auditoria/admin` desde PostgreSQL o se mantendrá el streaming desde archivos planos?
2. ¿Debe el consumidor de Kafka `cg-audit-analytics` en la fase de implementación I04 descartar transacciones duplicadas basándose en el campo `correlation_id` como clave primaria de idempotencia?
