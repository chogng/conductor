param(
  [string]$SourceIcon = "",
  [string]$HeaderSourceIcon = "",
  [string]$SidebarSourceIcon = "",
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"

function Fail {
  param([string]$Message)
  throw "[generate-icons] $Message"
}

function Resolve-ProjectPath {
  param([string]$RelativePath)
  return Join-Path $projectRoot $RelativePath
}

function New-ResizedBitmap {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$Size
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage($Source, 0, 0, $Size, $Size)
  $graphics.Dispose()
  return $bitmap
}

function Save-ResizedPng {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$Size,
    [string]$OutputPath
  )

  $bitmap = New-ResizedBitmap -Source $Source -Size $Size
  try {
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bitmap.Dispose()
  }
}

function Save-AppxPng {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$Width,
    [int]$Height,
    [int]$IconSize,
    [string]$OutputPath
  )

  $bitmap = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $logo = New-ResizedBitmap -Source $Source -Size $IconSize
  try {
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $x = [int](($Width - $IconSize) / 2)
    $y = [int](($Height - $IconSize) / 2)
    $graphics.DrawImage($logo, $x, $y, $IconSize, $IconSize)
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $logo.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Write-MultiSizeIco {
  param(
    [System.Drawing.Bitmap]$Source,
    [string]$OutputPath
  )

  $icoSizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
  $entries = @()

  foreach ($size in $icoSizes) {
    $bitmap = New-ResizedBitmap -Source $Source -Size $size
    $stream = New-Object System.IO.MemoryStream
    try {
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      $entries += [PSCustomObject]@{
        Size = $size
        Bytes = $stream.ToArray()
      }
    } finally {
      $stream.Dispose()
      $bitmap.Dispose()
    }
  }

  $fileStream = [System.IO.File]::Create($OutputPath)
  $writer = New-Object System.IO.BinaryWriter $fileStream
  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$entries.Count)

    $offset = 6 + ($entries.Count * 16)
    foreach ($entry in $entries) {
      $widthByte = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
      $writer.Write([byte]$widthByte)
      $writer.Write([byte]$widthByte)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$entry.Bytes.Length)
      $writer.Write([UInt32]$offset)
      $offset += $entry.Bytes.Length
    }

    foreach ($entry in $entries) {
      $writer.Write($entry.Bytes)
    }
  } finally {
    $writer.Dispose()
    $fileStream.Dispose()
  }
}

function Draw-CenteredText {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Text,
    [System.Drawing.Font]$Font,
    [System.Drawing.Brush]$Brush,
    [float]$Y,
    [float]$Width,
    [float]$Height = 24
  )

  $format = New-Object System.Drawing.StringFormat
  try {
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Near
    $rect = New-Object System.Drawing.RectangleF 0, $Y, $Width, $Height
    $Graphics.DrawString($Text, $Font, $Brush, $rect, $format)
  } finally {
    $format.Dispose()
  }
}

function Write-InstallerHeader {
  param(
    [System.Drawing.Bitmap]$Source,
    [string]$OutputPath
  )

  $header = New-Object System.Drawing.Bitmap 150, 57, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($header)
  $logo = New-ResizedBitmap -Source $Source -Size 128
  $titleFont = New-Object System.Drawing.Font "Segoe UI", 8.5, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Point)
  $captionFont = New-Object System.Drawing.Font "Segoe UI", 6.5, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Point)
  $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(34, 34, 34))
  $mutedBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(92, 90, 84))

  try {
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::FromArgb(245, 244, 239))
    $graphics.DrawImage($logo, 12, 12, 32, 32)
    $graphics.DrawString("Conductor Studio", $titleFont, $textBrush, 52, 14)
    $graphics.DrawString("Setup", $captionFont, $mutedBrush, 53, 31)
    $header.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
  } finally {
    $mutedBrush.Dispose()
    $textBrush.Dispose()
    $captionFont.Dispose()
    $titleFont.Dispose()
    $logo.Dispose()
    $graphics.Dispose()
    $header.Dispose()
  }
}

function Write-InstallerSidebar {
  param(
    [System.Drawing.Bitmap]$Source,
    [string]$OutputPath,
    [string]$DisplayVersion
  )

  $sidebar = New-Object System.Drawing.Bitmap 164, 314, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($sidebar)
  $rect = New-Object System.Drawing.Rectangle 0, 0, 164, 314
  $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(15, 15, 18)), ([System.Drawing.Color]::FromArgb(36, 35, 42)), ([System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $logo = New-ResizedBitmap -Source $Source -Size 128
  $whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(250, 249, 245))
  $softBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(212, 208, 226))
  $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(95, 91, 118)), 1
  $titleFont = New-Object System.Drawing.Font "Segoe UI", 10, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Point)
  $captionFont = New-Object System.Drawing.Font "Segoe UI", 7, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Point)

  try {
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.FillRectangle($gradient, $rect)
    $graphics.DrawImage($logo, 43, 42, 78, 78)
    Draw-CenteredText -Graphics $graphics -Text "Conductor Studio" -Font $titleFont -Brush $whiteBrush -Y 138 -Width 164
    Draw-CenteredText -Graphics $graphics -Text "Conductor Workspace" -Font $captionFont -Brush $softBrush -Y 163 -Width 164
    $graphics.DrawLine($linePen, 38, 220, 126, 220)
    Draw-CenteredText -Graphics $graphics -Text $DisplayVersion -Font $captionFont -Brush $softBrush -Y 238 -Width 164
    $sidebar.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
  } finally {
    $captionFont.Dispose()
    $titleFont.Dispose()
    $linePen.Dispose()
    $softBrush.Dispose()
    $whiteBrush.Dispose()
    $logo.Dispose()
    $gradient.Dispose()
    $graphics.Dispose()
    $sidebar.Dispose()
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$win32Dir = Resolve-ProjectPath "resources\win32"
$darwinDir = Resolve-ProjectPath "resources\darwin"
$linuxDir = Resolve-ProjectPath "resources\linux"
$appxDir = Join-Path $win32Dir "appx"
$packageJsonPath = Resolve-ProjectPath "package.json"

if (-not (Test-Path -LiteralPath $packageJsonPath)) {
  Fail "package.json not found at $packageJsonPath"
}

if ([string]::IsNullOrWhiteSpace($SourceIcon)) {
  $SourceIcon = Resolve-ProjectPath "resources\win32\icon-2160.png"
} elseif (-not [System.IO.Path]::IsPathRooted($SourceIcon)) {
  $SourceIcon = Resolve-ProjectPath $SourceIcon
}

if (-not (Test-Path -LiteralPath $SourceIcon)) {
  Fail "source icon not found at $SourceIcon"
}

if ([string]::IsNullOrWhiteSpace($HeaderSourceIcon)) {
  $defaultHeaderSourceIcon = Resolve-ProjectPath "resources\win32\header-icon.png"
  if (Test-Path -LiteralPath $defaultHeaderSourceIcon) {
    $HeaderSourceIcon = $defaultHeaderSourceIcon
  } else {
    $HeaderSourceIcon = $SourceIcon
  }
} elseif (-not [System.IO.Path]::IsPathRooted($HeaderSourceIcon)) {
  $HeaderSourceIcon = Resolve-ProjectPath $HeaderSourceIcon
}

if (-not (Test-Path -LiteralPath $HeaderSourceIcon)) {
  Fail "header source icon not found at $HeaderSourceIcon"
}

if ([string]::IsNullOrWhiteSpace($SidebarSourceIcon)) {
  $defaultSidebarSourceIcon = Resolve-ProjectPath "resources\win32\sidebar-icon.png"
  if (Test-Path -LiteralPath $defaultSidebarSourceIcon) {
    $SidebarSourceIcon = $defaultSidebarSourceIcon
  } else {
    $SidebarSourceIcon = $SourceIcon
  }
} elseif (-not [System.IO.Path]::IsPathRooted($SidebarSourceIcon)) {
  $SidebarSourceIcon = Resolve-ProjectPath $SidebarSourceIcon
}

if (-not (Test-Path -LiteralPath $SidebarSourceIcon)) {
  Fail "sidebar source icon not found at $SidebarSourceIcon"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  try {
    $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    Fail "failed to parse package.json: $($_.Exception.Message)"
  }
  $Version = [string]$packageJson.version
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  Fail "version is empty"
}

New-Item -ItemType Directory -Force -Path $win32Dir, $darwinDir, $linuxDir, $appxDir | Out-Null
Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::FromFile($SourceIcon)
$headerSource = [System.Drawing.Bitmap]::FromFile($HeaderSourceIcon)
$sidebarSource = [System.Drawing.Bitmap]::FromFile($SidebarSourceIcon)
try {
  $pngSizes = @(16, 20, 24, 32, 40, 48, 64, 70, 71, 128, 150, 256, 300, 512, 1024, 1080)
  foreach ($size in $pngSizes) {
    Save-ResizedPng -Source $source -Size $size -OutputPath (Join-Path $win32Dir "icon-$size.png")
  }

  Save-ResizedPng -Source $source -Size 1024 -OutputPath (Join-Path $linuxDir "icon.png")
  Write-MultiSizeIco -Source $source -OutputPath (Join-Path $win32Dir "icon.ico")
  Save-AppxPng -Source $source -Width 44 -Height 44 -IconSize 44 -OutputPath (Join-Path $appxDir "Square44x44Logo.png")
  Save-AppxPng -Source $source -Width 50 -Height 50 -IconSize 50 -OutputPath (Join-Path $appxDir "StoreLogo.png")
  Save-AppxPng -Source $source -Width 71 -Height 71 -IconSize 71 -OutputPath (Join-Path $appxDir "SmallTile.png")
  Save-AppxPng -Source $source -Width 150 -Height 150 -IconSize 150 -OutputPath (Join-Path $appxDir "Square150x150Logo.png")
  Save-AppxPng -Source $source -Width 310 -Height 150 -IconSize 150 -OutputPath (Join-Path $appxDir "Wide310x150Logo.png")
  Save-AppxPng -Source $source -Width 310 -Height 310 -IconSize 310 -OutputPath (Join-Path $appxDir "LargeTile.png")
  Write-InstallerHeader -Source $headerSource -OutputPath (Join-Path $win32Dir "header.bmp")
  Write-InstallerSidebar -Source $sidebarSource -OutputPath (Join-Path $win32Dir "sidebar.bmp") -DisplayVersion $Version
} finally {
  $sidebarSource.Dispose()
  $headerSource.Dispose()
  $source.Dispose()
}

Write-Host "[generate-icons] Source: $SourceIcon"
Write-Host "[generate-icons] Header source: $HeaderSourceIcon"
Write-Host "[generate-icons] Sidebar source: $SidebarSourceIcon"
Write-Host "[generate-icons] Version: $Version"
Write-Host "[generate-icons] Updated resources/win32 and resources/linux generated assets."
Write-Host "[generate-icons] Keep the macOS icon at resources/darwin/icon.icns in sync with the source artwork."
