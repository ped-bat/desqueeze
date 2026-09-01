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
./configure --prefix=/usr/local --enable-jpeg --enable-lcms --disable-examples >/dev/null

# dcraw_emu lives in the samples, which --disable-examples skips; build the
# library first, then the one sample binary the app actually needs.
make -j"$(nproc)" >/dev/null
sudo make install >/dev/null
sudo ldconfig

make bin/dcraw_emu
sudo install -m 755 bin/dcraw_emu /usr/local/bin/dcraw_emu

echo "Installed: $(command -v dcraw_emu) (LibRaw ${VERSION})"
