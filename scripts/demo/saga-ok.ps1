<#
.SYNOPSIS
  scripts/demo/saga-ok.ps1
  Caso Feliz de Orquestación de Sagas Multivertical (Capa 3 ESB — RDA2 §8)
  Demuestra compra compuesta (Atracciones + Autos) con confirmación total
#>

param(
  [string]$BaseUrl = $env:API_BASE_URL
)

if (-not $BaseUrl) { $BaseUrl = "http://localhost:3000" }

$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$idempotencyKey = "idem-ok-$timestamp"
$correlationId = "corr-demo-saga-ok-$timestamp"

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  DEMO: SAGA MULTIVERTICAL EXITOSA (CASO FELIZ)" -ForegroundColor Cyan
Write-Host "  Target: $BaseUrl/api/v2/esb/checkout-saga" -ForegroundColor DarkGray
Write-Host "  Correlation-ID: $correlationId" -ForegroundColor DarkGray
Write-Host "====================================================================" -ForegroundColor Cyan

$payload = @{
  cliente_email = "turista.demo@epn.edu.ec"
  cliente_nombre = "Carlos Perez (Turista Demo)"
  metodo_pago = "TARJETA_CREDITO"
  numero_tarjeta = "4532000000001092"
  items = @(
    @{
      vertical = "ATRACCIONES"
      item_id = "tour-mitad-del-mundo"
      nombre = "Tour Ciudad Mitad del Mundo"
      cantidad = 2
      precio_unitario = 25.0
    },
    @{
      vertical = "AUTOS"
      item_id = "auto-chevrolet-onix"
      nombre = "Chevrolet Onix Sedán 1.0T"
      cantidad = 1
      precio_unitario = 35.0
    }
  )
} | ConvertTo-Json -Depth 5

$headers = @{
  "Content-Type" = "application/json"
  "idempotency-key" = $idempotencyKey
  "x-correlation-id" = $correlationId
}

Write-Host "`nEnviando transacción compuesta multivertical..." -ForegroundColor Yellow

try {
  $response = Invoke-RestMethod -Uri "$BaseUrl/api/v2/esb/checkout-saga" -Method Post -Headers $headers -Body $payload
  Write-Host "Código HTTP recibido: 200 OK" -ForegroundColor Green
  Write-Host "Respuesta del Orquestador:" -ForegroundColor White
  $response | ConvertTo-Json -Depth 6 | Write-Host
  Write-Host "`n>>> [ÉXITO] Saga completada exitosamente sin compensaciones." -ForegroundColor Green
  Write-Host ">>> Todos los servicios satélites y el cobro fueron confirmados." -ForegroundColor Green
} catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  Write-Host "Error en la petición (Código: $statusCode)" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
}
