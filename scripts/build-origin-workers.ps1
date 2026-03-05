param(
  [string]$ProjectRoot = "",
  [string]$DistDir = "",
  [string]$VenvDir = "",
  [string]$PythonVersion = "3.11",
  [switch]$UsePinnedVersions
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$scriptBatch = Join-Path $PSScriptRoot "build-origin-batch-worker.ps1"
$scriptZip = Join-Path $PSScriptRoot "build-origin-zip-worker.ps1"

if (-not (Test-Path -LiteralPath $scriptBatch)) {
  throw "Batch worker build script not found: $scriptBatch"
}
if (-not (Test-Path -LiteralPath $scriptZip)) {
  throw "ZIP worker build script not found: $scriptZip"
}

$commonArgs = @{
  ProjectRoot = $ProjectRoot
}
if (-not [string]::IsNullOrWhiteSpace($DistDir)) {
  $commonArgs["DistDir"] = $DistDir
}
if (-not [string]::IsNullOrWhiteSpace($VenvDir)) {
  $commonArgs["VenvDir"] = $VenvDir
}
if (-not [string]::IsNullOrWhiteSpace($PythonVersion)) {
  $commonArgs["PythonVersion"] = $PythonVersion
}
if ($UsePinnedVersions) {
  $commonArgs["UsePinnedVersions"] = $true
}

Write-Host "[build-origin-workers] Building origin-batch-worker.exe ..."
& $scriptBatch @commonArgs
if ($LASTEXITCODE -ne 0) {
  throw "Batch worker build failed with exit code $LASTEXITCODE"
}

Write-Host "[build-origin-workers] Building origin-zip-worker.exe ..."
& $scriptZip @commonArgs
if ($LASTEXITCODE -ne 0) {
  throw "ZIP worker build failed with exit code $LASTEXITCODE"
}

Write-Host "[build-origin-workers] All Origin workers built successfully."
