# M2028 extension installer / updater for Windows (no .exe needed).
# Run in PowerShell:  & ([scriptblock]::Create((irm 'https://aviatcode.github.io/M2028/install.ps1'))) chrome
param([string]$Browser = 'chrome')
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Base = 'https://aviatcode.github.io/M2028'
$Dir  = Join-Path $env:LOCALAPPDATA 'M2028-Extension'
$Tmp  = "$Dir.new"
$required = 'manifest.json','background.js','content.js','wallpaper-bridge.js','popup.html','popup.js','block-ui.js','blocked.html','blocked.js','options.html','options.js','favicon-32.png','icon-192.png'
$optional = 'popup.css','options.css','leaf-icons.css','stickers.js','offscreen.html','offscreen.js','index.html','pom-duo.webp','sussurus1.mp3','icon-512.png','apple-touch-icon.png','favicon.ico'
if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force }
New-Item -ItemType Directory -Path $Tmp -Force | Out-Null
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
Write-Host 'Downloading the latest M2028 extension files...'
foreach ($f in $required) {
  try { Invoke-WebRequest -UseBasicParsing -Uri "$Base/${f}?t=$stamp" -OutFile (Join-Path $Tmp $f) -TimeoutSec 60 }
  catch { Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue; Write-Host "ERROR: could not download $f" -ForegroundColor Red; return }
}
foreach ($f in $optional) {
  try { Invoke-WebRequest -UseBasicParsing -Uri "$Base/${f}?t=$stamp" -OutFile (Join-Path $Tmp $f) -TimeoutSec 60 } catch {}
}
$existed = Test-Path (Join-Path $Dir 'manifest.json')
New-Item -ItemType Directory -Path $Dir -Force | Out-Null
Copy-Item (Join-Path $Tmp '*') $Dir -Recurse -Force
Remove-Item $Tmp -Recurse -Force
$ver = (Get-Content (Join-Path $Dir 'manifest.json') -Raw | ConvertFrom-Json).version
if ($existed) { Write-Host "Updated to v$ver in $Dir. Now click the reload arrow on the M2028 card." -ForegroundColor Green }
else { Write-Host "Installed v$ver in $Dir. Now turn on Developer mode, click Load unpacked, and choose that folder." -ForegroundColor Green }
Start-Process explorer.exe $Dir
switch ($Browser) {
  'brave' { $exe = 'brave';  $url = 'brave://extensions' }
  'edge'  { $exe = 'msedge'; $url = 'edge://extensions' }
  default { $exe = 'chrome'; $url = 'chrome://extensions' }
}
try { Start-Process $exe $url } catch { Write-Host "Open $url in your browser to continue." }
