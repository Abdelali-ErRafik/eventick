# Watch CMI callbacks arrive, live.
#
# PowerShell has no tail/grep: Get-Content -Wait is the follow, and
# Select-String is the filter.
#
#   .\watch-cmi.ps1
#
# Ctrl+C to stop.

$log = "C:/Users/abdel/AppData/Local/Temp/claude/c--Users-abdel-OneDrive-Desktop-Storeino-Eventick/67468aa1-7949-4801-94d7-279aa4ed8da3/scratchpad/backend.log"

if (-not (Test-Path $log)) {
  Write-Host "Log not found. Is the backend running?" -ForegroundColor Red
  Write-Host "  $log" -ForegroundColor DarkGray
  exit 1
}

Write-Host ""
Write-Host "Watching for CMI callbacks..." -ForegroundColor Cyan
Write-Host "  settled  = approved, ticket issued" -ForegroundColor DarkGray
Write-Host "  declined = card refused (the integration still worked)" -ForegroundColor DarkGray
Write-Host "  REJECTED = hash mismatch — the key and .env disagree" -ForegroundColor DarkGray
Write-Host ""

Get-Content $log -Wait -Tail 50 | ForEach-Object {
  if ($_ -notmatch 'cmi|CMI') { return }

  # The log is JSON per line; show the message and the useful fields rather
  # than the whole object.
  try {
    $row = $_ | ConvertFrom-Json
    $msg = $row.msg
    if (-not $msg) { return }

    $colour = 'White'
    if ($msg -match 'settled')  { $colour = 'Green' }
    if ($msg -match 'declined') { $colour = 'Yellow' }
    if ($msg -match 'REJECTED|mismatch|REFUSED') { $colour = 'Red' }

    $extra = @()
    foreach ($k in 'orderId', 'gatewayRef', 'reference', 'code', 'response', 'oid') {
      if ($row.$k) { $extra += "$k=$($row.$k)" }
    }

    $time = if ($row.time) { [DateTimeOffset]::FromUnixTimeMilliseconds($row.time).LocalDateTime.ToString('HH:mm:ss') } else { '' }
    Write-Host ("{0}  {1}  {2}" -f $time, $msg, ($extra -join '  ')) -ForegroundColor $colour
  } catch {
    # Not JSON (a stack trace, say) — print it raw rather than swallowing it.
    Write-Host $_ -ForegroundColor DarkGray
  }
}
