param(
  [string]$ProjectRoot = "",
  [ValidateSet("process", "analysis")]
  [string]$RequestSet = "process"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$CrateDir = Join-Path $ProjectRoot "tools\conductor-engine"
$BenchDir = Join-Path $ProjectRoot ".tooling\device-analysis-phase3-bench"
if ($RequestSet -eq "analysis") {
  $RequestsPath = Join-Path $BenchDir "analysis-requests.jsonl"
  $ResultsPath = Join-Path $BenchDir "rust-analysis-results.jsonl"
  $TimingPath = Join-Path $BenchDir "rust-analysis-timing.json"
} else {
  $RequestsPath = Join-Path $BenchDir "requests.jsonl"
  $ResultsPath = Join-Path $BenchDir "rust-results.jsonl"
  $TimingPath = Join-Path $BenchDir "rust-process-timing.json"
}
$EngineExe = Join-Path $CrateDir "target\release\conductor-engine.exe"

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
$durationMs = [Math]::Round($startedAt.Elapsed.TotalMilliseconds)
@{
  durationMs = $durationMs
  requestSet = $RequestSet
} | ConvertTo-Json | Set-Content -LiteralPath $TimingPath -Encoding UTF8
Write-Host "[phase3-bench] rust$($RequestSet.Substring(0,1).ToUpper() + $RequestSet.Substring(1))Ms=$durationMs"
Write-Host "[phase3-bench] wrote Rust results to $ResultsPath"
