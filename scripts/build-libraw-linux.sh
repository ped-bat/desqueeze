#!/usr/bin/env bash
#
# Build LibRaw from source on Linux and install it to /usr/local.
#
# Why not apt? Ubuntu ships LibRaw 0.21.x, which predates several current
# cameras — notably Sony bodies using "Lossless Compressed RAW 2" (A7C II,
# A7R V, …), whose files it rejects outright. macOS and Windows bundle
# 0.22.x, so building from source keeps camera support identical on all
# three platforms instead of silently degrading it on Linux.
#
# After this runs, `npm run setup` finds dcraw_emu on PATH and bundles it
# (with its shared objects) into resources/bin/linux/ via patchelf.
#
# Usage: scripts/build-libraw-linux.sh [version]
#        defaults to the libraw version pinned in resources/dependencies.json

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

VERSION="${1:-$(node -p "require('$ROOT_DIR/resources/dependencies.json').libraw.version")}"
TARBALL="LibRaw-${VERSION}.tar.gz"
URL="https://www.libraw.org/data/${TARBALL}"

echo "Building LibRaw ${VERSION} from source…"

if command -v apt-get >/dev/null 2>&1; then
	sudo apt-get update -qq
	sudo apt-get install -y --no-install-recommends \
		build-essential libjpeg-dev liblcms2-dev zlib1g-dev patchelf curl
fi

BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

curl -fsSL "$URL" -o "$BUILD_DIR/$TARBALL"
tar -xzf "$BUILD_DIR/$TARBALL" -C "$BUILD_DIR"

cd "$BUILD_DIR/LibRaw-${VERSION}"
./configure --prefix=/usr/local --enable-jpeg --enable-lcms >/dev/null

make -j"$(nproc)" >/dev/null
sudo make install >/dev/null
sudo ldconfig

# In the build tree, bin/dcraw_emu is a libtool *wrapper script* that execs
# the real ELF binary in bin/.libs/. Copying it directly would install the
# script, which then fails at runtime looking for a .libs dir that doesn't
# exist next to it. `libtool --mode=install` relinks against the installed
# library and installs a real binary; fall back to the .libs copy if the
# build tree has no libtool wrapper (static build).
if [ -x ./libtool ] && head -c 2 bin/dcraw_emu | grep -q '#!'; then
	sudo ./libtool --mode=install /usr/bin/install -c bin/dcraw_emu /usr/local/bin/dcraw_emu >/dev/null
elif [ -f bin/.libs/dcraw_emu ]; then
	sudo install -m 755 bin/.libs/dcraw_emu /usr/local/bin/dcraw_emu
else
	sudo install -m 755 bin/dcraw_emu /usr/local/bin/dcraw_emu
fi
sudo ldconfig

# Verify we installed a real executable, not a shell wrapper — this is the
# exact failure mode above, and it is invisible until a conversion is run.
INSTALLED="$(command -v dcraw_emu || true)"
if [ -z "$INSTALLED" ]; then
	echo "ERROR: dcraw_emu is not on PATH after install" >&2
	exit 1
fi
if head -c 2 "$INSTALLED" | grep -q '#!'; then
	echo "ERROR: $INSTALLED is a wrapper script, not a real binary:" >&2
	head -3 "$INSTALLED" >&2
	exit 1
fi
if ! "$INSTALLED" 2>&1 | grep -qi "dcraw"; then
	echo "ERROR: $INSTALLED did not run correctly" >&2
	exit 1
fi

echo "Installed: $INSTALLED (LibRaw ${VERSION})"
file "$INSTALLED"
