# Desqueeze

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)]()

**Desktop app for desqueezing anamorphic photos and RAW files.**

Anamorphic lenses capture a horizontally compressed image. Desqueeze restores the correct aspect ratio by writing DNG metadata (`DefaultScale`) — no destructive pixel resampling, no quality loss.

---

## What is Desqueezing?

Anamorphic lenses (common in cinema and adapted for still photography) squeeze a wider field of view onto the sensor. The resulting image looks horizontally compressed and needs to be "desqueezed" to restore the intended proportions.

| Before (squeezed) | After (desqueezed) |
|---|---|
| Subjects appear tall and narrow | Correct proportions restored |

Common anamorphic squeeze factors:

| Lens Type | Ratio X | Ratio Y | Stretch |
|---|---|---|---|
| 1.33× anamorphic | 1.33 | 1 | 1.33× |
| 1.5× anamorphic | 1.5 | 1 | 1.5× |
| 2× anamorphic (cinema) | 2 | 1 | 2× |

---

## Features

- **Non-destructive desqueeze** — writes DNG `DefaultScale` metadata instead of resampling pixels
- **RAW support** — converts 25+ RAW formats to DNG via [DNGLab](https://github.com/dnglab/dnglab)
- **Bitmap support** — converts JPG, PNG, TIFF, WebP to DNG with proper color profiles
- **Batch processing** — drag-and-drop entire folders, process multiple files in parallel
- **Color-accurate** — dual-illuminant DNG profiles for proper D65↔D50 chromatic adaptation
- **macOS app** — Windows/Linux support planned (binaries are currently bundled for macOS only)

<!-- BEGIN:RAW_FORMATS -->
### Supported RAW Formats

`.3fr` `.ari` `.arw` `.cr2` `.cr3` `.crw` `.dcr` `.dcs` `.dng` `.erf` `.iiq` `.kdc` `.mef` `.mos` `.mrw` `.nef` `.nrw` `.orf` `.pef` `.raf` `.raw` `.rw2` `.sr2` `.srf` `.srw`
<!-- END:RAW_FORMATS -->

### Supported Bitmap Formats

`.jpg` `.jpeg` `.png` `.tif` `.tiff` `.webp`

<!-- BEGIN:SUPPORTED_CAMERAS -->
### Supported Cameras

825 cameras from 32 manufacturers — see [cameras.json](resources/cameras.json) for the full list.
<!-- END:SUPPORTED_CAMERAS -->

---

## System Requirements

- **Node.js** ≥ 18
- **DNGLab** — must be installed on the system (`brew install dnglab`)
- **LibRaw** — provides `dcraw_emu` for RAW exports (`brew install libraw`)
- **OS**: macOS

---

## Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up DNGLab Binary

This copies the system-installed `dnglab` and `dcraw_emu` binaries into the app's resources for bundling:

```bash
npm run setup
```

> **Note:** You must have the binaries installed first: `brew install dnglab libraw`

### 3. Run in Development

```bash
npm run dev
```

---

## Building for Distribution

Build the app with the bundled DNGLab binary:

```bash
npm run dist
```

This creates a distributable app in the `dist/` folder.

| Platform | Build Target |
|---|---|
| macOS | `.dmg` |

---

## Usage

1. **Set the ratio** — Enter your anamorphic lens squeeze factor (e.g., `1.33` × `1`)
2. **Drop files** — Drag and drop image files or folders onto the drop zone (or click to browse)
3. **Output** — Desqueezed DNG files are saved in a `desqueezed/` subfolder next to the originals

---

## Architecture

```
src/main/
├── index.js                    # AppManager — Electron lifecycle
├── config.js                   # AppConfig — constants, formats, defaults
├── logger.js                   # Logging (electron-log)
├── ipc/                        # IPC layer (Electron ↔ Renderer)
│   ├── index.js                # IpcRegistry — channel registration
│   ├── file-handler.js         # FileHandler — file dialogs, path expansion
│   └── process-handler.js      # ProcessHandler — desqueeze dispatch
├── services/                   # Shared services (singletons, wrappers)
│   ├── binary-resolver.js      # BinaryResolver — locates bundled binaries
│   ├── exiftool-service.js     # ExifToolService — EXIF read/write lifecycle
│   ├── command-runner.js       # CommandRunner — child_process wrapper
│   ├── raw-converter.js        # RawConverterService — RAW → TIFF via dcraw_emu
│   └── sharp-service.js        # SharpService — image metadata & transforms
├── analyzers/                  # Image analysis
│   ├── image-analyzer.js       # ImageAnalyzer — metadata extraction
│   └── color-profile.js        # ColorProfile — color space & illuminant logic
├── builders/                   # Command construction
│   └── dng-command-builder.js  # DngCommandBuilder — builds makedng args
├── processors/                 # Processing pipelines
│   ├── raw-processor.js        # RawProcessor — RAW → DNG pipeline
│   ├── bitmap-processor.js     # BitmapProcessor — Bitmap → DNG pipeline
│   ├── desqueeze-processor.js  # DesqueezeProcessor — main orchestrator
│   └── dng-operations.js       # DngOperations — shared DNG file operations
└── utils/                      # Utilities
    ├── validation.js           # Input validation (paths, ratios)
    └── file-utils.js           # File/path helpers, temp file management
```

### Processing Pipelines

**RAW pipeline:** `RAW → DNGLab convert → Write DefaultScale tag → Done`

**Bitmap pipeline:** `Bitmap → Analyze color profile → Flatten alpha → DNGLab makedng → Write DefaultScale tag → Done`

### Key Dependencies

| Dependency | Purpose |
|---|---|
| [DNGLab](https://github.com/dnglab/dnglab) | RAW → DNG conversion, bitmap → DNG via `makedng` |
| [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js) | EXIF metadata reading and writing |
| [Sharp](https://sharp.pixelplumbing.com/) | Image metadata extraction, alpha flattening |
| [Electron](https://www.electronjs.org/) | Cross-platform desktop framework |

---

## Development

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start in development mode with hot reload |
| `npm test` | Run the unit / integration / E2E test suites |
| `npm run preview` | Preview the production build |
| `npm run setup` | Update bundled binaries + camera support list |
| `npm run dist` | Full release flow: binaries, version bump, notes, build |


---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes following the existing code style (OOP classes, JSDoc)
4. Test with `npm run dev` and `npm test`
5. Submit a pull request

---

## License

[MIT](LICENSE)
