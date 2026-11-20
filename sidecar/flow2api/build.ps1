# Build the flow2api sidecar (onedir) into dist-sidecar/flow2api for the Traktiva installer.
# Usage (PowerShell):  ./sidecar/flow2api/build.ps1 [-Src C:\BOT\flow2api]
# Needs the flow2api source with its own venv (Python 3.11) and PyInstaller in that venv
# (uv pip install --python <src>\.venv\Scripts\python.exe pyinstaller).
param([string]$Src = $(if ($env:FLOW2API_SRC) { $env:FLOW2API_SRC } else { "C:\BOT\flow2api" }))
$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\..\.."
$python = Join-Path $Src ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "flow2api venv tidak ditemukan: $python" }
$out = Join-Path $root "dist-sidecar"
$work = Join-Path $root "build\flow2api"

# mypyc-compiled packages (tomli, ...) load a hash-named top-level module PyInstaller cannot see
$mypyc = Get-ChildItem (Join-Path $Src ".venv\Lib\site-packages") -Filter "*__mypyc*.pyd" | ForEach-Object { "--hidden-import", ($_.Name -split "\.")[0] }

Push-Location $Src
try {
  & $python -m PyInstaller "$PSScriptRoot\entry.py" `
    --name flow2api --onedir --noconfirm --clean --console `
    --distpath $out --workpath $work --specpath $work `
    --paths $Src `
    --collect-submodules src `
    --collect-submodules uvicorn `
    --collect-all curl_cffi `
    --collect-all tomli `
    --collect-all playwright `
    --collect-submodules nodriver `
    --add-data "$Src\static;static" `
    --add-data "$Src\config\setting_example.toml;config" `
    --add-data "$Src\LICENSE;." `
    @mypyc
  if ($LASTEXITCODE -ne 0) { throw "PyInstaller gagal ($LASTEXITCODE)" }
} finally { Pop-Location }

# Playwright's own Chromium (~740 MB) is not needed: the captcha browser is the PC's Chrome (BROWSER_EXECUTABLE_PATH)
$browsers = Join-Path $out "flow2api\_internal\playwright\driver\package\.local-browsers"
if (Test-Path $browsers) { Remove-Item $browsers -Recurse -Force }

# version stamp: Traktiva re-copies the bundle into the user's data folder when this changes
$commit = (git -C $Src rev-parse --short HEAD 2>$null)
if (-not $commit) { $commit = "local" }
"$commit-$(Get-Date -Format yyyyMMddHHmmss)" | Set-Content -NoNewline -Encoding ascii (Join-Path $out "flow2api\VERSION")
Write-Host "OK -> $out\flow2api"
