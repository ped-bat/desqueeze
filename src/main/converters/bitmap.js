import sharp from "sharp";
import fs from "fs/promises";
import { exiftool } from "exiftool-vendored";

// Stretch bitmap using Sharp and save as TIFF
async function stretchBitmap(inputPath, outputPath, stretchFactor) {
	const image = sharp(inputPath);
	const metadata = await image.metadata();
	const newWidth = Math.round(metadata.width * stretchFactor);

	console.log(
		`Stretching: ${metadata.width}x${metadata.height} -> ${newWidth}x${metadata.height}`
	);

	await image
		.resize({
			width: newWidth,
			height: metadata.height,
			fit: "fill",
			kernel: "lanczos3",
		})
		.tiff({
			compression: "lzw",
			predictor: "horizontal",
		})
		.toFile(outputPath);

	// Check if output file was created
	try {
		await fs.access(outputPath);
		console.log("TIFF file created successfully:", outputPath);
	} catch {
		throw new Error(`TIFF file was not created at: ${outputPath}`);
	}

	// Copy all metadata from original file to the new TIFF
	console.log("Copying metadata from original file...");
	await exiftool.write(outputPath, {}, [
		"-overwrite_original",
		"-TagsFromFile",
		inputPath,
		"-all:all",
	]);
	console.log("Metadata copied successfully");

	return outputPath;
}

export { stretchBitmap };
