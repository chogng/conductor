param(
  [Parameter(Mandatory = $true)][string]$WorkDir,
  [Parameter(Mandatory = $true)][string]$ExtractDir,
  [Parameter(Mandatory = $true)][string]$OriginExe
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Ensure-Dir {
  param([string]$PathValue)
  if (-not (Test-Path -LiteralPath $PathValue)) {
    New-Item -ItemType Directory -Path $PathValue -Force | Out-Null
  }
}

function Escape-LabTalkPath {
  param([string]$PathValue)
  if ($null -eq $PathValue) { return '' }
  return ($PathValue -replace '\\', '\\\\' -replace '"', '\"')
}

Ensure-Dir -PathValue $WorkDir
$logPath = Join-Path $WorkDir 'originbridge.log'
$errorPath = Join-Path $WorkDir 'error.txt'

function Write-OriginLog {
  param([string]$Message)
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Fail-Worker {
  param([string]$Message)
  Set-Content -LiteralPath $errorPath -Value $Message -Encoding UTF8
  Write-OriginLog ("ERROR: " + $Message)
  exit 1
}

Set-Content -LiteralPath $errorPath -Value '' -Encoding UTF8

try {
  Write-OriginLog "WorkDir: $WorkDir"
  Write-OriginLog "ExtractDir: $ExtractDir"
  Write-OriginLog "OriginExe: $OriginExe"

  if (-not (Test-Path -LiteralPath $ExtractDir)) {
    Fail-Worker "Extract directory not found: $ExtractDir"
  }
  if (-not (Test-Path -LiteralPath $OriginExe)) {
    Fail-Worker "Origin executable not found: $OriginExe"
  }

  $ogs = Get-ChildItem -LiteralPath $ExtractDir -Recurse -File -Filter *.ogs | Select-Object -First 1
  $csv = Get-ChildItem -LiteralPath $ExtractDir -Recurse -File -Filter *.csv | Select-Object -First 1

  if (-not $ogs -and -not $csv) {
    Fail-Worker "No .ogs or .csv found in extracted package."
  }

  $origin = $null
  $ranOgs = $false

  try {
    $origin = New-Object -ComObject 'Origin.ApplicationSI'
    Write-OriginLog 'Connected to Origin COM (Origin.ApplicationSI).'
  } catch {
    Fail-Worker ("Failed to create Origin COM object: " + $_.Exception.Message)
  }

  try {
    try { $origin.Visible = 2 } catch {}
    try { $origin.BeginSession() | Out-Null } catch {}

    if ($ogs) {
      $ogsLt = Escape-LabTalkPath $ogs.FullName
      $cmd = ''

      if ($csv) {
        $csvLt = Escape-LabTalkPath $csv.FullName
        $cmd = 'run.section("' + $ogsLt + '", Main, "' + $csvLt + '");'
      } else {
        $cmd = 'run.section("' + $ogsLt + '", Main);'
      }

      Write-OriginLog ("Executing OGS: " + $ogs.FullName)
      try {
        $execResult = $origin.Execute($cmd)
        if ($execResult -eq $true -or $execResult -eq 1) {
          $ranOgs = $true
          Write-OriginLog 'OGS executed successfully.'
        } else {
          Write-OriginLog ("OGS Execute() returned: " + $execResult)
        }
      } catch {
        Write-OriginLog ("OGS execution failed: " + $_.Exception.Message)
      }
    }

    if (-not $ranOgs) {
      if (-not $csv) {
        Fail-Worker 'OGS execution failed and no CSV file is available for fallback plot.'
      }

      $csvLt = Escape-LabTalkPath $csv.FullName
      Write-OriginLog ("Running CSV fallback plot: " + $csv.FullName)

      $null = $origin.Execute('newbook;')
      $null = $origin.Execute('impCSV fname:="' + $csvLt + '";')
      $null = $origin.Execute('plotxy iy:=((1,2)) plot:=202;')
    }

    try { $origin.Visible = 3 } catch {}
    try { $origin.Execute('win -a;') | Out-Null } catch {}
    try { $origin.EndSession() | Out-Null } catch {}
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($origin) } catch {}

    Write-OriginLog 'Origin plotting completed.'
    exit 0
  } catch {
    Fail-Worker ($_.Exception.Message)
  }
} catch {
  Fail-Worker ($_.Exception.Message)
}
