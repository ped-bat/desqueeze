#!/usr/bin/env bash
# Renders site/assets/og.png (1200x630) from scripts/site/og.html with
# headless Chrome. Re-run whenever the OG template or the wordmark changes.
#
# Chrome writes the screenshot and then, on this machine, hangs on exit
# instead of quitting, so the run is killed once the PNG has landed and
# stopped growing. --timeout (not --virtual-time-budget, which never
# produced a file) gives the page a moment for the font before capture.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
out="$root/site/assets/og.png"
profile="$(mktemp -d)"
rm -f "$out"

"$chrome" --headless=new --disable-gpu --hide-scrollbars --no-sandbox --force-device-scale-factor=1 \
  --window-size=1200,630 --timeout=4000 --screenshot="$out" --user-data-dir="$profile" \
  "file://$here/og.html" >/dev/null 2>&1 &
pid=$!

last=-1
for _ in $(seq 1 60); do
  sleep 1
  if [ -f "$out" ]; then
    now=$(stat -f %z "$out" 2>/dev/null || stat -c %s "$out")
    if [ "$now" -gt 0 ] && [ "$now" = "$last" ]; then
      kill -9 "$pid" 2>/dev/null || true
      sleep 1
      rm -rf "$profile" 2>/dev/null || true
      echo "wrote $out ($now bytes)"
      exit 0
    fi
    last=$now
  fi
done

kill -9 "$pid" 2>/dev/null || true
rm -rf "$profile"
echo "timed out waiting for $out" >&2
exit 1
