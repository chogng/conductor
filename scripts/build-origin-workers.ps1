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
$scriptCsv = Join-Path $PSScriptRoot "build-origin-csv-worker.ps1"

if (-not (Test-Path -LiteralPath $scriptBatch)) {
  throw "Batch worker build script not found: $scriptBatch"
}
if (-not (Test-Path -LiteralPath $scriptZip)) {
  throw "ZIP worker build script not found: $scriptZip"
}
if (-not (Test-Path -LiteralPath $scriptCsv)) {
  throw "CSV worker build script not found: $scriptCsv"
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

Write-Host "[build-origin-workers] Building origin-zip-worker.exe ..."
& $scriptZip @commonArgs

Write-Host "[build-origin-workers] Building origin-csv-worker.exe ..."
& $scriptCsv @commonArgs

Write-Host "[build-origin-workers] All Origin workers built successfully."
