param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseTag,
  [string]$UpdateRepo = "chogng/conductor-update",
  [string]$ReleaseDir = "release"
)

$ErrorActionPreference = "Stop"

function Fail {
  param([string]$Message)
  throw "[publish-windows-updater-assets] $Message"
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

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$releaseDirPath = Join-Path $projectRoot $ReleaseDir

if (-not (Test-Path -LiteralPath $releaseDirPath)) {
  Fail "Release directory not found: $releaseDirPath"
}

$latestYml = Join-Path $releaseDirPath "latest.yml"
if (-not (Test-Path -LiteralPath $latestYml)) {
  Fail "latest.yml is missing in $ReleaseDir."
}

$setupAssets = Get-ChildItem -LiteralPath $releaseDirPath -File |
  Where-Object { $_.Name -like "*-setup.exe" } |
  Sort-Object -Property Name
if ($setupAssets.Count -eq 0) {
  Fail "No installer assets (*-setup.exe) found under $releaseDirPath"
}

$assetFiles = @((Get-Item -LiteralPath $latestYml))
foreach ($setupAsset in $setupAssets) {
  $blockmapPath = "$($setupAsset.FullName).blockmap"
  if (-not (Test-Path -LiteralPath $blockmapPath)) {
    Fail "Missing blockmap for $($setupAsset.Name): $blockmapPath"
  }

  $assetFiles += $setupAsset
  $assetFiles += Get-Item -LiteralPath $blockmapPath
}

$assetFiles = $assetFiles | Sort-Object -Property FullName -Unique
$assetPaths = @($assetFiles | ForEach-Object { $_.FullName })

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($null -eq $gh) {
  Fail "GitHub CLI (gh) is not installed or not in PATH."
}

Write-Host "[publish-windows-updater-assets] Target repo: $UpdateRepo"
Write-Host "[publish-windows-updater-assets] Tag: $ReleaseTag"
Write-Host "[publish-windows-updater-assets] Assets:"
foreach ($asset in $assetFiles) {
  Write-Host "  - $($asset.Name)"
}

& $gh.Source release view $ReleaseTag --repo $UpdateRepo *> $null
$releaseExists = $LASTEXITCODE -eq 0

if (-not $releaseExists) {
  Write-Host "[publish-windows-updater-assets] Creating release and uploading assets..."
  & $gh.Source release create $ReleaseTag --repo $UpdateRepo --title $ReleaseTag --generate-notes $assetPaths
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "gh release create"
} else {
  Write-Host "[publish-windows-updater-assets] Release already exists. Uploading assets with --clobber..."
  & $gh.Source release upload $ReleaseTag --repo $UpdateRepo --clobber $assetPaths
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "gh release upload"
}
