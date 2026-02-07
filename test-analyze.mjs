/**
 * Test script for ImageAnalyzer (standalone, no Electron)
 */

import sharp from 'sharp';
import icc from 'icc';
import { exiftool } from 'exiftool-vendored';

async function analyzeImage(filePath) {
	console.log('=== Image Analysis ===\n');
	console.log('File:', filePath);
	console.log('');
	
	// Get Sharp metadata
	const image = sharp(filePath);
	const sharpMeta = await image.metadata();
	
	// Get EXIF data
	const exifData = await exiftool.read(filePath);
	
	// Parse ICC profile
	let iccProfile = null;
	if (sharpMeta.icc) {
		try {
			iccProfile = icc.parse(sharpMeta.icc);
		} catch (e) {
			console.warn('Failed to parse ICC:', e.message);
		}
	}
	
	// Detect fields
	const colorDepth = getColorDepth(sharpMeta);
	const illuminant = getIlluminant(iccProfile, exifData);
	const colorSpace = getColorSpace(sharpMeta, iccProfile, exifData);
	const connectionSpace = iccProfile?.connectionSpace?.trim() || 'XYZ';
	const needsDualIlluminant = illuminant === 'D65' && connectionSpace === 'XYZ';
	
	console.log('=== Detected Metadata ===');
	console.log('Color Depth:        ', colorDepth);
	console.log('Illuminant:         ', illuminant);
	console.log('Color Space:        ', colorSpace.name);
	console.log('Connection Space:   ', connectionSpace);
	console.log('Needs Dual Illuminant:', needsDualIlluminant);
	
	// Build command
	console.log('\n=== Generated Command ===');
	const isAdobeRGB = colorSpace.name.includes('Adobe');
	const baseMatrix = isAdobeRGB ? 'XYZ_AdobeRGB' : 'XYZ_sRGB';
	const bitPrefix = colorDepth.prefix;
	
	let linearization = `${bitPrefix}_sRGB_invert`;
	if (colorSpace.gamma === 2.2) {
		linearization = `${bitPrefix}_gamma2.2_invert`;
	}
	
	let command;
	if (needsDualIlluminant) {
		command = `--matrix1 ${baseMatrix}_D50 --illuminant1 D50 --matrix2 ${baseMatrix}_D65 --illuminant2 D65 --linearization ${linearization} --colorimetric-reference output`;
	} else {
		command = `--matrix1 ${colorSpace.matrix} --illuminant1 ${illuminant} --linearization ${linearization} --colorimetric-reference output`;
	}
	
	console.log(command);
	
	console.log('\n=== Expected (from working test 046) ===');
	console.log('--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --matrix2 XYZ_sRGB_D65 --illuminant2 D65 --linearization 8bit_sRGB_invert --colorimetric-reference output');
	
	console.log('\n=== Match? ===');
	const expected = '--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --matrix2 XYZ_sRGB_D65 --illuminant2 D65 --linearization 8bit_sRGB_invert --colorimetric-reference output';
	console.log(command === expected ? '✅ YES!' : '❌ No - check differences');
	
	await exiftool.end();
}

function getColorDepth(sharpMeta) {
	const depthMap = {
		uchar: { bits: 8, prefix: '8bit' },
		uint8: { bits: 8, prefix: '8bit' },
		ushort: { bits: 16, prefix: '16bit' },
		uint16: { bits: 16, prefix: '16bit' },
	};
	return depthMap[sharpMeta.depth] || { bits: 8, prefix: '8bit' };
}

function getIlluminant(iccProfile, exifData) {
	const profileDesc = (iccProfile?.description || exifData.ProfileDescription || '').toLowerCase();
	
	if (profileDesc.includes('d50') || profileDesc.includes('prophoto')) return 'D50';
	if (profileDesc.includes('d55')) return 'D55';
	if (profileDesc.includes('d75')) return 'D75';
	if (profileDesc.includes('srgb') || profileDesc.includes('adobe') || profileDesc.includes('d65')) return 'D65';
	
	return 'D65';
}

function getColorSpace(sharpMeta, iccProfile, exifData) {
	const profileDesc = (iccProfile?.description || exifData.ProfileDescription || '').toLowerCase();
	const sharpSpace = (sharpMeta.space || '').toLowerCase();
	
	if (profileDesc.includes('srgb') || profileDesc.includes('iec61966') || sharpSpace === 'srgb') {
		return { name: 'sRGB', gamma: 'sRGB', matrix: 'XYZ_sRGB_D65' };
	}
	if (profileDesc.includes('adobe rgb') || profileDesc.includes('adobergb')) {
		return { name: 'Adobe RGB', gamma: 2.2, matrix: 'XYZ_AdobeRGB_D65' };
	}
	
	return { name: 'sRGB (assumed)', gamma: 'sRGB', matrix: 'XYZ_sRGB_D65' };
}

const filePath = process.argv[2] || '/Users/pedrobatista/Desktop/_DSC5851.jpg';
analyzeImage(filePath).catch(console.error);
