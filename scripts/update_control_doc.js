const fs = require('fs');
const file = 'Faltantes RDA2/Atracciones individuales/CONTROL_INTEGRACIONES_SOCIOS_RDA2.md';
let c = fs.readFileSync(file, 'utf-8');

const newSection = `### 🟢 2.3. Daniel González — RutaLibre Renta de Autos (\`NODE_AUT_RUTALIBRE\`)
* **Estado:** Totalmente Operativo, Homologado y Certificado al 100%.
* **URL Base Azure:** \`https://rutalibre-autos-api.azurewebsites.net/api/v3\`
* **Health / Telemetría:** \`https://rutalibre-autos-api.azurewebsites.net/api/v3/health\` y \`/autos/health\` (Status: \`HEALTHY\`, 37 vehículos activos, latencia: ~21 ms, Circuit Breaker: \`CLOSED\`).
* **X-API-Key Registrada en Booking:** \`LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA\` (Confirmada y vinculada en \`config_proveedor\`).
* **Catálogo & Búsqueda:** \`GET /api/v3/autos\` y \`POST /api/v3/autos/search\` (Catálogo de 37 vehículos con filtrado por categoría SUV, compacto, transmisión y ubicación).
* **Pruebas Validadas:**
  - \`GET /health\` y \`/autos/health\` -> HTTP 200 OK (\`HEALTHY\`).
  - \`POST /autos/orders/create\` (Contrato v3 con Idempotency-Key UUID v4) -> HTTP 201 Created (Generó órdenes \`CARPA2MZ\` y \`CARV5PKW\` con voucher QR).
  - \`POST /autos/orders/:id/cancel\` -> HTTP 200 OK (Compensación Saga LIFO ejecutada: emitió reembolso total \`REF-AUTO-PA2MZ\` y liberó vehículo a \`DISPONIBLE\`).
  - **Regla Cooldown 2 Horas (ADR-004):** Si un auto se devuelve a las 13:00, reservas antes de las 15:00 son rechazadas con HTTP 409 (\`VEHICLE_IN_CLEANING_COOLDOWN\`).
  - **Sincronización de Stock HTTP Inbound:** \`POST https://booking-core-api.azurewebsites.net/api/v3/inventory/stock\` probado exitosamente con HTTP 200 (\`acknowledged: true\`).
* **Especificación para Avisos de Stock hacia Booking Central:**
  - **URL:** \`POST https://booking-core-api.azurewebsites.net/api/v3/inventory/stock\`
  - **Headers:** \`Content-Type: application/json\` y \`X-API-Key: LULUJlCwLfwSLh3dxfUZNngEGMtnb4rREAvQubkgdHA\`
  - **Body Canónico:**
    \`\`\`json
    {
      "service_id": "NODE_AUT_RUTALIBRE",
      "item_id": "auto-pdb-1517",
      "available_units": 1,
      "date": "2026-11-25",
      "time_slot": "DEFAULT"
    }
    \`\`\`
    *(Nota de Resiliencia: Booking también tolera alias como \`vehicle_id\`, \`auto_id\`, \`stock\` y \`cantidad\`)*.`;

const idx1 = c.indexOf('### 🟢 2.3. Daniel González');
const idx2 = c.indexOf('### 🟢 2.4. Mateo Morales');

if (idx1 !== -1 && idx2 !== -1) {
  c = c.slice(0, idx1) + newSection + '\n\n---\n\n' + c.slice(idx2);
  fs.writeFileSync(file, c, 'utf-8');
  console.log('Successfully updated CONTROL_INTEGRACIONES_SOCIOS_RDA2.md');
} else {
  console.error('Indices not found:', idx1, idx2);
}

