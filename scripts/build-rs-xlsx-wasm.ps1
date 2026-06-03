param(
  [string]$ProjectRoot = "",
  [string]$TargetDir = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$CrateDir = Join-Path $ProjectRoot "conductor-rs\xlsx"
$CargoToml = Join-Path $CrateDir "Cargo.toml"

if (-not (Test-Path -LiteralPath $CargoToml)) {
  throw "Conductor xlsx Cargo.toml not found: $CargoToml"
}

if ([string]::IsNullOrWhiteSpace($TargetDir)) {
  $TargetDir = Join-Path $ProjectRoot ".tooling\conductor-rs-wasm-target"
}
if (-not [System.IO.Path]::IsPathRooted($TargetDir)) {
  $TargetDir = Join-Path $ProjectRoot $TargetDir
}

$cargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
if ($null -eq $cargoCmd) {
  throw "cargo is not available in PATH. Install Rust before building xlsx WASM."
}

$installedTargets = & rustup target list --installed
if (-not ($installedTargets -contains "wasm32-unknown-unknown")) {
  throw "Rust target wasm32-unknown-unknown is not installed. Run: rustup target add wasm32-unknown-unknown"
}

Push-Location $CrateDir
try {
  & $cargoCmd.Source build --release --target wasm32-unknown-unknown --target-dir $TargetDir
  if ($LASTEXITCODE -ne 0) {
    throw "xlsx WASM build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$sourceWasm = Join-Path (Join-Path $TargetDir "wasm32-unknown-unknown\release") "xlsx.wasm"
if (-not (Test-Path -LiteralPath $sourceWasm)) {
  throw "Built xlsx WASM not found: $sourceWasm"
}

$targetWasm = Join-Path $ProjectRoot "src\cs\workbench\services\analysisFile\browser\xlsx.wasm"
Copy-Item -LiteralPath $sourceWasm -Destination $targetWasm -Force
Write-Host "[build-rs-xlsx-wasm] Copied xlsx WASM to $targetWasm"
