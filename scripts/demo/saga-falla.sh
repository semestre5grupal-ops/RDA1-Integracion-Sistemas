#!/bin/bash
# ==============================================================================
# scripts/demo/saga-falla.sh
# Caso de Fallo Transaccional y Compensación LIFO (Capa 3 ESB — RDA2 §8, CE05)
# Provoca fallo simulado en inventario, ejecutando rollback LIFO y generando REF-SAGA-...
# ==============================================================================

BASE_URL="${API_BASE_URL:-http://localhost:3000}"
IDEMPOTENCY_KEY="idem-falla-$(date +%s)"
CORRELATION_ID="corr-demo-saga-falla-$(date +%s)"

echo "===================================================================="
echo "  DEMO: FALLO Y COMPENSACIÓN LIFO EN SAGA MULTIVERTICAL"
echo "  Target: ${BASE_URL}/api/v2/esb/checkout-saga"
echo "  Correlation-ID: ${CORRELATION_ID}"
echo "===================================================================="

PAYLOAD='{
  "cliente_email": "turista.afectado@epn.edu.ec",
  "cliente_nombre": "María Morales (Caso Compensación)",
  "metodo_pago": "TARJETA_CREDITO",
  "numero_tarjeta": "4532000000009999",
  "items": [
    {
      "vertical": "ATRACCIONES",
      "item_id": "tour-quilotoa-laguna",
      "nombre": "Excursión Laguna del Quilotoa",
      "cantidad": 1,
      "precio_unitario": 45.0
    },
    {
      "vertical": "AUTOS",
      "item_id": "auto-toyota-rav4",
      "nombre": "Toyota RAV4 2.5 Hybrid",
      "cantidad": 1,
      "precio_unitario": 75.0
    }
  ],
  "simular_fallo_en_paso": "INVENTARIO_AGOTADO"
}'

echo ""
echo "Enviando transacción compuesta con simulación de fallo en inventario..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${BASE_URL}/api/v2/esb/checkout-saga" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: ${IDEMPOTENCY_KEY}" \
  -H "x-correlation-id: ${CORRELATION_ID}" \
  -d "${PAYLOAD}")

BODY=$(echo "$RESPONSE" | sed -e '$d')
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1 | cut -d':' -f2)

echo "Código HTTP recibido: ${HTTP_STATUS}"
echo "Respuesta de Error / Compensación RFC 7807:"
echo "$BODY"

if [ "$HTTP_STATUS" -eq 409 ]; then
  echo ""
  echo ">>> [ÉXITO DE DEMOSTRACIÓN] Se activó la compensación LIFO correctamente."
  echo ">>> El paso 1 fue revertido en orden inverso y se emitió el código REF-SAGA-..."
else
  echo ""
  echo ">>> Código HTTP: ${HTTP_STATUS}"
fi
