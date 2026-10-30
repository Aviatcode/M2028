#!/usr/bin/env bash
# M2028 extension installer / updater for macOS and Linux.
# Usage: curl -fsSL https://aviatcode.github.io/M2028/install.sh | bash -s -- brave|chrome|edge
# (Windows PowerShell users: this is a Bash script and will not run in PowerShell.
#  Use install.ps1 instead — see README.md.)
set -e
BASE="https://aviatcode.github.io/M2028"
DIR="$HOME/M2028-Extension"
TMP="$DIR.new"
BAK="$DIR.bak"
BROWSER="$(printf '%s' "${1:-brave}" | tr '[:upper:]' '[:lower:]')"
case "$BROWSER" in
  brave|chrome|edge) ;;
  *) echo "Unknown browser '$BROWSER' — expected brave, chrome, or edge. Defaulting to brave."; BROWSER="brave" ;;
esac
REQ=(manifest.json background.js content.js wallpaper-bridge.js popup.html popup.js block-ui.js blocked.html blocked.js options.html options.js favicon-32.png icon-192.png)
OPT=(popup.css options.css leaf-icons.css stickers.js offscreen.html offscreen.js index.html pom-duo.webp sussurus1.mp3 icon-512.png apple-touch-icon.png favicon.ico)
STAMP="$(date +%s)"

fail() { echo "ERROR: $1"; rm -rf "$TMP"; exit 1; }

# Pull just the "version" field out of a manifest.json precisely — not by stripping
# every non-digit from the file, which would also grab the "3" in manifest_version
# or any digits in the app name if the JSON is ever minified onto one line.
manifest_version() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import json,sys
try:
    print(json.load(open(sys.argv[1])).get('version',''))
except Exception:
    print('')" "$1" 2>/dev/null
  else
    grep -o '"version"[[:space:]]*:[[:space:]]*"[0-9][0-9.]*"' "$1" 2>/dev/null | head -1 | sed -E 's/.*"([0-9][0-9.]*)"$/\1/'
  fi
}

rm -rf "$TMP"; mkdir -p "$TMP"
echo "Downloading the latest M2028 extension files to a staging folder..."
for f in "${REQ[@]}"; do
  curl -fsSL "$BASE/$f?t=$STAMP" -o "$TMP/$f" || fail "could not download $f"
  # Catch empty/truncated downloads (e.g. a 200 response with no body or an error page).
  [ -s "$TMP/$f" ] || fail "downloaded $f but it was empty — the file may have moved or the host returned an error page"
done
for f in "${OPT[@]}"; do
  curl -fsSL "$BASE/$f?t=$STAMP" -o "$TMP/$f" 2>/dev/null || true
  [ -s "$TMP/$f" ] || rm -f "$TMP/$f"
done

# Validate the manifest before it goes anywhere near the real install.
if command -v python3 >/dev/null 2>&1; then
  python3 -c "
import json, sys
try:
    m = json.load(open('$TMP/manifest.json'))
except Exception as e:
    sys.exit('manifest.json is not valid JSON: %s' % e)
for k in ('manifest_version', 'version', 'name'):
    if not m.get(k):
        sys.exit('manifest.json is missing required field: %s' % k)
" || fail "manifest.json failed validation"
else
  grep -q '"manifest_version"' "$TMP/manifest.json" || fail "downloaded manifest.json has no manifest_version field"
fi
VER="$(manifest_version "$TMP/manifest.json")"
[ -n "$VER" ] || fail "could not read a version from the downloaded manifest.json"

EXISTED=0
[ -f "$DIR/manifest.json" ] && EXISTED=1
PREV_VER=""
[ "$EXISTED" = 1 ] && PREV_VER="$(manifest_version "$DIR/manifest.json")"

# Stage the swap with a backup so a failure mid-copy can be rolled back.
rm -rf "$BAK"
if [ "$EXISTED" = 1 ]; then mv "$DIR" "$BAK"; fi
if mkdir -p "$DIR" && cp -R "$TMP"/. "$DIR"/; then
  rm -rf "$BAK" "$TMP"
else
  echo "ERROR: install step failed — restoring previous version."
  rm -rf "$DIR"
  [ "$EXISTED" = 1 ] && mv "$BAK" "$DIR"
  rm -rf "$TMP"
  exit 1
fi

if [ "$EXISTED" = 1 ]; then
  echo "Updated M2028 from v${PREV_VER:-unknown} to v$VER in $DIR."
  echo "This does NOT auto-reload the extension. Click the reload arrow on the M2028 card."
else
  echo "Installed v$VER in $DIR."
  echo "This does NOT load it into the browser automatically. Turn on Developer mode, click 'Load unpacked', and choose that folder."
fi

if [ "$(uname)" = "Darwin" ]; then
  open "$DIR"
  case "$BROWSER" in
    brave) APP="Brave Browser"; URL="brave://extensions" ;;
    edge)  APP="Microsoft Edge"; URL="edge://extensions" ;;
    *)     APP="Google Chrome"; URL="chrome://extensions" ;;
  esac
  if open -a "$APP" "$URL" 2>/dev/null; then :; else
    echo "Could not find $APP on this Mac. Open $URL manually once it's installed."
  fi
else
  # Linux: open the folder and the browser's extensions page (first browser binary found)
  command -v xdg-open >/dev/null 2>&1 && (xdg-open "$DIR" >/dev/null 2>&1 &) || true
  case "$BROWSER" in
    brave) URL="brave://extensions"; CANDS="brave-browser brave brave-browser-stable" ;;
    edge)  URL="edge://extensions";  CANDS="microsoft-edge microsoft-edge-stable" ;;
    *)     URL="chrome://extensions"; CANDS="google-chrome google-chrome-stable chromium chromium-browser" ;;
  esac
  OPENED=0
  for b in $CANDS; do
    if command -v "$b" >/dev/null 2>&1; then ("$b" "$URL" >/dev/null 2>&1 &); OPENED=1; break; fi
  done
  [ "$OPENED" = 1 ] || echo "Could not find $BROWSER on this machine. Open $URL manually once it's installed."
  echo "In the folder picker press Ctrl+L and paste: $DIR"
fi
