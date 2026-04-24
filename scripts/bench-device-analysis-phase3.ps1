param(
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$CrateDir = Join-Path $ProjectRoot "tools\rust-xls-bench"
$RequestsPath = Join-Path $ProjectRoot ".tooling\device-analysis-phase3-bench\requests.jsonl"
$ResultsPath = Join-Path $ProjectRoot ".tooling\device-analysis-phase3-bench\rust-results.jsonl"
$EngineExe = Join-Path $CrateDir "target\release\rust-xls-bench.exe"

if (-not (Test-Path -LiteralPath $RequestsPath)) {
  throw "Phase 3 benchmark requests were not prepared: $RequestsPath"
}

Push-Location $CrateDir
try {
  cargo build --quiet --release
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 3 Rust release build failed with exit code $LASTEXITCODE"
  }
  $startedAt = [System.Diagnostics.Stopwatch]::StartNew()
  $results = Get-Content -LiteralPath $RequestsPath -Raw | & $EngineExe --stdio-engine
  $startedAt.Stop()
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 3 Rust processing run failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$results | Set-Content -LiteralPath $ResultsPath -Encoding UTF8
Write-Host "[phase3-bench] rustProcessMs=$([Math]::Round($startedAt.Elapsed.TotalMilliseconds))"
Write-Host "[phase3-bench] wrote Rust results to $ResultsPath"
