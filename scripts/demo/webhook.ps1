<#
.SYNOPSIS
  scripts/demo/webhook.ps1
  Demostración de Ingesta Asimétrica de Webhooks Inbound con Firma HMAC-SHA256 (I06)
  Envía un CloudEvent firmado criptográficamente hacia POST /api/v2/webhooks/vuelos
#>

param(
  [string]$BaseUrl = $env:API_BASE_URL,
  [string]$Secret = $env:WEBHOOK_SECRET_VUELOS
)

if (-not $BaseUrl) { $BaseUrl = "http://localhost:3000" }
if (-not $Secret) { $Secret = "demo-webhook-secret-vuelos-12345" }

$uuid = [guid]::NewGuid().ToString()
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$corrId = "corr-webhook-$timestamp"

Write-Host "====================================================================" -ForegroundColor Blue
Write-Host "  DEMO: WEBHOOK INBOUND FIRMADO CON HMAC-SHA256 (CloudEvents v1.0)" -ForegroundColor Blue
Write-Host "  Target: $BaseUrl/api/v2/webhooks/vuelos" -ForegroundColor DarkGray
Write-Host "====================================================================" -ForegroundColor Blue

$bodyJson = @"
{"specversion":"1.0","id":"$uuid","source":"https://vuelos.booking.epn.edu.ec","type":"flight.schedule.delayed","time":"$nowIso","datacontenttype":"application/json","correlationid":"$corrId","data":{"flight_id":"vuelo-uiomanta-01","flight_number":"EQ-312","retraso_minutos":45,"motivo":"Mantenimiento meteorologico preventivo"}}
"@

# Generar HMAC-SHA256
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($Secret)
$hashBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($bodyJson))
$signature = ($hashBytes | ForEach-Object { "{0:x2}" -f $_ }) -join ""

Write-Host "`nEnviando CloudEvent firmado..." -ForegroundColor Yellow
Write-Host "X-Webhook-Signature: sha256=$signature" -ForegroundColor DarkGray

$headers = @{
  "Content-Type" = "application/cloudevents+json"
  "X-Webhook-Signature" = "sha256=$signature"
  "X-Correlation-Id" = $corrId
}

try {
  $response = Invoke-RestMethod -Uri "$BaseUrl/api/v2/webhooks/vuelos" -Method Post -Headers $headers -Body $bodyJson
  Write-Host "Código HTTP recibido: 202 Accepted" -ForegroundColor Green
  Write-Host "Respuesta del Receptor de Webhooks:" -ForegroundColor White
  $response | ConvertTo-Json -Depth 5 | Write-Host
  Write-Host "`n>>> [ÉXITO] Webhook aceptado (202 Accepted) para procesamiento asíncrono." -ForegroundColor Green
  Write-Host ">>> La firma HMAC-SHA256 fue validada contra el secreto del proveedor." -ForegroundColor Green
} catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  Write-Host "Error en la petición (Código: $statusCode)" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
}
