param(
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$WorkspaceDir = $ProjectRoot
$RsTargetDir = Join-Path $ProjectRoot ".build\cache\conductor-rs-cli-target"
$RequestsPath = Join-Path $ProjectRoot ".build\verify\rust-ss-auto\requests.jsonl"
$ResultsPath = Join-Path $ProjectRoot ".build\verify\rust-ss-auto\rust-results.jsonl"
$RsWorkerExe = Join-Path $RsTargetDir "release\conductor-rs.exe"
$PackagedRsWorkerExe = Join-Path $ProjectRoot "resources\bin\conductor-rs.exe"

if (-not (Test-Path -LiteralPath $RequestsPath)) {
  throw "Rust SS auto compatibility requests were not prepared: $RequestsPath"
}

Push-Location $WorkspaceDir
try {
  cargo build --quiet --release -p conductor-cli --bin conductor-rs --target-dir $RsTargetDir
  if ($LASTEXITCODE -ne 0) {
    throw "Rust SS auto release build failed with exit code $LASTEXITCODE"
  }
  $startedAt = [System.Diagnostics.Stopwatch]::StartNew()
  if (-not (Test-Path -LiteralPath $RsWorkerExe)) {
    $RsWorkerExe = $PackagedRsWorkerExe
  }
  $results = Get-Content -LiteralPath $RequestsPath -Raw | & $RsWorkerExe --stdio-worker
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
