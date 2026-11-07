# M2028 extension installer / updater for Windows (no .exe needed).
#
# Run in PowerShell (this is PowerShell syntax — do NOT use the macOS/Linux
# "curl -fsSL ... | bash" command here, it will not work):
#
#   & ([scriptblock]::Create((irm 'https://aviatcode.github.io/M2028/install.ps1'))) brave
#
# Valid arguments: brave (default), chrome, edge
#
# Optional switches (add after the browser name):
#   -Schedule     Set up a background task that silently re-runs this installer once a day,
#                 so the extension FILES stay current without you ever running the command
#                 again. Chromium still requires a manual click of the reload arrow on
#                 chrome://extensions (or brave://, edge://) to pick up the new files — that
#                 step can't be automated for an unpacked/developer-mode extension, by design,
#                 regardless of this script. This just removes the "copy/paste a command"
#                 part. No admin rights needed; runs only while you're logged in.
#   -Unschedule   Remove that background task.
#   -Quiet        Print less and skip copying the folder path to the clipboard (used by the
#                 scheduled run itself; you can also pass it by hand for a silent update).
#
# This installer NEVER opens a browser or Explorer window. When it finishes it copies the install
# folder path to your clipboard, so the one-time "Load unpacked" step is just: Ctrl+V.
#
# Examples:
#   & ([scriptblock]::Create((irm 'https://aviatcode.github.io/M2028/install.ps1'))) brave -Schedule
#   & ([scriptblock]::Create((irm 'https://aviatcode.github.io/M2028/install.ps1'))) brave -Unschedule
param([string]$Browser = 'brave', [switch]$Schedule, [switch]$Unschedule, [switch]$Quiet)
$IsFile = [bool]$PSCommandPath   # true for the scheduled run (-File); false when pasted as a command
# `exit` would close the user's whole terminal when this is pasted as a command, so we stop with a private exception instead.
function Stop-M2028([int]$code) { if ($IsFile) { exit $code } else { throw 'M2028_STOP' } }
try {
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Base = 'https://aviatcode.github.io/M2028'
$Dir  = Join-Path $env:LOCALAPPDATA 'M2028-Extension'
$Tmp  = "$Dir.new"
$required = 'manifest.json','background.js','content.js','detect.js','wallpaper-bridge.js','popup.html','popup.js','block-ui.js','blocked.html','blocked.js','options.html','options.js','favicon-32.png','icon-192.png'
$optional = 'popup.css','options.css','leaf-icons.css','stickers.js','offscreen.html','offscreen.js','index.html','pom-duo.webp','sussurus1.mp3','icon-512.png','apple-touch-icon.png','favicon.ico'
$TaskName = 'M2028AutoUpdate'

if ($Unschedule) {
  try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop }
  catch { } # fine if it never existed
  Write-Host "Removed the background auto-update task (if it existed). Manual 'copy install command' updates are back to how they were." -ForegroundColor Green
  return
}

# --- Normalize / validate the browser argument ---
$BrowserNorm = $Browser.Trim().ToLowerInvariant()
if ($BrowserNorm -notin @('brave', 'chrome', 'edge')) {
  Write-Host "Unknown browser '$Browser' — expected brave, chrome, or edge. Defaulting to brave." -ForegroundColor Yellow
  $BrowserNorm = 'brave'
}

function Fail($msg) {
  Write-Host "ERROR: $msg" -ForegroundColor Red
  if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
  Stop-M2028 1
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
  # The folder is rebuilt from the download, which does not contain install.ps1 itself. Keep the copy the
  # scheduled task runs, otherwise the daily update would silently stop after its first run.
  $oldSelf = Join-Path $BackupDir 'install.ps1'
  if ($existed -and (Test-Path $oldSelf)) { Copy-Item $oldSelf (Join-Path $Dir 'install.ps1') -Force }
} catch {
  # Roll back to the previous working install on any failure during the swap.
  Write-Host "ERROR: install step failed ($($_.Exception.Message)) — restoring previous version." -ForegroundColor Red
  if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force -ErrorAction SilentlyContinue }
  if ($existed -and (Test-Path $BackupDir)) { Rename-Item $BackupDir (Split-Path $Dir -Leaf) }
  Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue
  Stop-M2028 1
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

# --- Optional: schedule this installer to silently re-run once a day, so the FILES on disk
#     stay current without you ever running the command again. The browser still needs a
#     manual reload click (see the header comment) — that part cannot be automated for an
#     unpacked extension. Requires no admin rights; only runs while you're logged in. ---
if ($Schedule) {
  try {
    $selfCopy = Join-Path $Dir 'install.ps1'
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/install.ps1?t=$stamp" -OutFile $selfCopy -TimeoutSec 60
    $psExe = (Get-Process -Id $PID).Path
    if (-not $psExe) { $psExe = 'powershell.exe' }
    # Built-in ScheduledTasks cmdlets (Windows 10/11, no extra install) take structured
    # parameters instead of a hand-quoted command line, so there's no quoting to get wrong.
    $taskArgs = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $selfCopy + '" -Browser ' + $BrowserNorm + ' -Quiet'
    $action  = New-ScheduledTaskAction -Execute $psExe -Argument $taskArgs
    $trigger = New-ScheduledTaskTrigger -Daily -At '09:00'
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Silently refreshes the M2028 extension files once a day. Does not touch the browser itself.' -Force | Out-Null
    Write-Host "Scheduled a silent daily check — the extension files will stay current on their own. You'll still need to click the reload arrow on $BrowserNorm's extensions page when the website shows 'Update available'. Run with -Unschedule to turn this off." -ForegroundColor Green
  } catch {
    Write-Host "Could not set up the scheduled task ($($_.Exception.Message)). The install itself still succeeded — you can keep updating manually, or try -Schedule again." -ForegroundColor Yellow
  }
}

if ($Quiet) { return }

# No windows are opened. Put the folder path on the clipboard so "Load unpacked" is just Ctrl+V.
$copied = $false
try { Set-Clipboard -Value $Dir; $copied = $true } catch {}
$url = @{ brave = 'brave://extensions'; edge = 'edge://extensions'; chrome = 'chrome://extensions' }[$BrowserNorm]
Write-Host ''
Write-Host ("Folder: $Dir" + $(if ($copied) { '   (path copied to your clipboard)' } else { '' }))
if (-not $existed) {
  Write-Host "Next (first time only): open $url, switch on Developer mode, click Load unpacked, press Ctrl+V, press Enter, then Select Folder."
}

} catch {
  if ($_.Exception.Message -ne 'M2028_STOP') {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($IsFile) { exit 1 }
  }
}
