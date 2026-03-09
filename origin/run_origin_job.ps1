param(
  [Parameter(Mandatory = $true)][string]$WorkDir,
  [string]$ExtractDir = '',
  [Parameter(Mandatory = $true)][string]$OriginExe,
  [switch]$HealthCheckOnly
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

function Get-HResultHex {
  param([System.Exception]$ExceptionObject)
  if ($null -eq $ExceptionObject) { return $null }
  try {
    $value = [uint32]$ExceptionObject.HResult
    return ('0x{0:X8}' -f $value)
  } catch {
    return $null
  }
}

function Build-ErrorMessage {
  param(
    [string]$Prefix,
    [System.Exception]$ExceptionObject
  )

  $base = if ($Prefix) { $Prefix.Trim() } else { 'Origin worker failed.' }
  $hresult = Get-HResultHex -ExceptionObject $ExceptionObject
  if ($hresult) {
    return ($base + ' HRESULT=' + $hresult + '.')
  }
  return $base
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
  param(
    [string]$Code,
    [string]$Stage,
    [string]$Message,
    [System.Exception]$ExceptionObject
  )

  $hresult = Get-HResultHex -ExceptionObject $ExceptionObject
  $payload = [ordered]@{
    code = if ($Code) { $Code } else { 'ORIGIN_WORKER_FAILED' }
    stage = if ($Stage) { $Stage } else { 'UNKNOWN' }
    message = if ($Message) { $Message } else { 'Origin worker failed.' }
    hresult = $hresult
    originExe = $OriginExe
    logPath = $logPath
    timestamp = (Get-Date).ToString('o')
  }

  $json = $payload | ConvertTo-Json -Compress -Depth 5
  Set-Content -LiteralPath $errorPath -Value $json -Encoding UTF8
  Write-OriginLog ('ERROR [' + $payload.stage + '] ' + $payload.code + ': ' + $payload.message)
  if ($hresult) {
    Write-OriginLog ('HRESULT: ' + $hresult)
  }
  exit 1
}

function Try-GetActiveOriginCom {
  try {
    return [Runtime.InteropServices.Marshal]::GetActiveObject('Origin.ApplicationSI')
  } catch {
    return $null
  }
}

Set-Content -LiteralPath $errorPath -Value '' -Encoding UTF8

try {
  Write-OriginLog ('WorkDir: ' + $WorkDir)
  Write-OriginLog ('ExtractDir: ' + $ExtractDir)
  Write-OriginLog ('OriginExe: ' + $OriginExe)
  Write-OriginLog ('HealthCheckOnly: ' + [bool]$HealthCheckOnly)

  if (-not (Test-Path -LiteralPath $OriginExe)) {
    Fail-Worker -Code 'ORIGIN_EXE_NOT_FOUND' -Stage 'PRECHECK' -Message ('Origin executable not found: ' + $OriginExe)
  }

  $ogs = $null
  $csv = $null
  if (-not $HealthCheckOnly) {
    if (-not $ExtractDir) {
      Fail-Worker -Code 'ORIGIN_EXTRACT_DIR_REQUIRED' -Stage 'PRECHECK' -Message 'Extract directory path is required.'
    }
    if (-not (Test-Path -LiteralPath $ExtractDir)) {
      Fail-Worker -Code 'ORIGIN_EXTRACT_DIR_NOT_FOUND' -Stage 'PRECHECK' -Message ('Extract directory not found: ' + $ExtractDir)
    }

    $ogs = Get-ChildItem -LiteralPath $ExtractDir -Recurse -File -Filter *.ogs | Select-Object -First 1
    $csv = Get-ChildItem -LiteralPath $ExtractDir -Recurse -File -Filter *.csv | Select-Object -First 1

    if (-not $ogs -and -not $csv) {
      Fail-Worker -Code 'ORIGIN_PACKAGE_EMPTY' -Stage 'PACKAGE_DISCOVERY' -Message 'No .ogs or .csv found in extracted package.'
    }
  }

  $origin = Try-GetActiveOriginCom
  if ($null -ne $origin) {
    Write-OriginLog 'Attached to existing Origin COM object before launch.'
  } else {
    Write-OriginLog 'No active Origin COM object before launch.'
  }

  $launchError = $null
  if ($null -eq $origin) {
    try {
      Write-OriginLog ('Launching Origin from configured executable: ' + $OriginExe)
      $proc = Start-Process -FilePath $OriginExe -PassThru -ErrorAction Stop
      if ($null -ne $proc) {
        Write-OriginLog ('Origin process started. PID=' + $proc.Id)
      } else {
        Write-OriginLog 'Origin start requested (process handle unavailable).'
      }
      Start-Sleep -Milliseconds 1400
    } catch {
      $launchError = $_.Exception
      Write-OriginLog ('Configured Origin launch failed; falling back to COM activation. ' + $launchError.Message)
      $launchHResult = Get-HResultHex -ExceptionObject $launchError
      if ($launchHResult) {
        Write-OriginLog ('Launch HRESULT: ' + $launchHResult)
      }
    }
  }

  $comException = $null
  if ($null -eq $origin) {
    # Origin COM registration can lag behind process launch on some machines.
    # Use a longer attach window to avoid false negatives that trigger runner fallback.
    $maxComAttempts = 12
    $comAttachDelayMs = 1200
    for ($attempt = 1; $attempt -le $maxComAttempts; $attempt++) {
      try {
        # Attach to an already running COM server only to avoid creating a second Origin instance/window.
        $origin = [Runtime.InteropServices.Marshal]::GetActiveObject('Origin.ApplicationSI')
        Write-OriginLog ('Attached to running Origin COM (Origin.ApplicationSI) on attempt ' + $attempt + '.')
        break
      } catch {
        $comException = $_.Exception
        $comMessage = if ($comException) { $comException.Message } else { 'Unknown COM creation failure.' }
        Write-OriginLog ('COM attach attempt ' + $attempt + ' failed: ' + $comMessage)
        if ($attempt -lt $maxComAttempts) {
          Start-Sleep -Milliseconds $comAttachDelayMs
        }
      }
    }
  }

  if ($null -eq $origin) {
    $extra = if ($null -ne $launchError) { ' (configured executable launch also failed)' } else { '' }
    $msg = Build-ErrorMessage -Prefix ('Failed to attach running Origin COM object' + $extra + '.') -ExceptionObject $comException
    Fail-Worker -Code 'ORIGIN_COM_CREATE_FAILED' -Stage 'COM_CREATE' -Message $msg -ExceptionObject $comException
  }

  $sessionStarted = $false
  $ranOgs = $false
  $ogsException = $null
  $mainException = $null

  try {
    try {
      $origin.Visible = 2
    } catch {
      Write-OriginLog ('Visible=2 failed: ' + $_.Exception.Message)
    }

    try {
      $origin.BeginSession() | Out-Null
      $sessionStarted = $true
      Write-OriginLog 'Origin BeginSession succeeded.'
    } catch {
      $mainException = $_.Exception
      $message = Build-ErrorMessage -Prefix 'Origin BeginSession failed.' -ExceptionObject $mainException
      Fail-Worker -Code 'ORIGIN_SESSION_BEGIN_FAILED' -Stage 'SESSION_BEGIN' -Message $message -ExceptionObject $mainException
    }

    if ($HealthCheckOnly) {
      Write-OriginLog 'Running Origin health-check smoke command.'
      try {
        $healthResult = $origin.Execute('sec -p 0;')
        Write-OriginLog ('Health check Execute() returned: ' + $healthResult)
      } catch {
        $mainException = $_.Exception
        $message = Build-ErrorMessage -Prefix 'Origin health-check execute failed.' -ExceptionObject $mainException
        Fail-Worker -Code 'ORIGIN_HEALTH_EXEC_FAILED' -Stage 'HEALTH_CHECK' -Message $message -ExceptionObject $mainException
      }
    } else {
      if ($ogs) {
        $ogsLt = Escape-LabTalkPath $ogs.FullName
        $cmd = ''

        if ($csv) {
          $csvLt = Escape-LabTalkPath $csv.FullName
          $cmd = 'run.section("' + $ogsLt + '", Main, "' + $csvLt + '");'
        } else {
          $cmd = 'run.section("' + $ogsLt + '", Main);'
        }

        Write-OriginLog ('Executing OGS: ' + $ogs.FullName)
        try {
          $execResult = $origin.Execute($cmd)
          if ($execResult -eq $true -or $execResult -eq 1) {
            $ranOgs = $true
            Write-OriginLog 'OGS executed successfully.'
          } else {
            Write-OriginLog ('OGS Execute() returned: ' + $execResult)
          }
        } catch {
          $ogsException = $_.Exception
          Write-OriginLog ('OGS execution failed: ' + $ogsException.Message)
        }
      }

      if (-not $ranOgs) {
        if (-not $csv) {
          $message = 'OGS execution failed and no CSV file is available for fallback plot.'
          Fail-Worker -Code 'ORIGIN_OGS_FALLBACK_UNAVAILABLE' -Stage 'CSV_FALLBACK' -Message $message -ExceptionObject $ogsException
        }

        $csvLt = Escape-LabTalkPath $csv.FullName
        Write-OriginLog ('Running CSV fallback plot: ' + $csv.FullName)
        try {
          $null = $origin.Execute('newbook;')
          $null = $origin.Execute('impCSV fname:="' + $csvLt + '";')
          $null = $origin.Execute('plotxy iy:=((1,2)) plot:=202;')
          Write-OriginLog 'CSV fallback plot succeeded.'
        } catch {
          $mainException = $_.Exception
          $message = Build-ErrorMessage -Prefix 'CSV fallback plot failed.' -ExceptionObject $mainException
          Fail-Worker -Code 'ORIGIN_CSV_FALLBACK_FAILED' -Stage 'CSV_FALLBACK' -Message $message -ExceptionObject $mainException
        }
      }
    }

    Write-OriginLog 'Origin job completed successfully.'
    Set-Content -LiteralPath $errorPath -Value '' -Encoding UTF8
    exit 0
  } catch {
    $mainException = $_.Exception
    $message = Build-ErrorMessage -Prefix 'Unknown Origin worker failure.' -ExceptionObject $mainException
    Fail-Worker -Code 'ORIGIN_WORKER_RUNTIME_FAILED' -Stage 'RUNTIME' -Message $message -ExceptionObject $mainException
  } finally {
    if ($null -ne $origin) {
      try { $origin.Visible = 3 } catch {}
      try { $origin.Execute('win -a;') | Out-Null } catch {}
      if ($sessionStarted) {
        try { $origin.EndSession() | Out-Null } catch {}
      }
      try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($origin) } catch {}
    }
  }
} catch {
  $fatal = $_.Exception
  $message = Build-ErrorMessage -Prefix 'Unknown fatal Origin worker failure.' -ExceptionObject $fatal
  Fail-Worker -Code 'ORIGIN_WORKER_FATAL' -Stage 'FATAL' -Message $message -ExceptionObject $fatal
}
