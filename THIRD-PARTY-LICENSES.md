# Third-Party Software

Desqueeze bundles or depends on the following third-party software. Each
component remains under its own license; the licenses below apply to those
components, not to Desqueeze itself (MIT, see [LICENSE](LICENSE)).

## Bundled command-line tools

These are standalone executables shipped in the application's `bin/`
resources directory and invoked as separate processes. They can be replaced
with your own builds of the same tools by swapping the files in that
directory.

### DNGLab

- Purpose: RAW → DNG conversion (`dnglab convert` / `dnglab makedng`)
- License: **LGPL-2.1** — <https://github.com/dnglab/dnglab/blob/main/LICENSE>
- Source code: <https://github.com/dnglab/dnglab>

### LibRaw (`dcraw_emu` and `libraw` library)

- Purpose: RAW demosaicing to TIFF for non-DNG exports
- License: **LGPL-2.1 or CDDL-1.0** (dual-licensed) — <https://www.libraw.org/about>
- Source code: <https://www.libraw.org/download>

### Bundled dynamic libraries (macOS)

Shipped alongside `dcraw_emu` as its runtime dependencies:

| Library | License |
| --- | --- |
| libraw | LGPL-2.1 / CDDL-1.0 |
| libjpeg (libjpeg-turbo) | IJG, BSD-3-Clause, zlib — <https://github.com/libjpeg-turbo/libjpeg-turbo/blob/main/LICENSE.md> |
| Little CMS (liblcms2) | MIT — <https://github.com/mm2/Little-CMS/blob/master/LICENSE> |
| OpenMP runtime (libomp) | Apache-2.0 WITH LLVM-exception — <https://openmp.llvm.org> |

## Runtime dependencies (npm)

### ExifTool (via `exiftool-vendored`)

- Purpose: reading and writing image metadata (DefaultScale tag, EXIF copy)
- ExifTool by Phil Harvey — **Perl Artistic License / GPL** (same terms as Perl
  itself) — <https://exiftool.org>
- `exiftool-vendored` wrapper — MIT — <https://github.com/photostructure/exiftool-vendored.js>

### sharp / libvips

- Purpose: bitmap decoding, pixel stretch, format encoding
- sharp — **Apache-2.0** — <https://github.com/lovell/sharp>
- libvips — **LGPL-2.1** — <https://github.com/libvips/libvips>

### Application framework and libraries

| Package | License |
| --- | --- |
| Electron | MIT (bundles Chromium and Node.js under their own licenses; see `LICENSES.chromium.html` in the packaged app) |
| lit | BSD-3-Clause |
| p-queue | MIT |
| electron-log | MIT |
| icc | MIT |

## LGPL notice

DNGLab, LibRaw, and libvips are used as unmodified, separately-installed
components (standalone executables or dynamically-linked libraries), as
permitted by the LGPL. Their complete corresponding source code is available
from the links above. To use a modified version of any of these components,
replace the corresponding files in the application's resources — no
relinking of Desqueeze itself is required.
