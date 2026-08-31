/**
 * Render build/icon.svg → build/icon.png (1024×1024).
 * electron-builder derives the platform icon formats (.icns/.ico) from
 * the PNG at package time. Re-run after editing the SVG:
 *   node scripts/make-icon.js
 */

import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "build", "icon.svg");
const out = path.join(root, "build", "icon.png");

await sharp(src, { density: 300 })
	.resize(1024, 1024)
	.png()
	.toFile(out);

console.log(`Icon rendered: ${out}`);
