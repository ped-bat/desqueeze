/**
 * Test script for the updated ImageAnalyzer and command builder
 */

import { ImageAnalyzer } from './src/main/modules/image-analyzer.js';
import { buildMakeDNGCommand, getCommandOptions } from './src/main/modules/command-builder.js';

async function test(filePath) {
	console.log('=== Testing Updated Modules ===\n');
	console.log('File:', filePath);
	console.log('');
	
	// Analyze the image
	const analyzer = new ImageAnalyzer(filePath);
	const metadata = await analyzer.analyze();
	
	// Print summary
	analyzer.printSummary();
	
	// Get command options
	console.log('\n=== Command Options ===');
	const opts = getCommandOptions(metadata);
	console.log(JSON.stringify(opts, null, 2));
	
	// Build command
	console.log('\n=== Generated Command ===');
	const command = buildMakeDNGCommand(metadata, filePath, '/tmp/test-output.dng');
	console.log(command);
	
	// Compare with working command
	console.log('\n=== Expected (from working test) ===');
	console.log('--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --matrix2 XYZ_sRGB_D65 --illuminant2 D65 --linearization 8bit_sRGB_invert --colorimetric-reference output');
	
	// Close exiftool
	const { exiftool } = await import('exiftool-vendored');
	await exiftool.end();
}

const filePath = process.argv[2] || '/Users/pedrobatista/Desktop/_DSC5851.jpg';
test(filePath).catch(console.error);
