param(
  [string]$ProjectRoot = "",
  [string]$DistDir = "",
  [string]$TargetDir = ""
)

$ErrorActionPreference = "Stop"

$isWindows = $IsWindows
if ($null -eq $isWindows) {
  $isWindows = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
}

$helperFileName = if ($isWindows) { 'conductor-rs.exe' } else { 'conductor-rs' }

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$WorkspaceDir = $ProjectRoot
$CargoToml = Join-Path $WorkspaceDir "Cargo.toml"

if (-not (Test-Path -LiteralPath $CargoToml)) {
  throw "Conductor Rust workspace Cargo.toml not found: $CargoToml"
}

if ([string]::IsNullOrWhiteSpace($DistDir)) {
  $DistDir = Join-Path $ProjectRoot "resources\bin"
}
if (-not [System.IO.Path]::IsPathRooted($DistDir)) {
  $DistDir = Join-Path $ProjectRoot $DistDir
}
if ([string]::IsNullOrWhiteSpace($TargetDir)) {
  $TargetDir = Join-Path $ProjectRoot ".build\cache\conductor-rs-cli-target"
}
if (-not [System.IO.Path]::IsPathRooted($TargetDir)) {
  $TargetDir = Join-Path $ProjectRoot $TargetDir
}

$cargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
if ($null -eq $cargoCmd) {
  throw "cargo is not available in PATH. Install Rust before building conductor-rs."
}

$vsDevCandidates = @(
  "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\Tools\VsDevCmd.bat",
  "C:\Program Files\Microsoft Visual Studio\18\BuildTools\Common7\Tools\VsDevCmd.bat",
  "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat",
  "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
)
$vsDevCmd = $vsDevCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

Push-Location $WorkspaceDir
try {
  if ($isWindows -and $vsDevCmd) {
    Write-Host "[build-conductor-rs] Running cargo build through VsDevCmd."
    & cmd.exe /d /s /c "call `"$vsDevCmd`" -arch=x64 && cargo build --release -p conductor-cli --bin conductor-rs --target-dir `"$TargetDir`""
  } else {
    Write-Host "[build-conductor-rs] Running cargo build --release."
    & $cargoCmd.Source build --release -p conductor-cli --bin conductor-rs --target-dir $TargetDir
  }
  if ($LASTEXITCODE -ne 0) {
    throw "cargo build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$releaseDir = Join-Path $TargetDir 'release'
$sourceExe = Join-Path $releaseDir $helperFileName
if (-not (Test-Path -LiteralPath $sourceExe)) {
  throw "Built conductor-rs executable not found: $sourceExe"
}

New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
$primaryTargetExe = Join-Path $DistDir $helperFileName
Remove-Item -LiteralPath $primaryTargetExe -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $sourceExe -Destination $primaryTargetExe -Force
Write-Host "[build-conductor-rs] Copied conductor-rs to $primaryTargetExe"
