/**
 * RAW Converter - Legacy exports for backward compatibility
 *
 * Note: Main logic has been moved to /modules/dng-utils.js
 * This file re-exports for any code still importing from here.
 */

import {
	convertRAWToDNG,
	stretchDNG,
} from "../modules/dng-utils.js";

// Re-export with legacy names for backward compatibility
const convertToDNG = convertRAWToDNG;
const setDefaultScale = stretchDNG;

export { convertToDNG, setDefaultScale };
