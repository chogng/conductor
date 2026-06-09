param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseTag,

  [string]$ReleaseDir = "release",

  [string]$SourceRepo = "chogng/conductor"
)

$ErrorActionPreference = "Stop"

$releaseDirPath = Join-Path $PWD $ReleaseDir
if (-not (Test-Path -LiteralPath $releaseDirPath)) {
  throw "Release directory not found: $releaseDirPath"
}

$assets = Get-ChildItem -Path $releaseDirPath -File | Sort-Object Name
if (-not $assets) {
  throw "No release assets found in $releaseDirPath."
}

gh release view $ReleaseTag -R $SourceRepo *> $null
if ($LASTEXITCODE -ne 0) {
  gh release create $ReleaseTag --title $ReleaseTag --generate-notes -R $SourceRepo
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create release $ReleaseTag in $SourceRepo."
  }
}

$assetPaths = $assets | ForEach-Object { $_.FullName }
gh release upload $ReleaseTag $assetPaths --clobber -R $SourceRepo
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload release assets to $SourceRepo."
}
