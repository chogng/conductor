param(
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$CrateDir = Join-Path $ProjectRoot "conductor-rs\worker"
$RequestsPath = Join-Path $ProjectRoot ".tooling\rust-auto-extraction-compat\requests.jsonl"
$ResultsPath = Join-Path $ProjectRoot ".tooling\rust-auto-extraction-compat\rust-results.jsonl"
$RsWorkerExe = Join-Path $ProjectRoot "conductor-rs\target\release\rs-worker.exe"
$PackagedRsWorkerExe = Join-Path $ProjectRoot "workers\rs\rs-worker.exe"

if (-not (Test-Path -LiteralPath $RequestsPath)) {
  throw "Rust auto extraction requests were not prepared: $RequestsPath"
}

Push-Location $CrateDir
try {
  cargo build --quiet --release
  if ($LASTEXITCODE -ne 0) {
    throw "Rust auto extraction release build failed with exit code $LASTEXITCODE"
  }
  if (-not (Test-Path -LiteralPath $RsWorkerExe)) {
    $RsWorkerExe = $PackagedRsWorkerExe
  }
  $results = Get-Content -LiteralPath $RequestsPath -Raw | & $RsWorkerExe --stdio-worker
  if ($LASTEXITCODE -ne 0) {
    throw "Rust auto extraction compatibility run failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$results | Set-Content -LiteralPath $ResultsPath -Encoding UTF8
Write-Host "[rust-auto-compat] wrote Rust results to $ResultsPath"
