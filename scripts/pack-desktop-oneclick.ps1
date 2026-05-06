param(
  [switch]$DirOnly
)

$ErrorActionPreference = "Stop"

function Fail {
  param([string]$Message)
  throw "[pack-desktop-oneclick] $Message"
}

function Ensure-LastExitCodeZero {
  param(
    [int]$Code,
    [string]$Step
  )
  if ($Code -ne 0) {
    Fail "$Step failed with exit code $Code."
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$deviceDir = Join-Path $projectRoot ".device"
New-Item -ItemType Directory -Force -Path $deviceDir | Out-Null

# Keep all build caches/temp under .device/ (avoids %TEMP% / user profile caches).
$env:UV_CACHE_DIR = Join-Path $deviceDir "uv-cache"
$env:UV_PYTHON_INSTALL_DIR = Join-Path $deviceDir "uv-python"
$env:ELECTRON_CACHE = Join-Path $deviceDir "electron-cache"
$env:ELECTRON_BUILDER_CACHE = Join-Path $deviceDir "electron-builder-cache"
$env:npm_config_cache = Join-Path $deviceDir "npm-cache"

New-Item -ItemType Directory -Force -Path `
  $env:UV_CACHE_DIR, `
  $env:UV_PYTHON_INSTALL_DIR, `
  $env:ELECTRON_CACHE, `
  $env:ELECTRON_BUILDER_CACHE, `
  $env:npm_config_cache | Out-Null

$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($null -eq $npm) {
  Fail "npm is not installed or not in PATH."
}

if ($DirOnly) {
  $scriptName = "pack:desktop"
  Write-Host "[pack-desktop-oneclick] Running: npm run $scriptName"
  & npm.cmd run $scriptName
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "npm run $scriptName"
} else {
  Write-Host "[pack-desktop-oneclick] Running: npm run build:desktop"
  & npm.cmd run build:desktop
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "npm run build:desktop"

  Write-Host "[pack-desktop-oneclick] Running: npm run verify:py-worker"
  & npm.cmd run verify:py-worker
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "npm run verify:py-worker"

  $builder = Get-Command npx -ErrorAction SilentlyContinue
  if ($null -eq $builder) {
    Fail "npx is not installed or not in PATH."
  }

  $builderArgs = @(
    "electron-builder",
    "--config.nsis.oneClick=true",
    "--config.nsis.allowToChangeInstallationDirectory=false"
  )
  Write-Host "[pack-desktop-oneclick] Running: npx $($builderArgs -join ' ')"
  & npx.cmd @builderArgs
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "npx electron-builder"
}

$releaseDir = Join-Path $projectRoot "release"
if (Test-Path -LiteralPath $releaseDir) {
  $assets = Get-ChildItem -LiteralPath $releaseDir -File | Sort-Object -Property Name
  Write-Host "[pack-desktop-oneclick] Output: $releaseDir"
  foreach ($asset in $assets) {
    Write-Host "  - $($asset.Name)"
  }
} else {
  Write-Host "[pack-desktop-oneclick] Output directory not found: $releaseDir"
}
