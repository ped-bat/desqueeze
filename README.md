# Desqueeze - Photo Metadata Viewer

Electron app that reads photo metadata using ExifTool, with automatic RAW to DNG conversion using DNGLab.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Download DNGLab Binary
```bash
npm run setup
```

This downloads the DNGLab binary for your current platform.

To download binaries for all platforms (for distribution):
```bash
npm run setup:all
```

### 3. Run Development
```bash
npm start
```

## Building for Distribution

Build the app with bundled DNGLab:
```bash
npm run dist
```

This creates a distributable app in the `dist/` folder with DNGLab bundled inside.

## Features

- Select any image file (JPG, RAW, etc.)
- Automatically converts to DNG if needed
- Reads comprehensive EXIF metadata
- No external dependencies needed for end users

## Architecture

- **DNGLab**: Bundled binary for RAW to DNG conversion
- **ExifTool**: Vendored npm package for metadata extraction
- **Electron**: Cross-platform desktop app framework
