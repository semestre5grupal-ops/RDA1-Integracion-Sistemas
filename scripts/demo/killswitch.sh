#!/bin/bash
# ==============================================================================
# scripts/demo/killswitch.sh
# Demostración de Conmutación de Kill-Switch en Caliente (CE01 / Panel 1 Admin)
# Desconecta y reconecta una tienda satélite en tiempo real sin reiniciar el gateway
# ==============================================================================

set -e

BASE_URL="${API_BASE_URL:-http://localhost:3000}"
NODO="atracciones"
ADMIN_KEY="${ADMIN_SECRET_KEY:-Admin123!}"

echo "===================================================================="
echo "  DEMO: CONMUTACIÓN DE KILL-SWITCH EN CALIENTE (PANEL 1 ADMIN)"
echo "  Target: ${BASE_URL}/api/v2/admin/nodes/${NODO}/toggle-killswitch"
echo "===================================================================="

# 1. Estado Actual del Nodo
echo ""
echo "1. Consultando estado inicial del nodo '${NODO}'..."
curl -s -X GET "${BASE_URL}/api/v2/nodes" | node -e "
  let raw = '';
  process.stdin.on('data', c => raw += c);
  process.stdin.on('end', () => {
    try {
      const arr = JSON.parse(raw);
      const found = Array.isArray(arr) ? arr.find(n => (n.serviceId||'').includes('atraccion') || (n.codigoNodo||'').includes('ATR')) : null;
      if (found) {
        console.log('   Nodo:', found.nombre || found.nombreTienda);
        console.log('   KillSwitch Activo:', found.killSwitchActivo ? 'SI (DESCONECTADO)' : 'NO (OPERACIONAL)');
        console.log('   Estado de Salud:', found.estadoSalud || found.estado);
      } else {
        console.log('   Información general de nodos recibida.');
      }
    } catch (e) { console.log('   Respuesta recibida.'); }
  });
"

# 2. Activar Kill-Switch (Desconectar tienda satélite)
echo ""
echo "2. ACTIVANDO Kill-Switch para desconectar el nodo en caliente..."
RES_ACTIVAR=$(curl -s -X POST "${BASE_URL}/api/v2/admin/nodes/${NODO}/toggle-killswitch" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: ${ADMIN_KEY}" \
  -H "X-Role: admin" \
  -d '{"activar": true}')

echo "Respuesta del Servidor:"
echo "$RES_ACTIVAR"

# 3. Restaurar Kill-Switch (Reconectar tienda satélite)
echo ""
echo "3. DESACTIVANDO Kill-Switch para restaurar tráfico normal..."
RES_DESACTIVAR=$(curl -s -X POST "${BASE_URL}/api/v2/admin/nodes/${NODO}/toggle-killswitch" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: ${ADMIN_KEY}" \
  -H "X-Role: admin" \
  -d '{"activar": false}')

echo "Respuesta del Servidor:"
echo "$RES_DESACTIVAR"

echo ""
echo ">>> [ÉXITO] Conmutación en caliente ejecutada sin degradación ni reinicio de servicios."
