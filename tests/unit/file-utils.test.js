import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import path from "path";
import fs from "fs/promises";
import os from "os";
import {
	getOutputPath,
	getTempFilePath,
	isInsideOutputDir,
} from "../../src/main/utils/file-utils.js";

// Mock logger to avoid noise during tests
vi.mock("../../src/main/logger.js", () => ({
	default: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

describe("File Utils", () => {
	describe("getTempFilePath", () => {
		it("returns unique paths for concurrent calls", () => {
			const paths = new Set(
				Array.from({ length: 100 }, () => getTempFilePath(".tiff"))
			);
			expect(paths.size).toBe(100);
		});

		it("uses the given extension", () => {
			expect(getTempFilePath(".png")).toMatch(/\.png$/);
		});
	});

	describe("getOutputPath", () => {
		let dir;

		beforeAll(async () => {
			dir = await fs.mkdtemp(path.join(os.tmpdir(), "desqueeze-test-"));
		});

		afterAll(async () => {
			await fs.rm(dir, { recursive: true, force: true });
		});

		it("builds the output path inside a desqueezed/ directory", async () => {
			const out = await getOutputPath(path.join(dir, "photo.jpg"), ".jpg", ".dng");
			expect(out).toBe(path.join(dir, "desqueezed", "photo-desqueezed.dng"));
		});

		it("reuses the same output path when the same input is re-processed", async () => {
			const input = path.join(dir, "repeat.jpg");
			const first = await getOutputPath(input, ".jpg", ".jpg");
			const second = await getOutputPath(input, ".jpg", ".jpg");
			expect(second).toBe(first);
		});

		it("disambiguates when different inputs map to the same output name", async () => {
			const fromJpg = await getOutputPath(path.join(dir, "twin.jpg"), ".jpg", ".webp");
			const fromPng = await getOutputPath(path.join(dir, "twin.png"), ".png", ".webp");
			expect(fromJpg).not.toBe(fromPng);
			expect(fromPng).toContain("twin-desqueezed-1.webp");
		});

		it("treats output names differing only by case as collisions (macOS is case-insensitive)", async () => {
			const fromUpper = await getOutputPath(path.join(dir, "Case.png"), ".png", ".jpg");
			const fromLower = await getOutputPath(path.join(dir, "case.tif"), ".tif", ".jpg");
			expect(fromLower.toLowerCase()).not.toBe(fromUpper.toLowerCase());
			expect(fromLower).toContain("case-desqueezed-1.jpg");
		});
	});

	describe("isInsideOutputDir", () => {
		it("detects paths inside a desqueezed directory", () => {
			expect(isInsideOutputDir(path.join("a", "desqueezed", "b.jpg"))).toBe(true);
			expect(isInsideOutputDir(path.join("a", "Desqueezed", "b.jpg"))).toBe(true);
		});

		it("passes normal paths through", () => {
			expect(isInsideOutputDir(path.join("a", "photos", "b.jpg"))).toBe(false);
		});
	});
});
