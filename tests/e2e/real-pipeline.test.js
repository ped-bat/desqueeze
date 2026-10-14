import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import { DesqueezeProcessor } from "../../src/main/processors/desqueeze-processor.js";
import { BinaryResolver } from "../../src/main/services/binary-resolver.js";
import { ExifToolService } from "../../src/main/services/exiftool-service.js";

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

// ── DNG structure helpers ────────────────────────────────

/**
 * Group-qualified DNG tags, e.g. { "IFD0:DefaultScale": "1.33 1" }, plus a
 * `warnings` array. Group family 4 keeps every -validate warning as its own
 * key (plain -G1 collapses them into one), at the price of a "CopyN"
 * segment on any tag name that repeats, across IFDs included — folded
 * away here so lookups stay "group:tag".
 */
async function readDng(filePath) {
	const raw = await ExifToolService.getInstance().read(filePath, [
		"-G1:4", "-a",
		"-SubfileType", "-DefaultScale", "-DefaultCropSize",
		"-ImageWidth", "-ImageHeight", "-PreviewImage", "-Validate", "-Warning",
	]);

	const tags = { warnings: [] };
	for (const [key, value] of Object.entries(raw)) {
		const parts = key.split(":");
		if (parts.length < 2) continue;
		const name = parts[parts.length - 1];
		if (name === "Warning") tags.warnings.push(String(value));
		else tags[`${parts[0]}:${name}`] = value;
	}
	return tags;
}

/**
 * Copying a bitmap's own metadata into the DNG drags along things exiftool
 * grumbles about (Photoshop IRB blobs, stale IPTC digests, flattened XMP
 * flash fields). Those predate the preview work and don't affect readers.
 * Anything else — offsets, IFD sizes, missing DNG tags — fails the test.
 */
const TOLERATED_WARNINGS = [
	/^Non-standard XMP property/,
	/^IPTCDigest is not current/,
	/^Non-standard format \(undef\) for IFD0 0x8649 PhotoshopSettings/,
];

function structuralWarnings(tags) {
	return tags.warnings.filter((w) => !TOLERATED_WARNINGS.some((re) => re.test(w)));
}

/** exiftool group (IFD0, SubIFD, …) whose tag `name` satisfies `predicate` */
function groupOf(tags, name, predicate = () => true) {
	for (const [key, value] of Object.entries(tags)) {
		const [group, tag] = key.split(":");
		if (tag === name && predicate(value)) return group;
	}
	return null;
}

const rawGroupOf = (tags) => groupOf(tags, "SubfileType", (v) => /full-resolution/i.test(v));

/** Aspect of the image as a raw editor would frame it (crop when present) */
function rawAspect(tags, rawGroup) {
	const crop = tags[`${rawGroup}:DefaultCropSize`];
	const [w, h] = crop
		? String(crop).split(" ").map(Number)
		: [tags[`${rawGroup}:ImageWidth`], tags[`${rawGroup}:ImageHeight`]];
	return w / h;
}

/** Aspect of the embedded JPEG preview, as file browsers show it */
function previewAspect(tags) {
	const g = groupOf(tags, "PreviewImage");
	expect(g, "DNG should carry an embedded preview").not.toBeNull();
	return tags[`${g}:ImageWidth`] / tags[`${g}:ImageHeight`];
}

/**
 * The invariants every DNG we ship must hold: it validates, DefaultScale
 * sits on the raw IFD, and the embedded preview already has the stretch
 * applied (that JPEG is what Finder/QuickLook/culling tools display).
 */
async function expectDesqueezedDng(outputPath, ratio) {
	const tags = await readDng(outputPath);
	expect(tags["ExifTool:Validate"]).toBeDefined();
	expect(structuralWarnings(tags)).toEqual([]);

	const rawGroup = rawGroupOf(tags);
	expect(rawGroup, "raw IFD not found").not.toBeNull();
	expect(tags[`${rawGroup}:DefaultScale`]).toBe(`${ratio} 1`);

	expect(previewAspect(tags)).toBeCloseTo(rawAspect(tags, rawGroup) * ratio, 1);
	return tags;
}

describe("End-to-End Real Binary Pipeline", () => {
	// Clean & recreate output directory before the suite
	beforeAll(async () => {
		await fs.rm(outDir, { recursive: true, force: true });
		await fs.mkdir(outDir, { recursive: true });
	});

	afterAll(() => ExifToolService.getInstance().shutdown());

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

		await expectDesqueezedDng(outputPath, 1.33);
	}, 60_000);

	it("should re-desqueeze a DNG input relative to the scale it already carries", async () => {
		const processor = new DesqueezeProcessor();
		processor.setBinaryResolver(resolver);

		const firstPass = await processor.process(
			path.resolve("tests/fixtures/raw.ARW"), 1.33, 1.0, { format: "dng", options: {} }
		);
		const outputPath = await processor.process(firstPass, 2.0, 1.0, { format: "dng", options: {} });

		// DefaultScale is replaced outright, while the preview (already
		// stretched 1.33× by the first pass) ends up at 2× overall, not 2.66×.
		await expectDesqueezedDng(outputPath, 2);
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
