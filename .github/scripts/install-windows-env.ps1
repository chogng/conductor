param(
  [string]$CacheRoot = ".device"
)

$ErrorActionPreference = "Stop"

$cacheRootPath = Join-Path $env:GITHUB_WORKSPACE $CacheRoot
New-Item -ItemType Directory -Force -Path $cacheRootPath | Out-Null

$envMap = [ordered]@{
  UV_CACHE_DIR = Join-Path $cacheRootPath "uv-cache"
  UV_PYTHON_INSTALL_DIR = Join-Path $cacheRootPath "uv-python"
  PIP_CACHE_DIR = Join-Path $cacheRootPath "pip-cache"
  PYINSTALLER_CONFIG_DIR = Join-Path $cacheRootPath "pyinstaller-cache"
  ELECTRON_CACHE = Join-Path $cacheRootPath "electron-cache"
  ELECTRON_BUILDER_CACHE = Join-Path $cacheRootPath "electron-builder-cache"
  npm_config_cache = Join-Path $cacheRootPath "npm-cache"
}

foreach ($entry in $envMap.GetEnumerator()) {
  "$($entry.Key)=$($entry.Value)" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
}
