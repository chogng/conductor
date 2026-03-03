$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Path $PSScriptRoot -Parent
$hostIp = if ($env:DEV_HOST) { $env:DEV_HOST } else { "127.0.0.1" }
$basePort = if ($env:DEV_PORT) { [int]$env:DEV_PORT } else { 5174 }
$ports = @($basePort, $basePort + 1, $basePort + 2)

foreach ($port in $ports) {
  $connections = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
  if (-not $connections) {
    continue
  }

  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  if (-not $pids) {
    continue
  }

  Write-Host "[dev-electron] Releasing $hostIp`:$port (PIDs: $($pids -join ', '))"
  foreach ($pid in $pids) {
    try { Stop-Process -Id $pid -ErrorAction SilentlyContinue } catch {}
  }

  Start-Sleep -Milliseconds 800

  $stuck = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  if ($stuck) {
    Write-Host "[dev-electron] Force killing stuck process on $hostIp`:$port"
    foreach ($pid in $stuck) {
      try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } catch {}
    }
  }
}

& node (Join-Path $rootDir "scripts/dev-electron.mjs")
