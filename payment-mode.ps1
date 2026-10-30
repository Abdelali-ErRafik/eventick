# Switch the backend between the real CMI gateway and mock payments.
#
#   .\payment-mode.ps1 cmi     -> real gateway, for browser testing
#   .\payment-mode.ps1 mock    -> instant settlement, for running the suites
#   .\payment-mode.ps1         -> just report which is active
#
# Why this exists: with CMI live, POST /orders/:id/pay returns a redirect form
# instead of settling, so every suite that buys a ticket stops partway. That
# is a mode difference, not a regression -- but it is easy to mistake for one.
#
# It COMMENTS OUT the four CMI_* lines rather than swapping whole .env files,
# which is what it used to do. Swapping files meant switching to mock quietly
# dropped every setting the mock copy did not happen to have -- RESEND_API_KEY,
# the Bunny CDN credentials and the public URLs, thirteen keys in all. The
# symptom was emails silently not sending after a suite run, with nothing to
# connect it to the mode switch. Everything else in .env is now left alone.

param([string]$Mode = '')

$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'
$envFile = Join-Path $backend '.env'

# The keys that decide the mode. CMI_CLIENT_ID is the one lib/cmi.ts actually
# tests, but all four move together so a half-commented block cannot happen.
$cmiKeys = @('CMI_CLIENT_ID', 'CMI_STORE_KEY', 'CMI_CALLBACK_URL', 'CMI_GATEWAY_URL')

if (-not (Test-Path $envFile)) {
  Write-Host "No backend\.env found." -ForegroundColor Red
  exit 1
}

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
  $hasMail = Select-String -Path $envFile -Pattern '^RESEND_API_KEY=' -Quiet
  if ($hasMail) {
    Write-Host "  Email: RESEND_API_KEY is set -- mail is sent for real." -ForegroundColor DarkGray
  } else {
    Write-Host "  Email: no RESEND_API_KEY -- mail is logged, not sent." -ForegroundColor DarkGray
  }
  Write-Host ""
  Write-Host "  .\payment-mode.ps1 cmi    switch to the real gateway"
  Write-Host "  .\payment-mode.ps1 mock   switch to mock payments"
  Write-Host ""
  exit 0
}

# Read as raw lines and rewrite in place, so comments, blank lines and key
# order all survive. A parse-and-serialise round trip would reformat the file
# every switch and bury the real change in the diff.
$lines = Get-Content $envFile
$touched = 0

switch ($Mode.ToLower()) {
  'cmi' {
    $lines = $lines | ForEach-Object {
      $line = $_
      foreach ($key in $cmiKeys) {
        # Only a commented assignment, never prose that happens to mention it.
        if ($line -match "^#\s*($key=)") {
          $line = $line -replace "^#\s*", ""
          $script:touched++
          break
        }
      }
      $line
    }
    Set-Content -Path $envFile -Value $lines
    if ((Get-Mode) -ne 'cmi') {
      Write-Host "No commented CMI_* lines to restore in backend\.env." -ForegroundColor Red
      Write-Host "Add CMI_CLIENT_ID / CMI_STORE_KEY / CMI_CALLBACK_URL by hand." -ForegroundColor DarkGray
      exit 1
    }
    Write-Host "Switched to the REAL CMI gateway." -ForegroundColor Green
    Write-Host "  Check the tunnel is up before paying -- a stale CMI_CALLBACK_URL" -ForegroundColor DarkGray
    Write-Host "  means the payment succeeds at CMI and no ticket is issued." -ForegroundColor DarkGray
  }
  'mock' {
    $lines = $lines | ForEach-Object {
      $line = $_
      foreach ($key in $cmiKeys) {
        if ($line -match "^($key=)") {
          $line = "# $line"
          $script:touched++
          break
        }
      }
      $line
    }
    Set-Content -Path $envFile -Value $lines
    Write-Host "Switched to MOCK payments." -ForegroundColor Green
    Write-Host "  Checkout settles instantly. All suites can run." -ForegroundColor DarkGray
  }
  default {
    Write-Host "Unknown mode '$Mode'. Use 'cmi' or 'mock'." -ForegroundColor Red
    exit 1
  }
}

Write-Host "  $touched line(s) changed; every other setting left as it was." -ForegroundColor DarkGray
Write-Host ""
Write-Host "RESTART THE BACKEND -- tsx watch only watches src/, not .env." -ForegroundColor Yellow
Write-Host ""
