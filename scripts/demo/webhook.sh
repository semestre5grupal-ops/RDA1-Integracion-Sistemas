#!/bin/bash
# ==============================================================================
# scripts/demo/webhook.sh
# Demostración de Ingesta Asimétrica de Webhooks Inbound con Firma HMAC-SHA256 (I06)
# Envía un CloudEvent firmado criptográficamente hacia POST /api/v2/webhooks/vuelos
# ==============================================================================

set -e

BASE_URL="${API_BASE_URL:-http://localhost:3000}"
SECRET="${WEBHOOK_SECRET_VUELOS:-demo-webhook-secret-vuelos-12345}"

echo "===================================================================="
echo "  DEMO: WEBHOOK INBOUND FIRMADO CON HMAC-SHA256 (CloudEvents v1.0)"
echo "  Target: ${BASE_URL}/api/v2/webhooks/vuelos"
echo "===================================================================="

# Generar UUID y Timestamp
UUID_VAL=$(node -e "console.log(require('crypto').randomUUID())")
CORR_ID="corr-webhook-$(node -e "console.log(Date.now())")"
NOW_ISO=$(node -e "console.log(new Date().toISOString())")

# Cuerpo del CloudEvent
BODY=$(cat <<EOF
{"specversion":"1.0","id":"${UUID_VAL}","source":"https://vuelos.booking.epn.edu.ec","type":"flight.schedule.delayed","time":"${NOW_ISO}","datacontenttype":"application/json","correlationid":"${CORR_ID}","data":{"flight_id":"vuelo-uiomanta-01","flight_number":"EQ-312","retraso_minutos":45,"motivo":"Mantenimiento meteorologico preventivo"}}
EOF
)

# Calcular firma HMAC-SHA256 en hexadecimal
SIGNATURE=$(node -e "
  const crypto = require('crypto');
  const body = process.argv[1];
  const secret = process.argv[2];
  const sig = crypto.createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('hex');
  process.stdout.write(sig);
" "$BODY" "$SECRET")

echo ""
echo "Enviando CloudEvent firmado..."
echo "Cabecera X-Webhook-Signature: sha256=${SIGNATURE}"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${BASE_URL}/api/v2/webhooks/vuelos" \
  -H "Content-Type: application/cloudevents+json" \
  -H "X-Webhook-Signature: sha256=${SIGNATURE}" \
  -H "X-Correlation-Id: ${CORR_ID}" \
  -d "$BODY")

BODY_RES=$(echo "$RESPONSE" | sed -e '$d')
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1 | cut -d':' -f2)

echo "Código HTTP recibido: ${HTTP_STATUS}"
echo "Respuesta del Receptor de Webhooks:"
echo "$BODY_RES"

if [ "$HTTP_STATUS" -eq 202 ]; then
  echo ""
  echo ">>> [ÉXITO] Webhook aceptado (202 Accepted) para procesamiento asíncrono."
  echo ">>> La firma HMAC-SHA256 fue validada contra el secreto del proveedor."
else
  echo ""
  echo ">>> [ALERTA] Estado inesperado: ${HTTP_STATUS}"
fi
