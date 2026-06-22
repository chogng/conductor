param(
  [string]$OutputDir = "release-update-debug",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Fail {
  param([string]$Message)
  throw "[pack-desktop-update-debug] $Message"
}

function Ensure-LastExitCodeZero {
  param(
    [int]$Code,
    [string]$Step
  )
  if ($Code -ne 0) {
    Fail "$Step failed with exit code $Code."
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$projectRootPath = (Resolve-Path -LiteralPath $projectRoot).Path
Set-Location $projectRootPath

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  Fail "OutputDir must not be empty."
}

if ([System.IO.Path]::IsPathRooted($OutputDir)) {
  $outputPath = [System.IO.Path]::GetFullPath($OutputDir)
} else {
  $outputPath = [System.IO.Path]::GetFullPath((Join-Path $projectRootPath $OutputDir))
}

$projectRootWithSeparator = $projectRootPath.TrimEnd([System.IO.Path]::DirectorySeparatorChar) +
  [System.IO.Path]::DirectorySeparatorChar
if (-not $outputPath.StartsWith($projectRootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
  Fail "Refusing to write outside workspace: $outputPath"
}

$runningProcesses = @(
  Get-Process | Where-Object {
    try {
      $processPath = $_.Path
    } catch {
      $processPath = $null
    }

    -not [string]::IsNullOrWhiteSpace($processPath) -and
      $processPath.StartsWith($outputPath, [System.StringComparison]::OrdinalIgnoreCase)
  }
)

if ($runningProcesses.Count -gt 0) {
  Write-Host "[pack-desktop-update-debug] Output is in use by running processes:"
  foreach ($process in $runningProcesses) {
    Write-Host "  - $($process.ProcessName) pid=$($process.Id) path=$($process.Path)"
  }
  Fail "Close the debug app before rebuilding $outputPath."
}

if (Test-Path -LiteralPath $outputPath) {
  Write-Host "[pack-desktop-update-debug] Removing previous output: $outputPath"
  Remove-Item -LiteralPath $outputPath -Recurse -Force
}

if (-not $SkipBuild) {
  Write-Host "[pack-desktop-update-debug] Running: npm run build:desktop"
  & npm.cmd run build:desktop
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "npm run build:desktop"

  Write-Host "[pack-desktop-update-debug] Running: npm run verify:py-worker"
  & npm.cmd run verify:py-worker
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "npm run verify:py-worker"
}

$builder = Join-Path $projectRootPath "node_modules\.bin\electron-builder.cmd"
if (-not (Test-Path -LiteralPath $builder)) {
  Fail "electron-builder command not found at $builder"
}

$afterPackHook = Join-Path $projectRootPath "scripts\electron-builder-update-debug-after-pack.cjs"
if (-not (Test-Path -LiteralPath $afterPackHook)) {
  Fail "update debug afterPack hook not found at $afterPackHook"
}

$builderArgs = @(
  "--win",
  "nsis",
  "--config.directories.output=$OutputDir",
  "--config.afterPack=$afterPackHook",
  "--config.win.signAndEditExecutable=false",
  "--config.win.verifyUpdateCodeSignature=false"
)

Write-Host "[pack-desktop-update-debug] Running: electron-builder $($builderArgs -join ' ')"
& $builder @builderArgs
Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "electron-builder"

Write-Host "[pack-desktop-update-debug] Output: $outputPath"
$assets = Get-ChildItem -LiteralPath $outputPath -File | Sort-Object -Property Name
foreach ($asset in $assets) {
  Write-Host "  - $($asset.Name)"
}
