import { describe, it, expect, vi, beforeAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import { DesqueezeProcessor } from "../../src/main/processors/desqueeze-processor.js";
import { BinaryResolver } from "../../src/main/services/binary-resolver.js";

// Suppress logger noise — E2E console.log statements are enough
vi.mock("../../src/main/logger.js", () => ({
	default: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

// No other mocks! We are testing the real binaries.

const projectRoot = process.cwd();
const outDir = path.resolve("tests/fixtures/desqueezed");

// Manually configure resolver for Node.js environment (simulating Electron app root)
const resolver = new BinaryResolver({
	basePath: projectRoot,
	isPackaged: false,
	platform: process.platform,
});

/** Read the first N bytes of a file */
async function readMagicBytes(filePath, n = 4) {
	const handle = await fs.open(filePath, "r");
	const buffer = Buffer.alloc(n);
	await handle.read(buffer, 0, n, 0);
	await handle.close();
	return buffer;
}

describe("End-to-End Real Binary Pipeline", () => {
	// Clean & recreate output directory before the suite
	beforeAll(async () => {
		await fs.rm(outDir, { recursive: true, force: true });
		await fs.mkdir(outDir, { recursive: true });
	});

	const testFiles = [
		"bitmap-a.jpg",
		"bitmap-b.png",
		"bitmap-c.tif",
		"raw.ARW",
	];

	// ── DNG output (real dnglab) ─────────────────────────────

	it.each(testFiles)("should create a valid DNG from %s", async (filename) => {
		const processor = new DesqueezeProcessor();
		processor.setBinaryResolver(resolver);

		const inputPath = path.resolve(`tests/fixtures/${filename}`);
		const outputPath = await processor.process(inputPath, 1.33, 1.0, { format: "dng", options: {} });

		expect(outputPath).toMatch(/\.dng$/i);

		// Verify file exists and has meaningful size
		const stats = await fs.stat(outputPath);
		expect(stats.size).toBeGreaterThan(1024);

		// Verify TIFF/DNG magic bytes (II = little-endian, MM = big-endian)
		const magic = (await readMagicBytes(outputPath, 2)).toString("hex");
		expect(["4949", "4d4d"]).toContain(magic);
	}, 60_000);

	// ── RAW → non-DNG (real dcraw_emu + Sharp) ───────────────

	const exportFormats = [
		{ format: "jpg",  options: { quality: 80 } },
		{ format: "tiff", options: { compression: "lzw" } },
	];

	it.each(exportFormats)(
		"should convert raw.ARW to $format via dcraw_emu",
		async ({ format, options }) => {
			const processor = new DesqueezeProcessor();
			processor.setBinaryResolver(resolver);

			const inputPath = path.resolve("tests/fixtures/raw.ARW");
			const outputPath = await processor.process(inputPath, 1.33, 1.0, { format, options });

			// Verify output was created with meaningful size (full-res, not thumbnail)
			const stats = await fs.stat(outputPath);
			expect(stats.size).toBeGreaterThan(100_000); // >100 KB rules out thumbnails
		},
		60_000,
	);
});
