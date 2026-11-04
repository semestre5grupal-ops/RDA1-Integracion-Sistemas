<#
.SYNOPSIS
  scripts/demo/inventario-push.ps1
  Demostración de Ingesta Asimétrica de Inventario (I09 — RDA2 §1, §3)
  Envía actualización de stock continuo vía REST alterno a POST /api/v2/inventory/push
#>

param(
  [string]$BaseUrl = $env:API_BASE_URL,
  [string]$ApiKey = $env:INVENTORY_API_KEY
)

if (-not $BaseUrl) { $BaseUrl = "http://localhost:3000" }
if (-not $ApiKey) { $ApiKey = "key-demo-dilan-12345" }

$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$corrId = "corr-inv-demo-$timestamp"
$nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

Write-Host "====================================================================" -ForegroundColor Green
Write-Host "  DEMO: INGESTA ASIMÉTRICA DE INVENTARIO CONTINUO (I09)" -ForegroundColor Green
Write-Host "  Target: $BaseUrl/api/v2/inventory/push" -ForegroundColor DarkGray
Write-Host "  Correlation-ID: $corrId" -ForegroundColor DarkGray
Write-Host "====================================================================" -ForegroundColor Green

$payload = @{
  vertical = "ATRACCIONES"
  item_id = "tour-mitad-del-mundo"
  stock_disponible = 38
  precio_actualizado = 24.50
  timestamp = $nowIso
} | ConvertTo-Json

$headers = @{
  "Content-Type" = "application/json"
  "X-Api-Key" = $ApiKey
  "X-Correlation-Id" = $corrId
}

Write-Host "`nEnviando actualización de stock de tienda socia..." -ForegroundColor Yellow

try {
  $response = Invoke-RestMethod -Uri "$BaseUrl/api/v2/inventory/push" -Method Post -Headers $headers -Body $payload
  Write-Host "Código HTTP recibido: 200 OK" -ForegroundColor Green
  Write-Host "Respuesta del Gateway:" -ForegroundColor White
  $response | ConvertTo-Json -Depth 5 | Write-Host
  Write-Host "`n>>> [ÉXITO] Stock asimilado en tiempo real en la pasarela de agregación." -ForegroundColor Green
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
}
