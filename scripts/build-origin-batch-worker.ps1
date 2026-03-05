param(
  [string]$ProjectRoot = "",
  [string]$DistDir = "",
  [string]$VenvDir = "",
  [string]$PythonVersion = "3.11",
  [switch]$UsePinnedVersions
)

$ErrorActionPreference = "Stop"

function Resolve-PathOrDefault {
  param(
    [string]$Value,
    [string]$Fallback
  )
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $Fallback
  }
  return $Value
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$OriginDir = Join-Path $ProjectRoot "origin"
$EntryScript = Join-Path $OriginDir "run_origin_batch.py"

if (-not (Test-Path -LiteralPath $EntryScript)) {
  throw "Entry script not found: $EntryScript"
}

$DistDir = Resolve-PathOrDefault -Value $DistDir -Fallback (Join-Path $OriginDir "bin")
$VenvDir = Resolve-PathOrDefault -Value $VenvDir -Fallback (Join-Path $ProjectRoot ".venv-origin-workers")
if (-not [System.IO.Path]::IsPathRooted($VenvDir)) {
  $VenvDir = Join-Path $ProjectRoot $VenvDir
}
$BuildWorkDir = Join-Path $OriginDir ".pyi_build"
$SpecDir = Join-Path $OriginDir ".pyi_spec"

New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
New-Item -ItemType Directory -Path $BuildWorkDir -Force | Out-Null
New-Item -ItemType Directory -Path $SpecDir -Force | Out-Null

$uvCmd = Get-Command uv -ErrorAction SilentlyContinue
if ($null -eq $uvCmd) {
  throw "uv is not available in PATH. Install uv first."
}

$packages = if ($UsePinnedVersions) {
  @(
    "pyinstaller==6.16.0",
    "pyinstaller-hooks-contrib==2025.8",
    "pywin32==311"
  )
} else {
  @(
    "pyinstaller==6.16.0",
    "pyinstaller-hooks-contrib==2025.8",
    "pywin32==311"
  )
}

$venvPython = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
  $venvArgs = @("venv", "--python", $PythonVersion, $VenvDir)
  Write-Host "[build-origin-batch-worker] Running: uv $($venvArgs -join ' ')"
  & $uvCmd.Source @venvArgs
  if ($LASTEXITCODE -ne 0) {
    throw "uv venv failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path -LiteralPath $venvPython)) {
  throw "Venv python executable not found: $venvPython"
}

$installArgs = @("pip", "install", "--python", $venvPython) + $packages
Write-Host "[build-origin-batch-worker] Running: uv $($installArgs -join ' ')"
& $uvCmd.Source @installArgs
if ($LASTEXITCODE -ne 0) {
  throw "uv pip install failed with exit code $LASTEXITCODE"
}

$pyinstallerArgs = @(
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--name", "origin-batch-worker",
  "--distpath", $DistDir,
  "--workpath", $BuildWorkDir,
  "--specpath", $SpecDir,
  "--hidden-import", "pythoncom",
  "--hidden-import", "pywintypes",
  "--hidden-import", "win32com.client",
  $EntryScript
)

Write-Host "[build-origin-batch-worker] Running: $venvPython $($pyinstallerArgs -join ' ')"
& $venvPython @pyinstallerArgs

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller failed with exit code $LASTEXITCODE"
}

$exePath = Join-Path $DistDir "origin-batch-worker.exe"
if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Build finished but executable was not found: $exePath"
}

Write-Host "[build-origin-batch-worker] OK: $exePath"
Write-Host "[build-origin-batch-worker] Smoke test: $exePath --help"
& $exePath --help
