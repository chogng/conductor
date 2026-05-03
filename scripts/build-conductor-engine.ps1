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
$CrateDir = Join-Path $ProjectRoot "tools\rust-xls-bench"
$CargoToml = Join-Path $CrateDir "Cargo.toml"

if (-not (Test-Path -LiteralPath $CargoToml)) {
  throw "Conductor engine Cargo.toml not found: $CargoToml"
}

if ([string]::IsNullOrWhiteSpace($DistDir)) {
  $DistDir = Join-Path $ProjectRoot "excel\bin"
}
if (-not [System.IO.Path]::IsPathRooted($DistDir)) {
  $DistDir = Join-Path $ProjectRoot $DistDir
}
if ([string]::IsNullOrWhiteSpace($TargetDir)) {
  $TargetDir = Join-Path $ProjectRoot ".tooling\rust-xls-target"
}
if (-not [System.IO.Path]::IsPathRooted($TargetDir)) {
  $TargetDir = Join-Path $ProjectRoot $TargetDir
}

$cargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
if ($null -eq $cargoCmd) {
  throw "cargo is not available in PATH. Install Rust before building the Conductor engine."
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
    Write-Host "[build-conductor-engine] Running cargo build through VsDevCmd."
    & cmd.exe /d /s /c "call `"$vsDevCmd`" -arch=x64 && cargo build --release --target-dir `"$TargetDir`""
  } else {
    Write-Host "[build-conductor-engine] Running cargo build --release."
    & $cargoCmd.Source build --release --target-dir $TargetDir
  }
  if ($LASTEXITCODE -ne 0) {
    throw "cargo build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$sourceExe = Join-Path $TargetDir "release\conductor-engine.exe"
if (-not (Test-Path -LiteralPath $sourceExe)) {
  throw "Built engine executable not found: $sourceExe"
}

New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
$primaryTargetExe = Join-Path $DistDir "conductor-engine.exe"
$legacyTargetExe = Join-Path $DistDir "rust-xls-converter.exe"
Copy-Item -LiteralPath $sourceExe -Destination $primaryTargetExe -Force
Copy-Item -LiteralPath $sourceExe -Destination $legacyTargetExe -Force
$staleBenchExe = Join-Path $TargetDir "release\rust-xls-bench.exe"
if (Test-Path -LiteralPath $staleBenchExe) {
  Remove-Item -LiteralPath $staleBenchExe -Force
  Write-Host "[build-conductor-engine] Removed stale bench executable $staleBenchExe"
}
Write-Host "[build-conductor-engine] Copied engine to $primaryTargetExe"
Write-Host "[build-conductor-engine] Copied legacy converter alias to $legacyTargetExe"
