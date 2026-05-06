param(
  [string]$Tag = "",
  [string]$Notes = "",
  [switch]$Draft,
  [switch]$PreRelease,
  [switch]$GenerateNotes,
  [switch]$SkipVerify,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Fail {
  param([string]$Message)
  throw "[release-desktop-local] $Message"
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
Set-Location $projectRoot

$packageJsonPath = Join-Path $projectRoot "package.json"
if (-not (Test-Path -LiteralPath $packageJsonPath)) {
  Fail "package.json not found at $packageJsonPath"
}

try {
  $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
} catch {
  Fail "Failed to parse package.json: $($_.Exception.Message)"
}

$version = [string]$packageJson.version
if ([string]::IsNullOrWhiteSpace($version)) {
  Fail "package.json version is empty."
}

if ([string]::IsNullOrWhiteSpace($Tag)) {
  $Tag = "v$version"
}

if (-not $PSBoundParameters.ContainsKey("GenerateNotes")) {
  $GenerateNotes = $true
}

$publishRaw = $packageJson.build.publish
$publishList = @()
if ($publishRaw -is [System.Array]) {
  $publishList = $publishRaw
} elseif ($null -ne $publishRaw) {
  $publishList = @($publishRaw)
}

if ($publishList.Count -eq 0) {
  Fail "build.publish is empty. Configure GitHub publish target in package.json first."
}

$firstPublish = $publishList[0]
$provider = [string]$firstPublish.provider
if ($provider.Trim().ToLowerInvariant() -ne "github") {
  Fail "build.publish[0].provider must be 'github' for this script."
}

$owner = [string]$firstPublish.owner
$repo = [string]$firstPublish.repo
if ([string]::IsNullOrWhiteSpace($owner) -or [string]::IsNullOrWhiteSpace($repo)) {
  Fail "build.publish[0].owner/repo must be set."
}

$repoSlug = "$owner/$repo"

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($null -eq $gh) {
  Fail "GitHub CLI (gh) is not installed or not in PATH."
}

Write-Host "[release-desktop-local] Checking GitHub CLI auth..."
& $gh.Source auth status --hostname github.com *> $null
Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "gh auth status"

if (-not $SkipVerify) {
  Write-Host "[release-desktop-local] Running updater config verification..."
  & npm.cmd run verify:auto-update-config
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "npm run verify:auto-update-config"
}

if (-not $SkipBuild) {
  Write-Host "[release-desktop-local] Building desktop artifacts..."
  & npm.cmd run dist:desktop
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "npm run dist:desktop"
}

$releaseDir = Join-Path $projectRoot "release"
if (-not (Test-Path -LiteralPath $releaseDir)) {
  Fail "Release directory not found: $releaseDir"
}

$latestYml = Join-Path $releaseDir "latest.yml"
if (-not (Test-Path -LiteralPath $latestYml)) {
  Fail "latest.yml is missing in release/. Auto-update clients require it."
}

$setupAssets = Get-ChildItem -LiteralPath $releaseDir -File |
  Where-Object { $_.Name -like "*-setup.exe" } |
  Sort-Object -Property Name
if ($setupAssets.Count -eq 0) {
  Fail "No installer assets (*-setup.exe) found under $releaseDir"
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

Write-Host "[release-desktop-local] Target repo: $repoSlug"
Write-Host "[release-desktop-local] Tag: $Tag"
Write-Host "[release-desktop-local] Updater assets to upload:"
foreach ($asset in $assetFiles) {
  Write-Host "  - $($asset.Name)"
}

& $gh.Source release view $Tag --repo $repoSlug *> $null
$releaseExists = $LASTEXITCODE -eq 0

if (-not $releaseExists) {
  $createArgs = @("release", "create", $Tag, "--repo", $repoSlug, "--title", $Tag)
  if ($GenerateNotes) {
    $createArgs += "--generate-notes"
  } elseif (-not [string]::IsNullOrWhiteSpace($Notes)) {
    $createArgs += @("--notes", $Notes)
  }
  $createArgs += $assetPaths
  if ($Draft) {
    $createArgs += "--draft"
  }
  if ($PreRelease) {
    $createArgs += "--prerelease"
  }

  Write-Host "[release-desktop-local] Creating release and uploading assets..."
  & $gh.Source @createArgs
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "gh release create"
} else {
  Write-Host "[release-desktop-local] Release already exists. Uploading assets with --clobber..."
  $uploadArgs = @("release", "upload", $Tag, "--repo", $repoSlug, "--clobber") + $assetPaths
  & $gh.Source @uploadArgs
  Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "gh release upload"

  if ($GenerateNotes) {
    Write-Host "[release-desktop-local] Regenerating release notes..."
    & $gh.Source release edit $Tag --repo $repoSlug --generate-notes
    Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "gh release edit --generate-notes"
  } elseif (-not [string]::IsNullOrWhiteSpace($Notes)) {
    Write-Host "[release-desktop-local] Updating release notes..."
    & $gh.Source release edit $Tag --repo $repoSlug --notes $Notes
    Ensure-LastExitCodeZero -Code $LASTEXITCODE -Step "gh release edit"
  }
}

Write-Host "[release-desktop-local] Done."
