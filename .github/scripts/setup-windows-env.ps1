param(
  [string]$CacheRoot = ".device"
)

$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "install-windows-env.ps1") -CacheRoot $CacheRoot
