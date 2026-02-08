import { describe, it, expect, vi } from "vitest";
import { DngCommandBuilder } from "../../src/main/builders/dng-command-builder.js";

// Mock logger to avoid noise during tests
vi.mock("../../src/main/logger.js", () => ({
	default: {
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

describe("DngCommandBuilder", () => {
	const builder = new DngCommandBuilder();

	const baseMetadata = {
		colorDepth: { prefix: "8bit" },
		colorSpace: { name: "sRGB", matrix: "XYZ_sRGB_D65", gamma: "sRGB" },
		illuminant: "D65",
		needsDualIlluminant: false,
	};

	it("should build a basic sRGB 8-bit command", () => {
		const args = builder.build(baseMetadata, "in.jpg", "out.dng");
		
		expect(args).toContain("makedng");
		expect(args).toContain("-i");
		expect(args).toContain("in.jpg");
		expect(args).toContain("-o");
		expect(args).toContain("out.dng");
		expect(args).toContain("--matrix1");
		expect(args).toContain("XYZ_sRGB_D65");
		expect(args).toContain("--linearization");
		expect(args).toContain("8bit_sRGB_invert");
	});

	it("should build a dual-illuminant command for AdobeRGB 16-bit", () => {
		const adobeMetadata = {
			colorDepth: { prefix: "16bit" },
			colorSpace: { name: "Adobe RGB", gamma: 2.2 },
			needsDualIlluminant: true,
		};

		const args = builder.build(adobeMetadata, "in.tif", "out.dng");

		expect(args).toContain("--matrix1");
		expect(args).toContain("XYZ_AdobeRGB_D50");
		expect(args).toContain("--matrix2");
		expect(args).toContain("XYZ_AdobeRGB_D65");
		expect(args).toContain("--illuminant1");
		expect(args).toContain("D50");
		expect(args).toContain("--illuminant2");
		expect(args).toContain("D65");
		expect(args).toContain("--linearization");
		expect(args).toContain("16bit_gamma2.2_invert");
	});

	it("should skip linearization for linear images (gamma 1.0)", () => {
		const linearMetadata = {
			...baseMetadata,
			colorSpace: { ...baseMetadata.colorSpace, gamma: 1.0 },
		};

		const args = builder.build(linearMetadata, "in.jpg", "out.dng");
		expect(args).not.toContain("--linearization");
	});

	it("should throw error if metadata is missing", () => {
		expect(() => builder.build(null, "in.jpg", "out.dng")).toThrow(/Invalid metadata/);
		expect(() => builder.build({}, "in.jpg", "out.dng")).toThrow(/Invalid metadata/);
	});

	it("should throw error if paths are missing", () => {
		expect(() => builder.build(baseMetadata, null, "out.dng")).toThrow(/required/);
		expect(() => builder.build(baseMetadata, "in.jpg", "")).toThrow(/required/);
	});
});
