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

function Get-MajorMinorVersion {
  param([string]$VersionValue)
  if ([string]::IsNullOrWhiteSpace($VersionValue)) {
    return $null
  }

  $parts = $VersionValue.Trim().Split(".")
  if ($parts.Length -ge 2) {
    return ("{0}.{1}" -f $parts[0], $parts[1])
  }

  return $VersionValue.Trim()
}

function Get-PythonMajorMinorFromExe {
  param([string]$PythonExe)
  if ([string]::IsNullOrWhiteSpace($PythonExe)) {
    return $null
  }

  try {
    $out = & $PythonExe -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"
    if ($LASTEXITCODE -ne 0) {
      return $null
    }
    return ($out | Select-Object -First 1).Trim()
  } catch {
    return $null
  }
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$DeviceDir = Join-Path $ProjectRoot ".device"
New-Item -ItemType Directory -Path $DeviceDir -Force | Out-Null

# Keep tool caches under .device/ (avoids user profile caches).
$env:UV_CACHE_DIR = Join-Path $DeviceDir "uv-cache"
$env:UV_PYTHON_INSTALL_DIR = Join-Path $DeviceDir "uv-python"
$env:PIP_CACHE_DIR = Join-Path $DeviceDir "pip-cache"
$env:PYINSTALLER_CONFIG_DIR = Join-Path $DeviceDir "pyinstaller-cache"
$tempDir = Join-Path $DeviceDir "tmp"
$env:TEMP = $tempDir
$env:TMP = $tempDir
New-Item -ItemType Directory -Force -Path `
  $env:UV_CACHE_DIR, `
  $env:UV_PYTHON_INSTALL_DIR, `
  $env:PIP_CACHE_DIR, `
  $env:PYINSTALLER_CONFIG_DIR, `
  $tempDir | Out-Null

$OriginDir = Join-Path $ProjectRoot "origin"
$EntryScript = Join-Path $OriginDir "run_origin_batch.py"

if (-not (Test-Path -LiteralPath $EntryScript)) {
  throw "Entry script not found: $EntryScript"
}

$DistDir = Resolve-PathOrDefault -Value $DistDir -Fallback (Join-Path $OriginDir "bin")
$DistDir = $DistDir.Trim()
if (-not [System.IO.Path]::IsPathRooted($DistDir)) {
  $DistDir = Join-Path $ProjectRoot $DistDir
}
$VenvDir = Resolve-PathOrDefault -Value $VenvDir -Fallback (Join-Path $ProjectRoot ".venv-origin-workers")
if (-not [System.IO.Path]::IsPathRooted($VenvDir)) {
  $VenvDir = Join-Path $ProjectRoot $VenvDir
}
$BuildWorkDir = Join-Path $DeviceDir "origin-workers\\pyinstaller\\batch\\work"
$SpecDir = Join-Path $DeviceDir "origin-workers\\pyinstaller\\batch\\spec"

New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
New-Item -ItemType Directory -Path $BuildWorkDir -Force | Out-Null
New-Item -ItemType Directory -Path $SpecDir -Force | Out-Null

$uvCmd = Get-Command uv -ErrorAction SilentlyContinue
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
$requiredPy = Get-MajorMinorVersion -VersionValue $PythonVersion

if ($null -eq $uvCmd -and $null -eq $pythonCmd) {
  throw "Neither uv nor python is available in PATH. Install Python $requiredPy (python in PATH), or install uv first."
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
  if ($null -ne $uvCmd) {
    $venvArgs = @("venv", "--python", $PythonVersion, $VenvDir)
    Write-Host "[build-origin-batch-worker] Running: uv $($venvArgs -join ' ')"
    & $uvCmd.Source @venvArgs
    if ($LASTEXITCODE -ne 0) {
      throw "uv venv failed with exit code $LASTEXITCODE"
    }
  } else {
    $pythonExe = $pythonCmd.Source
    $actualPy = Get-PythonMajorMinorFromExe -PythonExe $pythonExe
    if ($requiredPy -and $actualPy -and $actualPy -ne $requiredPy) {
      throw "python in PATH is $actualPy but $requiredPy is required. Activate a Python $requiredPy environment (e.g. conda -p .\.tooling\env) or install uv to manage Python selection."
    }

    $venvArgs = @("-m", "venv", $VenvDir)
    Write-Host "[build-origin-batch-worker] Running: $pythonExe $($venvArgs -join ' ')"
    & $pythonExe @venvArgs
    if ($LASTEXITCODE -ne 0) {
      throw "python -m venv failed with exit code $LASTEXITCODE"
    }
  }
}

if (-not (Test-Path -LiteralPath $venvPython)) {
  throw "Venv python executable not found: $venvPython"
}

if ($null -ne $uvCmd) {
  $installArgs = @("pip", "install", "--python", $venvPython) + $packages
  Write-Host "[build-origin-batch-worker] Running: uv $($installArgs -join ' ')"
  & $uvCmd.Source @installArgs
  if ($LASTEXITCODE -ne 0) {
    throw "uv pip install failed with exit code $LASTEXITCODE"
  }
} else {
  $installArgs = @("-m", "pip", "install") + $packages
  Write-Host "[build-origin-batch-worker] Running: $venvPython $($installArgs -join ' ')"
  & $venvPython @installArgs
  if ($LASTEXITCODE -ne 0) {
    throw "pip install failed with exit code $LASTEXITCODE"
  }
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
