#!/usr/bin/env bash
# M2028 extension installer / updater for macOS and Linux.
# Usage: curl -fsSL https://aviatcode.github.io/M2028/install.sh | bash -s -- chrome|brave|edge
set -e
BASE="https://aviatcode.github.io/M2028"
DIR="$HOME/M2028-Extension"
TMP="$DIR.new"
BROWSER="${1:-chrome}"
REQ=(manifest.json background.js content.js wallpaper-bridge.js popup.html popup.js block-ui.js blocked.html blocked.js options.html options.js favicon-32.png icon-192.png)
OPT=(popup.css options.css leaf-icons.css stickers.js offscreen.html offscreen.js index.html pom-duo.webp sussurus1.mp3 icon-512.png apple-touch-icon.png favicon.ico)
STAMP="$(date +%s)"
rm -rf "$TMP"; mkdir -p "$TMP"
echo "Downloading the latest M2028 extension files..."
for f in "${REQ[@]}"; do
  curl -fsSL "$BASE/$f?t=$STAMP" -o "$TMP/$f" || { echo "ERROR: could not download $f"; rm -rf "$TMP"; exit 1; }
done
for f in "${OPT[@]}"; do
  curl -fsSL "$BASE/$f?t=$STAMP" -o "$TMP/$f" 2>/dev/null || rm -f "$TMP/$f"
done
EXISTED=0; [ -f "$DIR/manifest.json" ] && EXISTED=1
mkdir -p "$DIR"; cp -R "$TMP"/. "$DIR"/; rm -rf "$TMP"
VER="$(grep -m1 '"version"' "$DIR/manifest.json" | sed 's/[^0-9.]//g')"
if [ "$EXISTED" = 1 ]; then echo "Updated to v$VER in $DIR. Now click the reload arrow on the M2028 card."
else echo "Installed v$VER in $DIR. Now turn on Developer mode, click Load unpacked, and choose that folder."; fi
if [ "$(uname)" = "Darwin" ]; then
  open "$DIR"
  case "$BROWSER" in
    brave) open -a "Brave Browser" "brave://extensions" ;;
    edge)  open -a "Microsoft Edge" "edge://extensions" ;;
    *)     open -a "Google Chrome" "chrome://extensions" ;;
  esac
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
  [ "$OPENED" = 1 ] || echo "Open $URL in your browser to continue."
  echo "In the folder picker press Ctrl+L and paste: $DIR"
fi
