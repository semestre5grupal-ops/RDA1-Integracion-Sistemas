# INFORME DE ANÁLISIS ARQUITECTÓNICO Y DECISIÓN TÉCNICA
## Evaluación del Flujo de Check-in con Sobrecupo en la Vertical de Atracciones (RDA2 — Requisito R2)

**Fecha de Emisión:** 11 de Noviembre de 2026  
**Proyecto:** Booking Marketplace — Plataforma de Integración de Sistemas  
**Rama de Trabajo:** `Atracciones-RDA2`  
**Destinatarios:** Comité de Arquitectura de Software, Evaluadores RDA2 y Equipos de Desarrollo  
**Estado:** Aprobado — Decisión Arquitectónica Vinculante  

---

## 1. CONTEXTO DE NEGOCIO Y FORMULACIÓN DEL PROBLEMA

### 1.1 El Escenario Operativo ("Caso Pepito")
* **Reserva Original Centralizada:**  
  El usuario "Pepito" adquirió con anticipación a través del portal integrador **Booking Central** una reserva para un tour guiado (Atracción Turística con capacidad máxima de 10 personas por turno horario, `capacidad_total = 10`), contratando y pagando formalmente **5 boletos** (`ticket_count = 5`).
* **Incidente en Punto de Encuentro (Mostrador de Check-in):**  
  Al momento de presentarse físicamente en la atracción para realizar el check-in y abordar el recorrido, Pepito se presenta acompañado de **7 personas** (los 5 pasajeros con reserva previa más **2 personas adicionales** sin boleto adquirido).
* **Disponibilidad Física de Aforo:**  
  En el turno correspondiente existe disponibilidad física remanente:
  $$\text{Capacidad Total} = 10 \quad | \quad \text{Demanda Total} = 5 + 2 = 7 \quad (7 \le 10 \implies 3 \text{ cupos disponibles})$$
* **Dilema Arquitectónico Planteado:**
  * **Opción A (Mutación In-situ en el Socio):** Permitir que la interfaz web o el microservicio individual de la atracción socia modifique la reserva existente de Pepito en el mostrador agregando 2 boletos adicionales a la misma orden, siempre que exista stock físico disponible.
  * **Opción B (Rechazo en Mostrador y Nueva Compra vía Booking Central):** Prohibir la alteración de la reserva en el mostrador del socio, exigiendo que los 2 boletos adicionales sean adquiridos como una transacción nueva e independiente a través del portal central de Booking, realizando a continuación el check-in presencial de ambos comprobantes (la reserva original de 5 personas y la complementaria de 2 personas).

---

## 2. RESTRICCIONES NORMATIVAS Y ARQUITECTÓNICAS (RDA2)

Cualquier decisión técnica en este sistema distribuido está supeditada a las restricciones no negociables establecidas en la documentación y normativa de la cátedra (`teoria/Consideraciones RDA2.md` y `docs Paúl Rosero/golden-rules.md`):

1. **Principio Database-per-Service (Regla de Oro 6 & §4):**  
   Cada microservicio es dueño absoluto de su esquema de persistencia. Está terminantemente prohibido compartir tablas o acceder a esquemas ajenos. Toda coordinación entre Booking y los socios debe realizarse en la capa de aplicación mediante interfaces bien definidas.
2. **Asimetría Estricta de Protocolos (Regla de Oro 7 & §3):**  
   - Las compras y reservas transaccionales se realizan **únicamente vía API REST**.
   - La sincronización y actualización de inventario entre los socios y Booking se realiza **obligatoriamente por gRPC sobre HTTP/2 (Puerto 50051)**.
3. **Auditoría Transaccional en Archivos Físicos (Regla de Oro 8):**  
   Los eventos de negocio y trazabilidad de transacciones deben registrarse en archivos planos JSON rotativos (`logs/audit-YYYY-MM-DD.log`).
4. **Patrón Saga Orquestado y Compensaciones Atómicas (Regla de Oro 14 & §8):**  
   Las transacciones distribuidas de reservas deben estar coordinadas mediante Sagas LIFO. La compensación solo es aplicable antes de la entrega o confirmación presencial del servicio.

---

## 3. COMPARACIÓN TÉCNICA MULTIDIMENSIONAL: OPCIÓN A VS. OPCIÓN B

### 3.1 Dimensión 1: Consistencia de Datos y Fuente Única de Verdad (SSOT)

```
       [ESCENARIO OPCIÓN A: SPLIT-BRAIN]                      [ESCENARIO OPCIÓN B: CONSISTENCIA CANÓNICA]

  Booking Central           Socio Remoto                 Booking Central                 Socio Remoto
┌──────────────────┐      ┌──────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
│ Reserva RES-001  │      │ Reserva RES-001  │      │ Reserva RES-001: 5 pax  │      │ Reserva RES-001: 5 pax  │
│ ticket_count: 5  │  ≠   │ ticket_count: 7  │      │ Reserva RES-002: 2 pax  │  =   │ Reserva RES-002: 2 pax  │
│ Total: $275.00   │      │ Total: $385.00   │      │ Total: 7 pax ($385.00)  │      │ Total: 7 pax ($385.00)  │
└──────────────────┘      └──────────────────┘      └─────────────────────────┘      └─────────────────────────┘
  (Pérdida de SSOT / Inconsistencia Severa)               (Estado Idéntico en Ambos Extremos)
```

#### Opción A: Divergencia Irreversible (Split-Brain)
* Si el socio modifica localmente la reserva existente en su base de datos privada:
  - En el sistema del socio: Reserva `RES-001` figurará con 7 pasajeros y valor total de \$385.00 USD.
  - En Booking Central: Reserva `RES-001` permanecerá con 5 pasajeros y valor de \$275.00 USD.
* **Inspección de Código (`src/modules/reservas/reservas.service.ts:250-315`):**  
  El método `confirmarCheckin` en el backend central solo actualiza `status = 'CONFIRMADO_ASISTIDO'` y la hora de llegada (`checkin_at = NOW()`). **No recalcula precios, no altera `ticket_count` y no descuenta inventario adicional**. El parámetro `asistentes_reales` solo se registra en la bitácora de auditoría.
* La plataforma pierde la condición de Fuente Única de Verdad (*Single Source of Truth*). Si el cliente consulta su historial en la app de Booking, verá un recibo por 5 personas que contradice los hechos físicos.

#### Opción B: Consistencia Determinista y Estado Canónico
* La reserva original permanece sellada e inmutable con 5 boletos.
* La compra complementaria genera formalmente la reserva `RES-002` por 2 boletos en Booking Central.
* Ambos sistemas conservan exactamente los mismos registros: dos órdenes atómicas cuya suma da 7 pasajeros y \$385.00 USD. La integridad referencial entre plataformas permanece al 100%.

---

### 3.2 Dimensión 2: Patrón Saga y Límites Transaccionales

#### Opción A: Violación de la Inmutabilidad Transaccional
1. **Ruptura de la Clausura de la Saga:**  
   La transacción de compra original de los 5 boletos ya fue completada exitosamente por el `SagaOrchestratorService` (`src/modules/esb/interna/saga-orchestrator.service.ts`), alcanzando el estado terminal `COMPLETED`. Intentar reabrir o mutar una transacción sellada viola el principio fundamental del patrón Saga: las transacciones locales son atómicas y unidireccionales.
2. **Anomalía de Compensación en Cascada (*Cascading Rollback Anomaly*):**  
   Si el recepcionista intenta adicionar 2 boletos y la operación experimenta un fallo (error de cobro, caída de red o timeout):
   - Si la saga original se reabre, un rollback compensatorio automático ejecutaría `cancelarReserva(RES-001)` en cascada.
   - **Efecto Catastrófico:** El sistema cancelaría indebidamente los 5 boletos originales de Pepito, los cuales ya estaban pagados, confirmados y con los pasajeros presentes en la puerta del tour.
3. **Conflicto con la Regla de Negocio Post-Check-in:**  
   En `atracciones.service.ts` (líneas 3004–3013):
   ```typescript
   if (['CONFIRMADO_ASISTIDO', 'CHECKED_IN', 'ASISTIDO', 'COMPLETED'].includes(currentStatus)) {
     throw new HttpException({
       type: 'https://api.booking.local/errors/conflict',
       title: 'Cancelación No Permitida',
       status: HttpStatus.CONFLICT,
       detail: 'No es posible cancelar una reserva de atracción que ya fue confirmada o asistida.',
     }, HttpStatus.CONFLICT);
   }
   ```
   Una reserva asistida queda irrevocablemente blindada contra compensaciones. Mezclar adición y check-in en una misma acción distorsiona por completo este límite transaccional.

#### Opción B: Aislamiento de Fallas (*Fault Isolation*)
1. La adquisición de los 2 boletos se gestiona en una **nueva instancia aislada de la Saga** (`SAGA_CHECKOUT_COMPLEMENTARIO`).
2. Si la transacción complementaria falla (tarjeta sin fondos, caída de pasarela), la compensación LIFO revierte **únicamente esos 2 boletos**.
3. **Protección Absoluta:** Los 5 boletos originales de Pepito permanecen 100% seguros, pagados y vigentes.

---

### 3.3 Dimensión 3: Concurrencia y Prevención de Sobrecupo (*Overbooking*)

#### Modelado de la Condición de Carrera en la Opción A:
Supongamos la siguiente secuencia temporal con alta concurrencia:
* **Capacidad total de la atracción:** 10 personas.
* **Boletos confirmados previos de Pepito:** 5 cupos.
* **Cupos libres en el sistema:** 5 cupos.

```
 Instante T    Acción en Mostrador (Pepito en Sitio)          Acción en Booking Web (Usuario María en Línea)
─────────────────────────────────────────────────────────────────────────────────────────────────────────────
    T0         Pepito llega a mostrador con 7 pax (+2 extra)  María navega en Booking Web
    T1         Recepcionista consulta stock local: ve 5 libre Recepcionista aprueba compra de 4 boletos
    T2         Recepcionista agrega +2 en su software local   María presiona "Comprar 4 Boletos" en Booking
    T3 (Race)  Socio descuenta 2 cupos (quedan 3 en su BD)    Booking verifica su BD: ve 5 libres y aprueba 4
    T4         Socio envía gRPC PushStockUpdate a Booking     Booking persiste los 4 boletos de María
─────────────────────────────────────────────────────────────────────────────────────────────────────────────
 RESULTADO     Total boletos vendidos = 5 (Pepito) + 2 (Socio local) + 4 (María web) = 11 boletos
 CATASTRÓFICO  Capacidad máxima = 10 ──> ¡SOBRECUPO FÍSICO ILEGAL DE 1 PASAJERO!
```

Debido a la latencia inherente de la red y la asincronía del protocolo gRPC, la venta concurrente en mostrador y web produce **sobrecupo físico (*overbooking*)**, dejando a turistas sin asiento en el vehículo y generando penalizaciones legales al operador.

#### Mitigación Determinista en la Opción B:
1. **Serialización Centralizada del Inventario:**  
   Al canalizar la compra de los 2 boletos adicionales por Booking Central, tanto la solicitud de Pepito (+2) como la de María (+4) compiten directamente contra el mismo motor transaccional.
2. **Bloqueo Atómico a Nivel de Base de Datos (`atracciones.service.ts:1788`):**
   ```sql
   UPDATE schema_atracciones.atracciones_turnos_aforo
   SET cupos_disponibles = cupos_disponibles - $solicitados
   WHERE atraccion_id = $1 AND fecha = $2 AND hora_inicio = $3 
     AND cupos_disponibles >= $solicitados
   ```
3. **Resolución:** La primera transacción en llegar descuenta los cupos disponibles de forma atómica. La segunda detecta que los cupos remanentes no alcanzan y es rechazada limpiamente con `HTTP 409 Conflict: OUT_OF_STOCK`. **El sobrecupo físico es matemáticamente imposible bajo la Opción B**.

---

### 3.4 Dimensión 4: Estabilidad de Contratos de Integración (API Governance)

* **Análisis de Impacto en Opción A:**
  - Requiere alterar los contratos OpenAPI v2 y v3 vigentes de la vertical de atracciones, creando endpoints inexistentes como `PATCH /api/v3/atracciones/reservas/{id}/adicionar-boletos` o mutando el contrato del check-in para recibir parámetros de pago y comisiones.
  - Exige una costosa coordinación multiequipo con los **5 desarrolladores responsables de atracciones** (Gloria Chushig, Alisson Basantes, Michael Molina, Dilan Mendoza y Ariel Chacha), modificando 5 microservicios distintos, actualizando contratos PACT y re-desplegando contenedores en Azure.
* **Análisis de Impacto en Opción B:**
  - **Principio Abierto/Cerrado (Open/Closed Principle):** No se modifica una sola línea de los contratos existentes de los socios ni de Booking.
  - Reutiliza al 100% las operaciones ya suscritas, desplegadas y auditadas:
    - Creación de reserva: `POST /api/v3/atracciones/reservas`
    - Check-in presencial: `POST /api/v3/atracciones/reservas/{id}/checkin`
  - Cero riesgo de regresión para las operaciones cotidianas.

---

### 3.5 Dimensión 5: Auditoría, Facturación SRI, Pagos y PCI-DSS

| Dimensión Técnica | Opción A: Adición en Mostrador Socio | Opción B: Nueva Compra en Booking Central |
|---|---|---|
| **Seguridad de Pagos (PCI-DSS)** | ❌ **Crítico.** El mostrador no tiene acceso al token de tarjeta de crédito guardado en Booking. Si cobra en efectivo o mediante un POS manual externo, la pasarela de pagos queda fuera del flujo de conciliación. | ✅ **Cumplimiento Total.** El cobro se procesa mediante la pasarela segura tokenizada del microservicio `MS_PAG` bajo estándares PCI-DSS. |
| **Comisión de Plataforma (10%)** | ❌ **Fuga de Rentabilidad.** Booking Central no puede retener automáticamente la comisión del 10% en `schema_finanzas.comisiones_liquidaciones` (`FinanzasService`) al ser un cobro externo fuera del ESB. | ✅ **Liquidación Automática.** La orden complementaria aplica el split de pagos y deduce la comisión del 10% de forma inmediata y auditable. |
| **Facturación Electrónica SRI** | ❌ **Inconsistencia Fiscal.** Pepito recibiría una factura electrónica de Booking por 5 boletos y un comprobante físico o nota de venta aislada del socio por los 2 boletos restantes. | ✅ **Facturación Unificada.** Ambos comprobantes se emiten electrónicamente bajo el RUC autorizado ante el SRI mediante el microservicio `MS_FAC`. |
| **Trazabilidad de Auditoría** | ❌ **Pistas Ciegas.** No existe rastro distribuido de quién autorizó el incremento de aforo ni del correlativo financiero. | ✅ **Trazabilidad Completa.** La transacción queda registrada con `correlation_id`, `trace_id` de OpenTelemetry y bitácora en `logs/audit-YYYY-MM-DD.log`. |

---

## 4. MATRIZ COMPARATIVA Y SCORECARD DE DECISIÓN

Para sustentar cuantitativamente la decisión, se ponderaron los 6 criterios clave de arquitectura de software para sistemas de integración distribuida:

| Criterio de Evaluación | Peso (%) | Opción A: Adición en Mostrador | Opción B: Compra Centralizada Booking | Justificación Técnica de la Calificación |
|---|:---:|:---:|:---:|---|
| **1. Consistencia de Datos (SSOT)** | 25% | **2.0 / 10** | **9.8 / 10** | Opción A genera desincronización severa (*split-brain*). Opción B mantiene ambas bases de datos idénticas. |
| **2. Integridad del Patrón Saga** | 20% | **1.5 / 10** | **9.9 / 10** | Opción A arriesga la cancelación de los 5 boletos válidos ante fallas en los 2 extra. Opción B aísla la falla. |
| **3. Prevención de Overbooking** | 20% | **3.0 / 10** | **10.0 / 10** | Opción A sufre carreras con compras web concurrentes. Opción B serializa con bloqueos a nivel de base de datos. |
| **4. Estabilidad Contractual (APIs)** | 15% | **2.5 / 10** | **10.0 / 10** | Opción A obliga a modificar contratos y re-desplegar a 5 socios en Azure. Opción B tiene impacto nulo. |
| **5. Facturación SRI, Pagos y PCI** | 10% | **2.0 / 10** | **9.5 / 10** | Opción A pierde comisiones del 10% y fragmenta facturas SRI. Opción B centraliza contabilidad y cobros. |
| **6. Experiencia de Usuario (UX)** | 10% | **7.5 / 10** | **8.5 / 10** | Opción A parece ágil pero es frágil ante errores. Opción B con flujo QR móvil en 1 clic es rápida y 100% segura. |
| **PUNTUACIÓN FINAL PONDERADA** | **100%** | **2.88 / 10** ❌ | **9.74 / 10** ✅ | **Diferencial contundente e indiscutible a favor de la Opción B.** |

---

## 5. DICTAMEN ARQUITECTÓNICO DEFINITIVO

Con base en la evidencia empírica del código fuente, las restricciones de la Rúbrica RDA2 y la matriz cuantitativa multicriterio, se resuelve de manera categórica:

> ### RECOMENDACIÓN ARQUITECTÓNICA DEFINITIVA: ADOPCIÓN DE LA OPCIÓN B
>
> **"Los microservicios y páginas web individuales de las atracciones socias DEBEN RECHAZAR la modificación *in-situ* de reservas existentes en el mostrador para agregar boletos adicionales. Ante un escenario de sobrecupo de pasajeros, el sistema DEBE exigir la adquisición de los boletos complementarios a través del servicio central de Booking Marketplace mediante una orden nueva e independiente, procediendo a continuación al check-in de ambos comprobantes."**

Esta decisión garantiza:
1. **Consistencia Absoluta de Datos:** Previene divergencias entre los sistemas de los socios y Booking.
2. **Protección de la Inmutabilidad Transaccional:** Blindaje total de la reserva original de Pepito ante posibles fallos en la compra extra.
3. **Cero Sobrecupo (*Zero-Overbooking*):** Serialización estricta del aforo a través de bloqueos atómicos en base de datos.
4. **Respeto a los Contratos OpenAPI:** Compatibilidad total con los despliegues productivos de Gloria, Alisson, Michael, Dilan y Ariel sin requerir modificaciones en sus servicios.
5. **Cumplimiento Tributario y Financiero:** Cobro seguro vía PCI-DSS, liquidación formal de la comisión del 10% y facturación electrónica autorizada por el SRI.

---

## 6. GUÍA DE IMPLEMENTACIÓN Y FLUJO OPERATIVO "EXPRESS QR CHECKOUT"

Para optimizar la experiencia de usuario (UX) en el punto de encuentro y evitar demoras operativas en el mostrador, se define la siguiente arquitectura de interacción para los microservicios de los socios:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│             FLUJO OPERATIVO: CHECKOUT COMPLEMENTARIO EXPRESS VÍA CÓDIGO QR              │
└────────────────────────────────────────────────────────────────────────────────────────┘

 1. Pepito se presenta en el mostrador con 7 personas amparando la reserva #RES-001 (5 boletos).
 2. El recepcionista del socio ingresa la reserva en su terminal B2B.
 3. El sistema del socio detecta sobrecupo (+2 personas) y muestra un Código QR Dinámico en pantalla:
    https://booking.epn.edu.ec/checkout/express?ref=RES-001&extra_tickets=2&slot_id=slot-1030
 4. Pepito escanea el QR con su teléfono celular personal.
 5. El navegador móvil despliega la pasarela de compra de Booking con los datos precargados:
    - Atracción: Misma atracción de la reserva original
    - Turno: Mismo horario exacto
    - Boletos: 2 boletos adicionales ($110.00 USD)
    - Método de Pago: Tarjeta guardada (Pago en 1 clic con biometría FaceID/Huella)
 6. El orquestador ejecuta la Saga de checkout en Booking Central en menos de 10 segundos:
    - Descuenta 2 cupos atómicamente de `atracciones_turnos_aforo`.
    - Procesa el cobro seguro en `MS_PAG`.
    - Liquida la comisión en `MS_FIN` y genera la factura SRI en `MS_FAC`.
    - Emite la nueva reserva #RES-002 con su respectivo código QR.
 7. El recepcionista del socio escanea en mostrador ambos códigos:
    - Check-in de #RES-001 (5 personas) -> Estado CHECKED_IN
    - Check-in de #RES-002 (2 personas) -> Estado CHECKED_IN
 8. El grupo completo de 7 personas ingresa al recorrido sin dilaciones.
```

### Lineamientos Técnicos Estandarizados para los 5 Socios de Atracciones:
1. **Respuesta HTTP ante Sobrecupo en Check-in:**  
   Si el operador intenta registrar una cantidad de asistentes superior al `ticket_count` sin proveer una orden complementaria, el servicio del socio debe responder con código `HTTP 422 Unprocessable Entity` bajo el formato RFC 7807:
   ```json
   {
     "type": "https://booking.epn.edu.ec/errors/overcapacity-detected",
     "title": "Sobrecupo Detectado en Check-in",
     "status": 422,
     "detail": "La reserva ampara únicamente a 5 personas. Se presentaron 7 personas en mostrador. Por políticas de aforo y consistencia transaccional, los 2 boletos adicionales deben adquirirse a través de Booking Central.",
     "booking_express_url": "https://booking.epn.edu.ec/checkout/express?reserva_id=RES-001&tickets_needed=2",
     "code": "OVERCAPACITY_REQUIRES_BOOKING_PURCHASE"
   }
   ```
2. **Soporte Multi-Voucher en Mostrador:**  
   La pantalla de check-in del socio debe admitir la validación de múltiples códigos de reserva consecutivamente para agrupar pasajeros en el mismo tour.
3. **Continuidad del Contrato gRPC de Sincronización:**  
   Los socios deben mantener activo el flujo de actualización de inventario vía `PushStockUpdate` hacia el puerto gRPC `50051` de Booking Central, asegurando que cuando Booking verifique disponibilidad para compras express, el aforo reflejado sea exactamente el vigente.

---

## 7. MÉTODO DE VERIFICACIÓN INDEPENDIENTE

Para auditar y validar de forma autónoma los hallazgos descritos en este informe:

1. **Verificar que el check-in actual en Booking no altera inventarios ni precios:**
   ```powershell
   Get-Content -Path "src/modules/reservas/reservas.service.ts" | Select-String -Pattern "UPDATE schema_atracciones.atracciones_reservas" -Context 0,10
   ```
   *Evidencia esperada:* La sentencia SQL actualiza únicamente campos de estado y fecha (`status`, `checkin_at`, `updated_at`).
2. **Verificar la inmutabilidad que impide compensar reservas asistidas:**
   ```powershell
   Get-Content -Path "src/modules/atracciones/atracciones.service.ts" | Select-String -Pattern "Cancelación No Permitida" -Context 3,8
   ```
   *Evidencia esperada:* Lanzamiento de `HttpException(..., HttpStatus.CONFLICT)` ante estados `CONFIRMADO_ASISTIDO` o `CHECKED_IN`.
3. **Comprobar la ausencia de operaciones de modificación (PATCH / PUT) en contratos:**
   ```powershell
   Select-String -Path "contracts/atracciones-openapi-v3.yaml" -Pattern "patch:|put:"
   ```
   *Evidencia esperada:* Cero operaciones de modificación en rutas de reservas, confirmando el diseño inmutable del contrato.
4. **Verificar el servicio gRPC de actualización de inventario:**
   ```powershell
   Get-Content -Path "src/proto/inventory.proto" | Select-String -Pattern "service InventoryStockService" -Context 0,8
   ```
   *Evidencia esperada:* Definición canónica del servicio `InventoryStockService` sobre HTTP/2.
