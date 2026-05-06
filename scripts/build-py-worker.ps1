param(
  [string]$ProjectRoot = "",
  [string]$DistDir = "",
  [string]$VenvDir = "",
  [string]$PythonVersion = "3.11",
  [string]$PythonExe = "",
  [switch]$UsePinnedVersions,
  [switch]$OneFile
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

$PythonWorkerDir = Join-Path $ProjectRoot "conductor-py"
$EntryScript = Join-Path $PythonWorkerDir "run_origin_csv.py"
$PackageJsonPath = Join-Path $ProjectRoot "package.json"

if (-not (Test-Path -LiteralPath $EntryScript)) {
  throw "Entry script not found: $EntryScript"
}
if (-not (Test-Path -LiteralPath $PackageJsonPath)) {
  throw "package.json not found: $PackageJsonPath"
}

$DistDir = Resolve-PathOrDefault -Value $DistDir -Fallback (Join-Path $ProjectRoot "workers\py")
$DistDir = $DistDir.Trim()
if (-not [System.IO.Path]::IsPathRooted($DistDir)) {
  $DistDir = Join-Path $ProjectRoot $DistDir
}
$VenvDir = Resolve-PathOrDefault -Value $VenvDir -Fallback (Join-Path $ProjectRoot ".venv-py-workers")
if (-not [System.IO.Path]::IsPathRooted($VenvDir)) {
  $VenvDir = Join-Path $ProjectRoot $VenvDir
}
$BuildWorkDir = Join-Path $DeviceDir "py-workers\\pyinstaller\\csv\\work"
$SpecDir = Join-Path $DeviceDir "py-workers\\pyinstaller\\csv\\spec"
$BuildInfoPath = Join-Path $DeviceDir "py-workers\\pyinstaller\\csv\\worker-build-info.json"
$VersionInfoPath = Join-Path $DeviceDir "py-workers\\pyinstaller\\csv\\worker-version-info.txt"

New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
New-Item -ItemType Directory -Path $BuildWorkDir -Force | Out-Null
New-Item -ItemType Directory -Path $SpecDir -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $BuildInfoPath) -Force | Out-Null

$packageJson = Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json
$appVersion = [string]$packageJson.version
if ([string]::IsNullOrWhiteSpace($appVersion)) {
  throw "package.json version is empty."
}
$expectedTag = "v$appVersion"

$gitCommit = ""
try {
  $gitCommitRaw = & git -C $ProjectRoot rev-parse --short HEAD 2>$null
  if ($LASTEXITCODE -eq 0 -and $gitCommitRaw) {
    $gitCommit = ($gitCommitRaw | Select-Object -First 1).Trim()
  }
} catch {
  $gitCommit = ""
}

$gitTag = ""
try {
  $gitTagRaw = & git -C $ProjectRoot tag --points-at HEAD 2>$null
  if ($LASTEXITCODE -eq 0 -and $gitTagRaw) {
    $gitTag = ($gitTagRaw | Select-Object -First 1).Trim()
  }
} catch {
  $gitTag = ""
}

$buildInfo = [ordered]@{
  mode = if ($OneFile) { "packaged-exe-onefile" } else { "packaged-exe-onedir" }
  workerVersion = $appVersion
  appVersion = $appVersion
  expectedTag = $expectedTag
  gitTag = $gitTag
  gitCommit = $gitCommit
  builtAt = [DateTimeOffset]::UtcNow.ToString("o")
}
$buildInfo | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $BuildInfoPath -Encoding UTF8

$versionNumbers = @($appVersion.Split(".") | ForEach-Object {
  $value = 0
  if ([int]::TryParse($_, [ref]$value)) { $value } else { 0 }
})
while ($versionNumbers.Count -lt 4) {
  $versionNumbers += 0
}
$versionNumbers = $versionNumbers[0..3]
$versionTuple = $versionNumbers -join ", "
$versionString = $versionNumbers -join "."
$companyName = "chogng"
$productName = "Conductor Studio"
$fileDescription = "Conductor Studio OriginPro CSV Import Worker"
$legalCopyright = "Copyright (c) chogng. All rights reserved."
$comments = "Runs local OriginPro CSV import and plotting jobs for Conductor Studio. Uses the OriginLab originpro Python package and does not provide network services."
$specialBuild = "expectedTag=$expectedTag; gitTag=$gitTag; gitCommit=$gitCommit"

@"
VSVersionInfo(
  ffi=FixedFileInfo(
    filevers=($versionTuple),
    prodvers=($versionTuple),
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo([
      StringTable(
        '040904B0',
        [
          StringStruct('CompanyName', '$companyName'),
          StringStruct('FileDescription', '$fileDescription'),
          StringStruct('FileVersion', '$versionString'),
          StringStruct('InternalName', 'origin-csv-worker'),
          StringStruct('LegalCopyright', '$legalCopyright'),
          StringStruct('OriginalFilename', 'origin-csv-worker.exe'),
          StringStruct('ProductName', '$productName'),
          StringStruct('ProductVersion', '$versionString'),
          StringStruct('SpecialBuild', '$specialBuild'),
          StringStruct('Comments', '$comments')
        ]
      )
    ]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)
"@ | Set-Content -LiteralPath $VersionInfoPath -Encoding ASCII

$uvCmd = Get-Command uv -ErrorAction SilentlyContinue
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
$requiredPy = Get-MajorMinorVersion -VersionValue $PythonVersion
$explicitPythonExe = if ([string]::IsNullOrWhiteSpace($PythonExe)) { "" } else { $PythonExe.Trim() }
if ($explicitPythonExe -and -not [System.IO.Path]::IsPathRooted($explicitPythonExe)) {
  $explicitPythonExe = Join-Path $ProjectRoot $explicitPythonExe
}
if ($explicitPythonExe -and -not (Test-Path -LiteralPath $explicitPythonExe)) {
  throw "PythonExe was provided but does not exist: $explicitPythonExe"
}

if (-not $explicitPythonExe -and $null -eq $uvCmd -and $null -eq $pythonCmd) {
  throw "Neither uv nor python is available in PATH. Install Python $requiredPy (python in PATH), or install uv first."
}

$packages = if ($UsePinnedVersions) {
  @(
    "pyinstaller==6.16.0",
    "pyinstaller-hooks-contrib==2025.8",
    "pywin32==311",
    "originpro==1.1.15"
  )
} else {
  @(
    "pyinstaller",
    "pyinstaller-hooks-contrib",
    "pywin32",
    "originpro"
  )
}

$venvPython = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
  if ($explicitPythonExe) {
    $actualPy = Get-PythonMajorMinorFromExe -PythonExe $explicitPythonExe
    if ($requiredPy -and $actualPy -and $actualPy -ne $requiredPy) {
      throw "PythonExe is $actualPy but $requiredPy is required: $explicitPythonExe"
    }

    $venvArgs = @("-m", "venv", $VenvDir)
    Write-Host "[build-py-worker] Running: $explicitPythonExe $($venvArgs -join ' ')"
    & $explicitPythonExe @venvArgs
    if ($LASTEXITCODE -ne 0) {
      throw "PythonExe -m venv failed with exit code $LASTEXITCODE"
    }
  } elseif ($null -ne $uvCmd) {
    $venvArgs = @("venv", "--python", $PythonVersion, $VenvDir)
    Write-Host "[build-py-worker] Running: uv $($venvArgs -join ' ')"
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
    Write-Host "[build-py-worker] Running: $pythonExe $($venvArgs -join ' ')"
    & $pythonExe @venvArgs
    if ($LASTEXITCODE -ne 0) {
      throw "python -m venv failed with exit code $LASTEXITCODE"
    }
  }
}

if (-not (Test-Path -LiteralPath $venvPython)) {
  throw "Venv python executable not found: $venvPython"
}

$venvActualPy = Get-PythonMajorMinorFromExe -PythonExe $venvPython
if ($requiredPy -and $venvActualPy -and $venvActualPy -ne $requiredPy) {
  throw "Existing worker venv uses Python $venvActualPy but $requiredPy is required: $VenvDir. Remove the venv and rerun the build, or pass -PythonVersion $venvActualPy intentionally."
}

$installArgs = @("-m", "pip", "install") + $packages
Write-Host "[build-py-worker] Running: $venvPython $($installArgs -join ' ')"
& $venvPython @installArgs
if ($LASTEXITCODE -ne 0) {
  throw "pip install failed with exit code $LASTEXITCODE"
}

$pyinstallerArgs = @(
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--noupx",
  "--name", "origin-csv-worker",
  "--distpath", $DistDir,
  "--workpath", $BuildWorkDir,
  "--specpath", $SpecDir,
  "--add-data", "$BuildInfoPath;.",
  "--version-file", $VersionInfoPath,
  "--collect-all", "originpro",
  "--collect-all", "OriginExt",
  "--hidden-import", "pythoncom",
  "--hidden-import", "pywintypes",
  "--hidden-import", "win32com.client",
  $EntryScript
)

$iconPath = Join-Path $ProjectRoot "build\icons\icon.ico"
if (Test-Path -LiteralPath $iconPath) {
  $pyinstallerArgs = $pyinstallerArgs[0..10] + @("--icon", $iconPath) + $pyinstallerArgs[11..($pyinstallerArgs.Length - 1)]
}

if ($OneFile) {
  $staleDir = Join-Path $DistDir "origin-csv-worker"
  if (Test-Path -LiteralPath $staleDir) {
    Remove-Item -LiteralPath $staleDir -Recurse -Force
  }
  $pyinstallerArgs = $pyinstallerArgs[0..4] + "--onefile" + $pyinstallerArgs[5..($pyinstallerArgs.Length - 1)]
} else {
  $staleOneFileExe = Join-Path $DistDir "origin-csv-worker.exe"
  if (Test-Path -LiteralPath $staleOneFileExe) {
    Remove-Item -LiteralPath $staleOneFileExe -Force
  }
  $pyinstallerArgs = $pyinstallerArgs[0..4] + "--onedir" + $pyinstallerArgs[5..($pyinstallerArgs.Length - 1)]
}

Write-Host "[build-py-worker] Running: $venvPython $($pyinstallerArgs -join ' ')"
& $venvPython @pyinstallerArgs

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller failed with exit code $LASTEXITCODE"
}

$exePath = if ($OneFile) {
  Join-Path $DistDir "origin-csv-worker.exe"
} else {
  Join-Path (Join-Path $DistDir "origin-csv-worker") "origin-csv-worker.exe"
}
if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Build finished but executable was not found: $exePath"
}

Write-Host "[build-py-worker] OK: $exePath"
Write-Host "[build-py-worker] Metadata: version=$appVersion expectedTag=$expectedTag gitTag=$gitTag gitCommit=$gitCommit"
Write-Host "[build-py-worker] Smoke test: $exePath --worker-version"
$smokeExitCode = 0
try {
  & $exePath --worker-version
  $smokeExitCode = $LASTEXITCODE
} catch {
  $smokeExitCode = -1
}
if ($smokeExitCode -ne 0) {
  Write-Warning "[build-py-worker] Smoke test failed with exit code $smokeExitCode (continuing)."
  $global:LASTEXITCODE = 0
}
