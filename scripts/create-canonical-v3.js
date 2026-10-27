const fs = require('fs');
const path = require('path');

const srcPath = path.resolve('contracts/atracciones-openapi-v2.yaml');
let content = fs.readFileSync(srcPath, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

// 1. Title and Version
content = content.replace(
  /title: API de Integración y Catálogo de Atracciones Turísticas \(Descubre EC \/ Booking Prototipo RDA2\)/,
  'title: API de Integración y Catálogo de Atracciones Turísticas (Booking Prototipo RDA2 — OpenAPI v3 Canónico)'
);

content = content.replace(
  /version: 2\.0\.0/,
  'version: 3.0.0'
);

content = content.replace(
  /# Contrato Oficial de Integración — Vertical de Atracciones Turísticas \(RDA2\)/,
  '# Contrato Oficial de Integración v3.0.0 — Vertical de Atracciones Turísticas (RDA2 - Semana 9)'
);

// 2. Add v3 Preamble in description
const v3Preamble = `
    ## 1.1. Resoluciones y Decisiones Oficiales de Arquitectura v3.0.0 (Semana 9)
    Conforme a lo dictado en **Indicaciones semana 9.md** y las consideraciones de integración con los 5 compañeros:
    
    1. **Estandarización 100% en Inglés (Unificación Lingüística):**
       - Se suprimen las duplicidades de campos obligatorios en español. Todos los esquemas canónicos de entrada y salida establecen sus propiedades requeridas en **inglés** (\`name\`, \`short_description\`, \`price\`, \`date\`, \`time\`, \`slot_id\`, \`adult_count\`, \`customer\`, etc.).
       - Los atributos en español se conservan como alias opcionales en el backend para máxima tolerancia con código preexistente (*Ley de Postel: Sé estricto en lo que emites, tolerante en lo que recibes*).
    
    2. **Resolución de la Ambigüedad en Checkout (\`slot_id\` vs \`time\`):**
       - Se define formalmente que el **\`slot_id\` es la clave primaria de bloqueo atómico de aforo** en la base de datos (ej. \`slot-20261025-1030\`).
       - Los campos informativos \`date\` y \`time\` deben coincidir con dicho turno. Si el integrador envía un \`slot_id\` cuya fecha/hora difiere de los campos enviados, Booking rechazará la solicitud inmediatamente con **\`400 Bad Request\`** (\`code: SLOT_TIME_MISMATCH\`), garantizando integridad transaccional absoluta.
    
    3. **Contrato Riguroso de Errores para Sagas Distribuidas:**
       - **\`400 Bad Request\`:** Error sintáctico o inconsistencia (\`SLOT_TIME_MISMATCH\`, JSON inválido, tipos de datos erróneos).
       - **\`422 Unprocessable Entity\`:** Error de validación semántica previa (fecha en el pasado, \`adult_count < 1\`). **No activa compensación de Saga** porque no se inició el cobro.
       - **\`409 Conflict\` con \`code: OUT_OF_STOCK\`:** Conflicto concurrente de aforo agotado. **ÚNICO DETONADOR OFICIAL para que el orquestador de Booking dispare la compensación LIFO** (reversar cobros, cancelar vuelos/hoteles asociados).
    
    4. **Asimetría de Comunicación Híbrida (gRPC Inbound vs REST Outbound):**
       - **Tiendas de Atracciones ➔ Booking:** Transmiten variaciones de cupos en tiempo real mediante canal binario **gRPC Inbound** (puerto 50051, contrato \`src/proto/inventory.proto\`, servicio \`inventory.InventoryStockService\`).
       - **Booking ➔ Tiendas de Atracciones:** Cuando un usuario final compra en Booking, el ESB despacha la orden mediante **REST Outbound** (\`POST /reservas\`) a la \`baseUrlRest\` del socio correspondiente registrada en \`schema_proveedores.config_proveedor\`.
`;

content = content.replace(
  /---[\n\s]*## 2\. Arquitectura de Comunicación Híbrida/m,
  `${v3Preamble}\n    ---\n\n    ## 2. Arquitectura de Comunicación Híbrida`
);

// 3. Replace Servers block
const oldServers = `servers:
  - url: /api/v2
    description: API Gateway Booking Prototipo — Ruta base canónica v2 (Producción / Local)
  - url: https://booking.epn.edu.ec/api/v2
    description: Servidor de Producción Desplegado en Internet Público (HTTPS Let's Encrypt / Cloudflare)
  - url: http://localhost:3000/api/v2
    description: Entorno de Desarrollo Local del Gateway NestJS
  - url: /api/v1
    description: Ruta Legacy v1 (Compatibilidad hacia atrás con clientes anteriores)`;

const newServers = `servers:
  - url: /api/v3
    description: API Gateway Booking Prototipo — Ruta base canónica v3 (Producción / Local)
  - url: https://rda1-backend-integracion-sistemas.onrender.com/api/v3
    description: Servidor de Producción Central Desplegado en Render (HTTPS)
  - url: http://localhost:3000/api/v3
    description: Entorno de Desarrollo Local del Gateway NestJS (v3)
  - url: /api/v2
    description: Ruta de Compatibilidad v2 (Mantenida activa para integradores existentes)
  - url: /api/v1
    description: Ruta Legacy v1 (Compatibilidad hacia atrás)`;

content = content.replace(oldServers, newServers);

// 4. Update InclusionesFlags
content = content.replace(
  /    InclusionesFlags:\n      type: object\n      required:\n        - incluye_comida\n        - incluye_transporte\n        - incluye_guia\n      properties:\n        incluye_comida:\n          type: boolean\n          example: true\n        incluye_transporte:\n          type: boolean\n          example: true\n        incluye_guia:\n          type: boolean\n          example: true/,
  `    InclusionesFlags:
      type: object
      required:
        - includes_food
        - includes_transport
        - includes_guide
      properties:
        includes_food:
          type: boolean
          description: Whether food/snacks/tastings are included.
          example: true
        includes_transport:
          type: boolean
          description: Whether ground/panoramic transport is included.
          example: true
        includes_guide:
          type: boolean
          description: Whether certified official guide service is included.
          example: true
        incluye_comida:
          type: boolean
          description: Alias en español para retrocompatibilidad.
          example: true
        incluye_transporte:
          type: boolean
          description: Alias en español para retrocompatibilidad.
          example: true
        incluye_guia:
          type: boolean
          description: Alias en español para retrocompatibilidad.
          example: true`
);

// 5. Update TimeSlotItem
content = content.replace(
  /    TimeSlotItem:\n      type: object\n      required:\n        - slot_id\n        - time\n        - cupos_totales\n        - cupos_disponibles\n        - estado\n      properties:/,
  `    TimeSlotItem:
      type: object
      required:
        - slot_id
        - time
        - total_slots
        - available_slots
        - status
      properties:
        slot_id:
          type: string
          description: Unique slot identifier for atomic capacity locking.
          example: "slot-20261025-1030"
        time:
          type: string
          description: Slot time label in 12h or 24h format.
          example: "10:30 a.m."
        time_24h:
          type: string
          description: 24h normalized time format (HH:mm:ss).
          example: "10:30:00"
        total_slots:
          type: integer
          description: Total capacity allocated for this time slot.
          example: 25
        available_slots:
          type: integer
          description: Real-time available capacity for booking.
          example: 8
        status:
          type: string
          enum: [DISPONIBLE, ULTIMOS_CUPOS, AGOTADO]
          description: Real-time slot operational status.
          example: "DISPONIBLE"
        price_adult:
          type: number
          description: Unit ticket price for adult in USD.
          example: 30.00
        price_child:
          type: number
          description: Unit ticket price for child (50% off) in USD.
          example: 15.00`
);

// 6. Insert CreateReservaRequestV3 right before CreateReservaRequestV2
const v3RequestSchema = `    CreateReservaRequestV3:
      type: object
      required:
        - attraction_id
        - slot_id
        - date
        - time
        - adult_count
        - customer
        - payment_method
      properties:
        attraction_id:
          type: string
          description: Canonical attraction ID or slug to book.
          example: "PRhu4UBTWPBC"
        atraccion_id:
          type: string
          description: Spanish alias accepted for backwards compatibility.
          example: "PRhu4UBTWPBC"
        slot_id:
          type: string
          description: >-
            Unique time-slot identifier for atomic lock (e.g. 'slot-20261025-1030').
            Enforces strict matching: if date or time mismatch this slot_id,
            returns 400 Bad Request (SLOT_TIME_MISMATCH).
          example: "slot-20261025-1030"
        date:
          type: string
          format: date
          description: Tour date in ISO format YYYY-MM-DD.
          example: "2026-10-25"
        fecha:
          type: string
          format: date
          description: Spanish alias for tour date.
          example: "2026-10-25"
        time:
          type: string
          description: Canonical time string matching the slot_id (e.g. '10:30 a.m.' or '10:30:00').
          example: "10:30 a.m."
        hora:
          type: string
          description: Spanish alias for tour time.
          example: "10:30:00"
        time_24h:
          type: string
          pattern: '^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$'
          description: 24h normalized time format (HH:mm:ss).
          example: "10:30:00"
        adult_count:
          type: integer
          minimum: 1
          description: Adult ticket count (minimum 1).
          example: 2
        child_count:
          type: integer
          default: 0
          minimum: 0
          description: Child ticket count (50% discount).
          example: 1
        senior_count:
          type: integer
          default: 0
          minimum: 0
          description: Senior ticket count (30% discount).
          example: 0
        infant_count:
          type: integer
          default: 0
          minimum: 0
          description: Infant ticket count ($0 price, legal capacity reserved).
          example: 0
        special_requirements:
          type: string
          example: "Silla de ruedas para acceso y asistencia en inglés"
        customer:
          $ref: '#/components/schemas/CustomerContactDto'
        payment_method:
          type: object
          required:
            - method
          properties:
            method:
              type: string
              enum: [CREDIT_CARD, DEBIT_CARD, PAYPAL, TRANSFER]
              example: "CREDIT_CARD"
        correlation_id:
          type: string
          example: "cid-v3-8821a"
        idempotency_key:
          type: string
          example: "idem-v3-9932b"

`;

content = content.replace(
  /    CreateReservaRequestV2:/,
  () => `${v3RequestSchema}    CreateReservaRequestV2:`
);

// 7. Add specific RFC 7807 Error schemas
const errorSchemas = `    SlotMismatchProblem:
      type: object
      required:
        - type
        - title
        - status
        - detail
        - code
        - instance
      properties:
        type:
          type: string
          example: "https://booking.epn.edu.ec/errors/slot-mismatch"
        title:
          type: string
          example: "Inconsistencia de Franja Horaria (Slot Mismatch)"
        status:
          type: integer
          example: 400
        detail:
          type: string
          example: "El slot_id 'slot-20261025-1030' corresponde a las 10:30:00 del 2026-10-25, pero se envió 'time': '14:00:00'."
        instance:
          type: string
          example: "/api/v3/atracciones/reservas"
        code:
          type: string
          example: "SLOT_TIME_MISMATCH"
        correlation_id:
          type: string
          example: "cid-v3-error-1"
        timestamp:
          type: string
          format: date-time
          example: "2026-10-26T20:20:00Z"

    OutOfStockProblem:
      type: object
      required:
        - type
        - title
        - status
        - detail
        - code
        - instance
      properties:
        type:
          type: string
          example: "https://booking.epn.edu.ec/errors/sin-cupos"
        title:
          type: string
          example: "Cupos Agotados para el Turno Horario (Saga Compensation Trigger)"
        status:
          type: integer
          example: 409
        detail:
          type: string
          example: "No existen suficientes cupos disponibles en el turno seleccionado. Activa compensación LIFO en Saga."
        instance:
          type: string
          example: "/api/v3/atracciones/reservas"
        code:
          type: string
          example: "OUT_OF_STOCK"
        correlation_id:
          type: string
          example: "corr-stock-out-1"
        timestamp:
          type: string
          format: date-time
          example: "2026-10-26T20:20:00Z"

    UnprocessableEntityProblem:
      type: object
      required:
        - type
        - title
        - status
        - detail
        - code
        - instance
      properties:
        type:
          type: string
          example: "https://booking.epn.edu.ec/errors/unprocessable-entity"
        title:
          type: string
          example: "Validación Semántica Fallida (No Saga Compensation)"
        status:
          type: integer
          example: 422
        detail:
          type: string
          example: "La fecha de la reserva no puede ser en el pasado o la cantidad de boletos no es válida."
        instance:
          type: string
          example: "/api/v3/atracciones/reservas"
        code:
          type: string
          example: "SEMANTIC_VALIDATION_FAILED"
        correlation_id:
          type: string
          example: "corr-val-error-1"
        timestamp:
          type: string
          format: date-time
          example: "2026-10-26T20:20:00Z"

`;

content = content.replace(
  /    ProblemDetails:/,
  () => `${errorSchemas}    ProblemDetails:`
);

// 8. Update POST /atracciones/reservas to reference CreateReservaRequestV3
content = content.replace(
  /\$ref: '#\/components\/schemas\/CreateReservaRequestV2'/,
  "$ref: '#/components/schemas/CreateReservaRequestV3'"
);

// Save canonical v3 contract
const targetPath = path.resolve('contracts/atracciones-openapi-v3.yaml');
fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully created contracts/atracciones-openapi-v3.yaml, size:', content.length);
