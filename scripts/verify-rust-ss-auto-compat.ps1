param(
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$CrateDir = Join-Path $ProjectRoot "conductor-rs\worker"
$RequestsPath = Join-Path $ProjectRoot ".tooling\rust-ss-auto-compat\requests.jsonl"
$ResultsPath = Join-Path $ProjectRoot ".tooling\rust-ss-auto-compat\rust-results.jsonl"
$EngineExe = Join-Path $ProjectRoot "conductor-rs\target\release\worker.exe"
$PackagedEngineExe = Join-Path $ProjectRoot "excel\bin\worker.exe"

if (-not (Test-Path -LiteralPath $RequestsPath)) {
  throw "Rust SS auto compatibility requests were not prepared: $RequestsPath"
}

Push-Location $CrateDir
try {
  cargo build --quiet --release
  if ($LASTEXITCODE -ne 0) {
    throw "Rust SS auto release build failed with exit code $LASTEXITCODE"
  }
  $startedAt = [System.Diagnostics.Stopwatch]::StartNew()
  if (-not (Test-Path -LiteralPath $EngineExe)) {
    $EngineExe = $PackagedEngineExe
  }
  $results = Get-Content -LiteralPath $RequestsPath -Raw | & $EngineExe --stdio-worker
  $startedAt.Stop()
  if ($LASTEXITCODE -ne 0) {
    throw "Rust SS auto compatibility run failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$results | Set-Content -LiteralPath $ResultsPath -Encoding UTF8
Write-Host "[rust-ss-auto-compat] rustMs=$([Math]::Round($startedAt.Elapsed.TotalMilliseconds))"
Write-Host "[rust-ss-auto-compat] wrote Rust results to $ResultsPath"
