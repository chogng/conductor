$ErrorActionPreference = "Stop"

$required = @(
  "build/github/verify-release-tag.ps1",
  "build/github/verify-source-repository.ps1",
  "build/github/upload-release-assets.ps1",
  "build/win32/install-windows-env.ps1",
  "build/win32/setup-windows-env.ps1",
  "build/win32/build-release-assets.ps1",
  "build/win32/prepare-release-assets.ps1",
  "build/win32/publish-updater-assets.ps1"
)

foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $PWD $path))) {
    throw "Missing expected script: $path"
  }
}

Write-Host "Script layout OK."
