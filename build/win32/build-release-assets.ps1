param(
  [string]$ReleaseDir = "release"
)

$ErrorActionPreference = "Stop"

$releaseDirPath = Join-Path $PWD $ReleaseDir
if (-not (Test-Path -LiteralPath $releaseDirPath)) {
  throw "Release directory not found: $releaseDirPath"
}

$exeArtifacts = Get-ChildItem -Path $releaseDirPath -File |
  Where-Object { $_.Extension -eq ".exe" } |
  Sort-Object Name

if (-not $exeArtifacts) {
  throw "No Windows executable artifacts found in $releaseDirPath."
}

$statuses = foreach ($artifact in $exeArtifacts) {
  $signature = Get-AuthenticodeSignature -FilePath $artifact.FullName
  [PSCustomObject]@{
    Name = $artifact.Name
    Status = [string]$signature.Status
    Subject = [string]$signature.SignerCertificate.Subject
  }
}

$allValid = ($statuses | Where-Object { $_.Status -ne "Valid" }).Count -eq 0
$subject = $statuses | Where-Object { $_.Subject } | Select-Object -First 1 -ExpandProperty Subject

"signed=$($allValid.ToString().ToLowerInvariant())" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
"subject=$subject" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append

$statuses |
  ForEach-Object {
    "{0}`t{1}`t{2}" -f $_.Name, $_.Status, $_.Subject
  } |
  Set-Content -Path (Join-Path $releaseDirPath "WINDOWS-SIGNATURES.txt") -Encoding utf8

$artifacts = Get-ChildItem -Path $releaseDirPath -File |
  Where-Object { $_.Extension -in ".exe", ".zip", ".appx", ".msix" } |
  Sort-Object Name

if (-not $artifacts) {
  throw "No Windows release artifacts found in $releaseDirPath."
}

$checksumLines = foreach ($artifact in $artifacts) {
  $hash = (Get-FileHash -Path $artifact.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "{0}  {1}" -f $hash, $artifact.Name
}

Set-Content -Path (Join-Path $releaseDirPath "SHA256SUMS.txt") -Value $checksumLines -Encoding ascii

if ($allValid) {
  $publisher = $subject
  if (-not $publisher) {
    $publisher = "the configured code-signing certificate"
  }

  $infoLines = @(
    "conductor Windows downloads"
    ""
    "These Windows binaries are Authenticode-signed by $publisher."
    ""
    "Recommended package:"
    "- Prefer the *-setup.exe installer for non-Store installs."
    "- Use the *-store.appx package for Microsoft Store submission."
    "- Use the *-portable.zip archive for the broadest compatibility."
    ""
    "How to verify a download in PowerShell:"
    "1. Download the app file and SHA256SUMS.txt from this release."
    "2. Run: Get-FileHash .\<filename> -Algorithm SHA256"
    "3. Compare the SHA256 value with the matching line in SHA256SUMS.txt."
    "4. Optional: Run Get-AuthenticodeSignature .\<filename> and confirm Status is Valid."
    ""
    "Files in this release:"
  )
} else {
  $infoLines = @(
    "conductor Windows downloads"
    ""
    "These Windows binaries are unsigned. Microsoft Defender SmartScreen may show an 'Unknown publisher' warning the first time they are opened."
    ""
    "Recommended package:"
    "- Prefer the *-setup.exe installer for non-Store installs."
    "- Use the *-store.appx package for Microsoft Store submission."
    "- Use the *-portable.zip archive for the broadest compatibility."
    ""
    "How to verify a download in PowerShell:"
    "1. Download the app file and SHA256SUMS.txt from this release."
    "2. Run: Get-FileHash .\<filename> -Algorithm SHA256"
    "3. Compare the SHA256 value with the matching line in SHA256SUMS.txt."
    ""
    "Files in this release:"
  )
}

$infoLines += $artifacts | ForEach-Object { "- $($_.Name)" }
Set-Content -Path (Join-Path $releaseDirPath "WINDOWS-DOWNLOADS.txt") -Value $infoLines -Encoding utf8
