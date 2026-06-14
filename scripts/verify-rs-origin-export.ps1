param(
  [string]$ProjectRoot = "",
  [ValidateSet("process", "export")]
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
$FilesPath = Join-Path $BenchDir "files.json"
$ProcessRequestsPath = Join-Path $BenchDir "process-requests.jsonl"
$ProcessResultsPath = Join-Path $BenchDir "process-results.jsonl"
$ExportRequestsPath = Join-Path $BenchDir "export-requests.jsonl"
$ExportResultsPath = Join-Path $BenchDir "export-results.jsonl"

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
  if ($Mode -eq "process") {
    if (-not (Test-Path -LiteralPath $FilesPath)) {
      throw "Rust origin-export files list was not prepared: $FilesPath"
    }
    $files = (Get-Content -LiteralPath $FilesPath -Raw | ConvertFrom-Json).files
    $requests = @()
    for ($index = 0; $index -lt $files.Count; $index++) {
      $filePath = $files[$index]
      $requests += [pscustomobject]@{
        command = "processFileAuto"
        fileId = "origin-export-$index"
        fileName = [System.IO.Path]::GetFileName($filePath)
        id = $index + 1
        maxPoints = 600
        path = $filePath
      }
    }
    $requestsText = ($requests | ForEach-Object { $_ | ConvertTo-Json -Compress }) -join "`n"
    $requestsText = "$requestsText`n"
    $requestsText | Set-Content -LiteralPath $ProcessRequestsPath -Encoding UTF8
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
