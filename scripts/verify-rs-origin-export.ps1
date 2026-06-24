param(
  [string]$ProjectRoot = "",
  [ValidateSet("prepare", "process", "export")]
  [string]$Mode = "process"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$WorkspaceDir = $ProjectRoot
$RsTargetDir = Join-Path $ProjectRoot ".build\cache\conductor-rs-cli-target"
$RsWorkerExe = Join-Path $RsTargetDir "release\conductor-rs.exe"
$PackagedRsWorkerExe = Join-Path $ProjectRoot "resources\bin\conductor-rs.exe"
$BenchDir = Join-Path $ProjectRoot ".build\verify\rust-origin-export"
$PrepareRequestsPath = Join-Path $BenchDir "prepare-requests.jsonl"
$PrepareResultsPath = Join-Path $BenchDir "prepare-results.jsonl"
$ProcessRequestsPath = Join-Path $BenchDir "process-requests.jsonl"
$ProcessResultsPath = Join-Path $BenchDir "process-results.jsonl"
$ExportRequestsPath = Join-Path $BenchDir "export-requests.jsonl"
$ExportResultsPath = Join-Path $BenchDir "export-results.jsonl"

if ($Mode -eq "prepare" -and -not (Test-Path -LiteralPath $PrepareRequestsPath)) {
  throw "Rust origin-export prepare requests were not prepared: $PrepareRequestsPath"
}
if ($Mode -eq "process" -and -not (Test-Path -LiteralPath $ProcessRequestsPath)) {
  throw "Rust origin-export process requests were not prepared: $ProcessRequestsPath"
}
if ($Mode -eq "export" -and -not (Test-Path -LiteralPath $ExportRequestsPath)) {
  throw "Rust origin-export export requests were not prepared: $ExportRequestsPath"
}

Push-Location $WorkspaceDir
try {
  cargo build --quiet --release -p conductor-cli --bin conductor-rs --target-dir $RsTargetDir
  if ($LASTEXITCODE -ne 0) {
    throw "Rust origin-export release build failed with exit code $LASTEXITCODE"
  }
  if (-not (Test-Path -LiteralPath $RsWorkerExe)) {
    $RsWorkerExe = $PackagedRsWorkerExe
  }
  if ($Mode -eq "prepare") {
    $results = Get-Content -LiteralPath $PrepareRequestsPath -Raw | & $RsWorkerExe --stdio-worker
    if ($LASTEXITCODE -ne 0) {
      throw "Rust origin-export prepare run failed with exit code $LASTEXITCODE"
    }
    $results | Set-Content -LiteralPath $PrepareResultsPath -Encoding UTF8
    Write-Host "[rust-origin-export-compat] wrote prepare results to $PrepareResultsPath"
  } elseif ($Mode -eq "process") {
    $requestsText = Get-Content -LiteralPath $ProcessRequestsPath -Raw
    $results = $requestsText | & $RsWorkerExe --stdio-worker
    if ($LASTEXITCODE -ne 0) {
      throw "Rust origin-export process run failed with exit code $LASTEXITCODE"
    }
    $results | Set-Content -LiteralPath $ProcessResultsPath -Encoding UTF8
    Write-Host "[rust-origin-export-compat] wrote process results to $ProcessResultsPath"
  } else {
    $results = Get-Content -LiteralPath $ExportRequestsPath -Raw | & $RsWorkerExe --stdio-worker
    if ($LASTEXITCODE -ne 0) {
      throw "Rust origin-export export run failed with exit code $LASTEXITCODE"
    }
    $results | Set-Content -LiteralPath $ExportResultsPath -Encoding UTF8
    Write-Host "[rust-origin-export-compat] wrote export results to $ExportResultsPath"
  }
} finally {
  Pop-Location
}
