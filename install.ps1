# M2028 extension installer / updater for Windows (no .exe needed).
#
# Run in PowerShell (this is PowerShell syntax — do NOT use the macOS/Linux
# "curl -fsSL ... | bash" command here, it will not work):
#
#   & ([scriptblock]::Create((irm 'https://aviatcode.github.io/M2028/install.ps1'))) brave
#
# Valid arguments: brave (default), chrome, edge
param([string]$Browser = 'brave')
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Base = 'https://aviatcode.github.io/M2028'
$Dir  = Join-Path $env:LOCALAPPDATA 'M2028-Extension'
$Tmp  = "$Dir.new"
$required = 'manifest.json','background.js','content.js','wallpaper-bridge.js','popup.html','popup.js','block-ui.js','blocked.html','blocked.js','options.html','options.js','favicon-32.png','icon-192.png'
$optional = 'popup.css','options.css','leaf-icons.css','stickers.js','offscreen.html','offscreen.js','index.html','pom-duo.webp','sussurus1.mp3','icon-512.png','apple-touch-icon.png','favicon.ico'

# --- Normalize / validate the browser argument ---
$BrowserNorm = $Browser.Trim().ToLowerInvariant()
if ($BrowserNorm -notin @('brave', 'chrome', 'edge')) {
  Write-Host "Unknown browser '$Browser' — expected brave, chrome, or edge. Defaulting to brave." -ForegroundColor Yellow
  $BrowserNorm = 'brave'
}

function Fail($msg) {
  Write-Host "ERROR: $msg" -ForegroundColor Red
  if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
  exit 1
}

if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force }
New-Item -ItemType Directory -Path $Tmp -Force | Out-Null
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "Downloading the latest M2028 extension files to a staging folder..."
foreach ($f in $required) {
  $dest = Join-Path $Tmp $f
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/${f}?t=$stamp" -OutFile $dest -TimeoutSec 60
  } catch {
    Fail "could not download $f ($($_.Exception.Message))"
  }
  # Catch empty or truncated downloads (e.g. a 200 response with no/zero-byte body).
  $item = Get-Item $dest -ErrorAction SilentlyContinue
  if (-not $item -or $item.Length -eq 0) {
    Fail "downloaded $f but it was empty — the file may have moved or the host is serving an error page"
  }
}
foreach ($f in $optional) {
  $dest = Join-Path $Tmp $f
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/${f}?t=$stamp" -OutFile $dest -TimeoutSec 60
    $item = Get-Item $dest -ErrorAction SilentlyContinue
    if (-not $item -or $item.Length -eq 0) { Remove-Item $dest -Force -ErrorAction SilentlyContinue }
  } catch {
    Remove-Item $dest -Force -ErrorAction SilentlyContinue
  }
}

# Validate the manifest is real JSON with the fields a Chromium extension needs
# before we let it anywhere near the installed copy.
try {
  $manifestObj = Get-Content (Join-Path $Tmp 'manifest.json') -Raw | ConvertFrom-Json
} catch {
  Fail "downloaded manifest.json is not valid JSON ($($_.Exception.Message))"
}
if (-not $manifestObj.manifest_version -or -not $manifestObj.version -or -not $manifestObj.name) {
  Fail "downloaded manifest.json is missing manifest_version/version/name — refusing to install a broken manifest"
}
$ver = $manifestObj.version

# Only now do we touch the real install directory — staged files are known-good.
$existed = Test-Path (Join-Path $Dir 'manifest.json')
$prevVer = $null
if ($existed) {
  try { $prevVer = (Get-Content (Join-Path $Dir 'manifest.json') -Raw | ConvertFrom-Json).version } catch {}
}

$BackupDir = "$Dir.bak"
try {
  if ($existed) {
    if (Test-Path $BackupDir) { Remove-Item $BackupDir -Recurse -Force }
    Rename-Item $Dir (Split-Path $BackupDir -Leaf)
  }
  New-Item -ItemType Directory -Path $Dir -Force | Out-Null
  Copy-Item (Join-Path $Tmp '*') $Dir -Recurse -Force
} catch {
  # Roll back to the previous working install on any failure during the swap.
  Write-Host "ERROR: install step failed ($($_.Exception.Message)) — restoring previous version." -ForegroundColor Red
  if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force -ErrorAction SilentlyContinue }
  if ($existed -and (Test-Path $BackupDir)) { Rename-Item $BackupDir (Split-Path $Dir -Leaf) }
  Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue
  exit 1
}
if (Test-Path $BackupDir) { Remove-Item $BackupDir -Recurse -Force -ErrorAction SilentlyContinue }
Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue

if ($existed) {
  Write-Host "Updated M2028 from v$prevVer to v$ver in $Dir." -ForegroundColor Green
  Write-Host "This does NOT auto-reload the extension. Click the reload arrow on the M2028 card on the extensions page." -ForegroundColor Green
} else {
  Write-Host "Installed v$ver to $Dir." -ForegroundColor Green
  Write-Host "This does NOT load it into the browser automatically. Turn on Developer mode, click 'Load unpacked', and select that folder." -ForegroundColor Green
}

Start-Process explorer.exe $Dir

# --- Find the browser's executable in common locations (most Windows installs do NOT put
#     Chrome/Brave on PATH, so Start-Process <name> alone frequently fails silently). ---
switch ($BrowserNorm) {
  'brave'  { $exeName = 'brave.exe';  $url = 'brave://extensions';  $candidates = @(
                "$env:PROGRAMFILES\BraveSoftware\Brave-Browser\Application\brave.exe",
                "${env:PROGRAMFILES(X86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
                "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe") }
  'edge'   { $exeName = 'msedge.exe'; $url = 'edge://extensions';   $candidates = @(
                "$env:PROGRAMFILES\Microsoft\Edge\Application\msedge.exe",
                "${env:PROGRAMFILES(X86)}\Microsoft\Edge\Application\msedge.exe") }
  default  { $exeName = 'chrome.exe'; $url = 'chrome://extensions'; $candidates = @(
                "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
                "${env:PROGRAMFILES(X86)}\Google\Chrome\Application\chrome.exe",
                "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") }
}

$exePath = $null
$onPath = Get-Command $exeName -ErrorAction SilentlyContinue
if ($onPath) { $exePath = $onPath.Source }
else { $exePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1 }

if ($exePath) {
  try { Start-Process -FilePath $exePath -ArgumentList $url } catch { Write-Host "Open $url in $BrowserNorm to continue." -ForegroundColor Yellow }
} else {
  Write-Host "Could not find $BrowserNorm on this machine. Open $url manually (or install $BrowserNorm first) to continue." -ForegroundColor Yellow
}

exit 0
