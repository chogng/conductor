param(
  [string]$ReleaseDir = "release"
)

$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "build-windows-release-assets.ps1") -ReleaseDir $ReleaseDir
