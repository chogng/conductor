param(
  [string]$ProjectRoot = "",
  [string]$DistDir = "",
  [string]$TargetDir = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$CrateDir = Join-Path $ProjectRoot "conductor-rs\worker"
$CargoToml = Join-Path $CrateDir "Cargo.toml"

if (-not (Test-Path -LiteralPath $CargoToml)) {
  throw "Conductor worker Cargo.toml not found: $CargoToml"
}

if ([string]::IsNullOrWhiteSpace($DistDir)) {
  $DistDir = Join-Path $ProjectRoot "excel\bin"
}
if (-not [System.IO.Path]::IsPathRooted($DistDir)) {
  $DistDir = Join-Path $ProjectRoot $DistDir
}
if ([string]::IsNullOrWhiteSpace($TargetDir)) {
  $TargetDir = Join-Path $ProjectRoot ".tooling\conductor-rs-target"
}
if (-not [System.IO.Path]::IsPathRooted($TargetDir)) {
  $TargetDir = Join-Path $ProjectRoot $TargetDir
}

$cargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
if ($null -eq $cargoCmd) {
  throw "cargo is not available in PATH. Install Rust before building the rs-worker."
}

$vsDevCandidates = @(
  "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\Tools\VsDevCmd.bat",
  "C:\Program Files\Microsoft Visual Studio\18\BuildTools\Common7\Tools\VsDevCmd.bat",
  "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat",
  "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
)
$vsDevCmd = $vsDevCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

Push-Location $CrateDir
try {
  $isWindows = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
  if ($isWindows -and $vsDevCmd) {
    Write-Host "[build-rs-worker] Running cargo build through VsDevCmd."
    & cmd.exe /d /s /c "call `"$vsDevCmd`" -arch=x64 && cargo build --release -p worker --target-dir `"$TargetDir`""
  } else {
    Write-Host "[build-rs-worker] Running cargo build --release."
    & $cargoCmd.Source build --release -p worker --target-dir $TargetDir
  }
  if ($LASTEXITCODE -ne 0) {
    throw "cargo build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$sourceExe = Join-Path $TargetDir "release\rs-worker.exe"
if (-not (Test-Path -LiteralPath $sourceExe)) {
  throw "Built rs-worker executable not found: $sourceExe"
}

New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
$primaryTargetExe = Join-Path $DistDir "rs-worker.exe"
Copy-Item -LiteralPath $sourceExe -Destination $primaryTargetExe -Force
Write-Host "[build-rs-worker] Copied rs-worker to $primaryTargetExe"
