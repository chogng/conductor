$ErrorActionPreference = "Stop"

$required = @(
  ".github/scripts/install-windows-env.ps1",
  ".github/scripts/build-windows-release-assets.ps1",
  ".github/scripts/verify-release-tag.ps1",
  ".github/scripts/verify-source-repository.ps1",
  ".github/scripts/publish-windows-updater-assets.ps1"
)

foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $PWD $path))) {
    throw "Missing expected script: $path"
  }
}

Write-Host "Script layout OK."
