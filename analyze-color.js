const { exiftool } = require('exiftool-vendored');
const sharp = require('sharp');
const icc = require('icc');

async function analyze(filePath) {
  console.log('Analyzing:', filePath);
  console.log('');
  
  // Get Sharp metadata
  const image = sharp(filePath);
  const meta = await image.metadata();
  
  console.log('=== SHARP METADATA ===');
  console.log('Space:', meta.space);
  console.log('Depth:', meta.depth);
  console.log('Channels:', meta.channels);
  console.log('Has ICC:', !!meta.icc);
  
  // Parse ICC
  if (meta.icc) {
    try {
      const profile = icc.parse(meta.icc);
      console.log('\n=== ICC PROFILE ===');
      console.log('Description:', profile.description);
      console.log('Color Space:', profile.colorSpace);
      console.log('Connection Space:', profile.connectionSpace);
      console.log('White Point:', JSON.stringify(profile.whitepoint));
      console.log('Creator:', profile.creator);
      console.log('Version:', profile.version);
      
      // Full profile dump for debugging
      console.log('\n=== FULL ICC PROFILE KEYS ===');
      console.log(Object.keys(profile));
      
      // Check for chromatic adaptation
      if (profile.chromaticAdaptation) {
        console.log('\nChromatic Adaptation Matrix:', profile.chromaticAdaptation);
      }
    } catch(e) {
      console.log('ICC Parse Error:', e.message);
    }
  }
  
  // Get EXIF
  const exif = await exiftool.read(filePath);
  console.log('\n=== EXIF COLOR TAGS ===');
  console.log('ProfileDescription:', exif.ProfileDescription);
  console.log('ColorSpace:', exif.ColorSpace);
  console.log('ProfileConnectionSpace:', exif.ProfileConnectionSpace);
  console.log('ProfileIlluminant:', exif.ProfileIlluminant);
  console.log('MediaWhitePoint:', exif.MediaWhitePoint);
  console.log('RedMatrixColumn:', exif.RedMatrixColumn);
  console.log('GreenMatrixColumn:', exif.GreenMatrixColumn);
  console.log('BlueMatrixColumn:', exif.BlueMatrixColumn);
  console.log('ChromaticAdaptation:', exif.ChromaticAdaptation);
  
  // Understanding the issue
  console.log('\n=== ANALYSIS ===');
  console.log('The image is sRGB which uses D65 white point for the RGB primaries.');
  console.log('But ICC Profile Connection Space (PCS) is always D50.');
  console.log('This means the ICC profile has a chromatic adaptation from D65 -> D50 built-in.');
  console.log('');
  console.log('For DNG:');
  console.log('- Single illuminant: only works at one color temperature');
  console.log('- Dual illuminant: allows interpolation between two calibrations');
  console.log('');
  console.log('Working command uses dual illuminant (D50 + D65) which properly');
  console.log('handles the D65->D50 adaptation that ICC profiles expect.');
  
  await exiftool.end();
}

const filePath = process.argv[2] || '/Users/pedrobatista/Desktop/_DSC5851.jpg';
analyze(filePath).catch(console.error);
