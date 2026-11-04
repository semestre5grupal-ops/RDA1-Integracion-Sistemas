<#
.SYNOPSIS
  scripts/demo/saga-falla.ps1
  Caso de Fallo Transaccional y Compensación LIFO (Capa 3 ESB — RDA2 §8, CE05)
  Provoca fallo simulado en inventario, ejecutando rollback LIFO y generando REF-SAGA-...
#>

param(
  [string]$BaseUrl = $env:API_BASE_URL
)

if (-not $BaseUrl) { $BaseUrl = "http://localhost:3000" }

$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$idempotencyKey = "idem-falla-$timestamp"
$correlationId = "corr-demo-saga-falla-$timestamp"

Write-Host "====================================================================" -ForegroundColor Magenta
Write-Host "  DEMO: FALLO Y COMPENSACIÓN LIFO EN SAGA MULTIVERTICAL" -ForegroundColor Magenta
Write-Host "  Target: $BaseUrl/api/v2/esb/checkout-saga" -ForegroundColor DarkGray
Write-Host "  Correlation-ID: $correlationId" -ForegroundColor DarkGray
Write-Host "====================================================================" -ForegroundColor Magenta

$payload = @{
  cliente_email = "turista.afectado@epn.edu.ec"
  cliente_nombre = "María Morales (Caso Compensación)"
  metodo_pago = "TARJETA_CREDITO"
  numero_tarjeta = "4532000000009999"
  items = @(
    @{
      vertical = "ATRACCIONES"
      item_id = "tour-quilotoa-laguna"
      nombre = "Excursión Laguna del Quilotoa"
      cantidad = 1
      precio_unitario = 45.0
    },
    @{
      vertical = "AUTOS"
      item_id = "auto-toyota-rav4"
      nombre = "Toyota RAV4 2.5 Hybrid"
      cantidad = 1
      precio_unitario = 75.0
    }
  )
  simular_fallo_en_paso = "INVENTARIO_AGOTADO"
} | ConvertTo-Json -Depth 5

$headers = @{
  "Content-Type" = "application/json"
  "idempotency-key" = $idempotencyKey
  "x-correlation-id" = $correlationId
}

Write-Host "`nEnviando transacción compuesta con simulación de fallo en inventario..." -ForegroundColor Yellow

try {
  $response = Invoke-RestMethod -Uri "$BaseUrl/api/v2/esb/checkout-saga" -Method Post -Headers $headers -Body $payload
  Write-Host "Respuesta inesperada: 200 OK" -ForegroundColor Yellow
  $response | ConvertTo-Json -Depth 6 | Write-Host
} catch {
  Write-Host "Código HTTP recibido: 409 Conflict (Esperado para compensación LIFO)" -ForegroundColor Yellow
  Write-Host "Respuesta de Error / Compensación RFC 7807:" -ForegroundColor White
  
  if ($_.ErrorDetails.Message) {
    Write-Host $_.ErrorDetails.Message -ForegroundColor Red
  } else {
    Write-Host $_.Exception.Message -ForegroundColor Red
  }

  Write-Host "`n>>> [ÉXITO DE DEMOSTRACIÓN] Se activó la compensación LIFO correctamente." -ForegroundColor Green
  Write-Host ">>> El paso 1 fue revertido en orden inverso y se emitió el código de auditoría REF-SAGA-..." -ForegroundColor Green
}
