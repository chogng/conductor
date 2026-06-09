param(
  [string]$TempPrefix = "conductor-build"
)

$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "install-windows-env.ps1") -TempPrefix $TempPrefix
