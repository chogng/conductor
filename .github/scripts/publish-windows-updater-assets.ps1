param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseTag,
  [string]$UpdateRepo = "chogng/conductor-update",
  [string]$ReleaseDir = "release"
)

$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "publish\publish-windows-updater-assets.ps1") -ReleaseTag $ReleaseTag -UpdateRepo $UpdateRepo -ReleaseDir $ReleaseDir
