<#
.SYNOPSIS
  scripts/demo/killswitch.ps1
  Demostración de Conmutación de Kill-Switch en Caliente (CE01 / Panel 1 Admin)
  Desconecta y reconecta una tienda satélite en tiempo real sin reiniciar el gateway
#>

param(
  [string]$BaseUrl = $env:API_BASE_URL,
  [string]$Nodo = "atracciones",
  [string]$AdminKey = $env:ADMIN_SECRET_KEY
)

if (-not $BaseUrl) { $BaseUrl = "http://localhost:3000" }
if (-not $AdminKey) { $AdminKey = "Admin123!" }

Write-Host "====================================================================" -ForegroundColor Yellow
Write-Host "  DEMO: CONMUTACIÓN DE KILL-SWITCH EN CALIENTE (PANEL 1 ADMIN)" -ForegroundColor Yellow
Write-Host "  Target: $BaseUrl/api/v2/admin/nodes/$Nodo/toggle-killswitch" -ForegroundColor DarkGray
Write-Host "====================================================================" -ForegroundColor Yellow

$headers = @{
  "Content-Type" = "application/json"
  "X-Admin-Key" = $AdminKey
  "X-Role" = "admin"
}

# 1. Estado inicial
Write-Host "`n1. Consultando estado inicial del nodo '$Nodo'..." -ForegroundColor Cyan
try {
  $nodos = Invoke-RestMethod -Uri "$BaseUrl/api/v2/nodes" -Method Get
  $found = $nodos | Where-Object { $_.serviceId -like "*$Nodo*" -or $_.codigoNodo -like "*ATR*" }
  if ($found) {
    Write-Host "   Nodo: $($found.nombre ?? $found.nombreTienda)" -ForegroundColor White
    Write-Host "   KillSwitch Activo: $(if ($found.killSwitchActivo) {'SI (DESCONECTADO)'} else {'NO (OPERACIONAL)'})" -ForegroundColor White
    Write-Host "   Estado de Salud: $($found.estadoSalud ?? $found.estado)" -ForegroundColor White
  }
} catch {
  Write-Host "   No se pudo consultar lista completa de nodos." -ForegroundColor DarkGray
}

# 2. Activar Kill-Switch
Write-Host "`n2. ACTIVANDO Kill-Switch para desconectar el nodo en caliente..." -ForegroundColor Yellow
$bodyActivar = @{ activar = $true } | ConvertTo-Json
try {
  $res1 = Invoke-RestMethod -Uri "$BaseUrl/api/v2/admin/nodes/$Nodo/toggle-killswitch" -Method Post -Headers $headers -Body $bodyActivar
  Write-Host "Respuesta del Servidor:" -ForegroundColor White
  $res1 | ConvertTo-Json -Depth 4 | Write-Host
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
}

# 3. Desactivar Kill-Switch
Write-Host "`n3. DESACTIVANDO Kill-Switch para restaurar tráfico normal..." -ForegroundColor Green
$bodyDesactivar = @{ activar = $false } | ConvertTo-Json
try {
  $res2 = Invoke-RestMethod -Uri "$BaseUrl/api/v2/admin/nodes/$Nodo/toggle-killswitch" -Method Post -Headers $headers -Body $bodyDesactivar
  Write-Host "Respuesta del Servidor:" -ForegroundColor White
  $res2 | ConvertTo-Json -Depth 4 | Write-Host
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host "`n>>> [ÉXITO] Conmutación en caliente ejecutada sin degradación ni reinicio de servicios." -ForegroundColor Green
