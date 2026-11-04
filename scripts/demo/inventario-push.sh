#!/bin/bash
# ==============================================================================
# scripts/demo/inventario-push.sh
# Demostración de Ingesta Asimétrica de Inventario (I09 — RDA2 §1, §3)
# Envía actualización de stock continuo vía REST alterno a POST /api/v2/inventory/push
# ==============================================================================

set -e

BASE_URL="${API_BASE_URL:-http://localhost:3000}"
API_KEY="${INVENTORY_API_KEY:-key-demo-dilan-12345}"
CORRELATION_ID="corr-inv-demo-$(date +%s)"

echo "===================================================================="
echo "  DEMO: INGESTA ASIMÉTRICA DE INVENTARIO CONTINUO (I09)"
echo "  Target: ${BASE_URL}/api/v2/inventory/push"
echo "  Correlation-ID: ${CORRELATION_ID}"
echo "===================================================================="

PAYLOAD='{
  "vertical": "ATRACCIONES",
  "item_id": "tour-mitad-del-mundo",
  "stock_disponible": 38,
  "precio_actualizado": 24.50,
  "timestamp": "'$(node -e "console.log(new Date().toISOString())")'"
}'

echo ""
echo "Enviando actualización de stock de tienda socia..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${BASE_URL}/api/v2/inventory/push" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: ${API_KEY}" \
  -H "X-Correlation-Id: ${CORRELATION_ID}" \
  -d "${PAYLOAD}")

BODY=$(echo "$RESPONSE" | sed -e '$d')
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1 | cut -d':' -f2)

echo "Código HTTP recibido: ${HTTP_STATUS}"
echo "Respuesta del Gateway:"
echo "$BODY"

if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 201 ]; then
  echo ""
  echo ">>> [ÉXITO] Stock asimilado en tiempo real en la pasarela de agregación."
else
  echo ""
  echo ">>> Código HTTP: ${HTTP_STATUS}"
fi
