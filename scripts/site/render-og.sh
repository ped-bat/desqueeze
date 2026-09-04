#!/usr/bin/env bash
# Renders site/assets/og.png (1200x630) from scripts/site/og.html with
# headless Chrome. Re-run whenever the OG template or the wordmark changes.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
out="$root/site/assets/og.png"
tmp="$(mktemp -d)"
"$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --screenshot="$out" --user-data-dir="$tmp" \
  --virtual-time-budget=3000 "file://$here/og.html" >/dev/null 2>&1
rm -rf "$tmp"
echo "wrote $out"
