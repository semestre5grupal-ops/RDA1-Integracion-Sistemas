#!/bin/bash
# ==============================================================================
# scripts/demo/saga-ok.sh
# Caso Feliz de Orquestación de Sagas Multivertical (Capa 3 ESB — RDA2 §8)
# Demuestra compra compuesta (Atracciones + Autos) con confirmación total
# ==============================================================================

set -e

BASE_URL="${API_BASE_URL:-http://localhost:3000}"
IDEMPOTENCY_KEY="idem-ok-$(date +%s)"
CORRELATION_ID="corr-demo-saga-ok-$(date +%s)"

echo "===================================================================="
echo "  DEMO: SAGA MULTIVERTICAL EXITOSA (CASO FELIZ)"
echo "  Target: ${BASE_URL}/api/v2/esb/checkout-saga"
echo "  Correlation-ID: ${CORRELATION_ID}"
echo "===================================================================="

PAYLOAD='{
  "cliente_email": "turista.demo@epn.edu.ec",
  "cliente_nombre": "Carlos Perez (Turista Demo)",
  "metodo_pago": "TARJETA_CREDITO",
  "numero_tarjeta": "4532000000001092",
  "items": [
    {
      "vertical": "ATRACCIONES",
      "item_id": "tour-mitad-del-mundo",
      "nombre": "Tour Ciudad Mitad del Mundo",
      "cantidad": 2,
      "precio_unitario": 25.0
    },
    {
      "vertical": "AUTOS",
      "item_id": "auto-chevrolet-onix",
      "nombre": "Chevrolet Onix Sedán 1.0T",
      "cantidad": 1,
      "precio_unitario": 35.0
    }
  ]
}'

echo ""
echo "Enviando transacción compuesta multivertical..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${BASE_URL}/api/v2/esb/checkout-saga" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: ${IDEMPOTENCY_KEY}" \
  -H "x-correlation-id: ${CORRELATION_ID}" \
  -d "${PAYLOAD}")

BODY=$(echo "$RESPONSE" | sed -e '$d')
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1 | cut -d':' -f2)

echo "Código HTTP recibido: ${HTTP_STATUS}"
echo "Respuesta del Orquestador:"
echo "$BODY"

if [ "$HTTP_STATUS" -eq 200 ]; then
  echo ""
  echo ">>> [ÉXITO] Saga completada exitosamente sin compensaciones."
  echo ">>> Todos los servicios satélites y el cobro fueron confirmados."
else
  echo ""
  echo ">>> [AVISO] Se recibió código HTTP ${HTTP_STATUS}."
fi
