# Switch the backend between the real CMI gateway and mock payments.
#
#   .\payment-mode.ps1 cmi     -> real gateway, for browser testing
#   .\payment-mode.ps1 mock    -> instant settlement, for running the suites
#   .\payment-mode.ps1         -> just report which is active
#
# Why this exists: with CMI live, POST /orders/:id/pay returns a redirect form
# instead of settling, so every suite that buys a ticket stops partway. That
# is a mode difference, not a regression -- but it is easy to mistake for one.

param([string]$Mode = '')

$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'
$envFile = Join-Path $backend '.env'
$cmiFile = Join-Path $backend '.env.cmi'
$mockFile = Join-Path $backend '.env.before-cmi'

function Get-Mode {
  if (Select-String -Path $envFile -Pattern '^CMI_CLIENT_ID=' -Quiet) { 'cmi' } else { 'mock' }
}

if (-not $Mode) {
  $current = Get-Mode
  Write-Host ""
  Write-Host "Payment mode: $current" -ForegroundColor Cyan
  if ($current -eq 'cmi') {
    Write-Host "  Real gateway. Browser testing works; most test suites cannot pass." -ForegroundColor DarkGray
  } else {
    Write-Host "  Mock. Checkout settles instantly; all suites pass." -ForegroundColor DarkGray
  }
  Write-Host ""
  Write-Host "  .\payment-mode.ps1 cmi    switch to the real gateway"
  Write-Host "  .\payment-mode.ps1 mock   switch to mock payments"
  Write-Host ""
  exit 0
}

# Keep a copy of whichever config is live, so switching never loses it.
$current = Get-Mode
if ($current -eq 'cmi') { Copy-Item $envFile $cmiFile -Force }

switch ($Mode.ToLower()) {
  'cmi' {
    if (-not (Test-Path $cmiFile)) {
      Write-Host "No saved CMI config at $cmiFile" -ForegroundColor Red
      Write-Host "Add CMI_CLIENT_ID / CMI_STORE_KEY / CMI_CALLBACK_URL to backend\.env by hand." -ForegroundColor DarkGray
      exit 1
    }
    Copy-Item $cmiFile $envFile -Force
    Write-Host "Switched to the REAL CMI gateway." -ForegroundColor Green
    Write-Host "  Check the tunnel is up before paying -- a stale CMI_CALLBACK_URL" -ForegroundColor DarkGray
    Write-Host "  means the payment succeeds at CMI and no ticket is issued." -ForegroundColor DarkGray
  }
  'mock' {
    if (-not (Test-Path $mockFile)) {
      Write-Host "No saved mock config at $mockFile" -ForegroundColor Red
      exit 1
    }
    Copy-Item $mockFile $envFile -Force
    Write-Host "Switched to MOCK payments." -ForegroundColor Green
    Write-Host "  Checkout settles instantly. All suites can run." -ForegroundColor DarkGray
  }
  default {
    Write-Host "Unknown mode '$Mode'. Use 'cmi' or 'mock'." -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host "RESTART THE BACKEND -- tsx watch only watches src/, not .env." -ForegroundColor Yellow
Write-Host ""
