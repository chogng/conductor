param(
  [string]$ReleaseDir = "release"
)

$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "build-release-assets.ps1") -ReleaseDir $ReleaseDir
