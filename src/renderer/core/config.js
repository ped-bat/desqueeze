/**
 * Dot-grid engine configuration — visual/physics parameters only.
 * UI content (labels, subtitles, action buttons) lives in the components;
 * app-level config (formats, limits) comes from the main process via IPC.
 */

export const ENGINE_CONFIG = {
	// Grid
	dotSpacing: 30,
	maxDotRadius: 1.5,
	minDotRadius: 0,
	baseOpacity: 0.5, // dot opacity when outside the spotlight
	glowRadiusMult: 6, // glow radius = dotRadius × this
	glowAspect: 1.5, // glow X/Y ratio (>1 = wider horizontally)
	glowOpacity: 0.05, // glow peak opacity

	// Transition
	transitionDuration: 0.3, // seconds for mode crossfade
	colorRippleDuration: 1, // time for ripple to sweep center→edge
	rippleWidth: 0.5, // per-dot transition duration (wider = more dots in-flight)
	rippleFalloff: 1, // bulge envelope exponent (lower = broader plateau)
	rippleDelay: 0, // seconds before ripple starts after mode change
	rippleMaxDotRadius: 5, // dot radius at peak of ripple wavefront

	// Cursor mode (ready state)
	influenceRadius: 40,
	falloffRadius: 600,
	easeInSpeed: 8,
	easeOutSpeed: 3,
	mouseFollowSpeed: 10,
	repulsionStrength: 50,
	repulsionRadius: 500,
	cursorSpotlight: { width: 0.2, height: 0.25, range: 5 },

	// Stretch loop (processing state)
	loopDuration: 3,
	stretchAmount: 0.6,
	stretchDuration: 1.5,
	gridSpring: { stiffness: 125, damping: 15 },
	textSpring: { stiffness: 125, damping: 15 },
	rowStretch: { center: 1, edge: 0.5 },
	colStretch: { center: 1, edge: 0 },

	// Center spotlight
	spotlightWidth: 0.25,
	spotlightHeight: 0.2,
	spotlightRange: 5,
	spotlightGradient: [
		[10, 0],
		[60, 100],
		[100, 0],
	],

	// Effects
	barrelStrength: 0.25,
	barrelRadius: 1,
	chromaStrength: 2,
	chromaOpacity: 0.7,
	chromaGlowOpacity: 0.05,
	blurMax: 4,
	textChromaStrength: 1, // max px offset for title RGB split

	// CRT overlay
	crt: {
		vignetteStrength: 0.4, // edge darkening (0–1)
		flickerAmount: 0.0, // subtle brightness flicker
		curvature: 0.02, // screen edge curvature (0 = flat)
	},

	// Film grain
	grain: {
		intensity: 0.06, // grain opacity (0–1)
		size: 1, // pixel size of grain (1 = native resolution)
	},

	// Title font animation (variable font axes, driven by stretch spring)
	fontWeight: { rest: 300, stretch: 500 },
	fontWidth: { rest: 80, stretch: 100 },
	letterSpacing: { rest: 8, stretch: 12 },

	// Subtitle font animation (processing state)
	subFontWeight: { rest: 300, stretch: 350 },
	subFontWidth: { rest: 80, stretch: 95 },
	subLetterSpacing: { rest: 2.4, stretch: 5 },
	subChromaStrength: 0.6, // max px offset for subtitle RGB split
};

/**
 * Per-mode engine parameters (dot color + mode-specific animation).
 * Mode keys are the app lifecycle states.
 */
export const MODE_PARAMS = {
	ready: {
		dotColor: [255, 255, 255],
	},
	processing: {
		dotColor: [255, 255, 255],
	},
	error: {
		dotColor: [255, 50, 50],
		wavePeriod: 2, // seconds per full wave cycle
		waveDelay: 0, // seconds after state change before wave starts
		waveDarkColor: [80, 5, 5], // darker red to morph toward
		waveDisplacement: 4, // px push outward from center by wave
		maxDotRadius: 3.5, // larger dots in error state
	},
	success: {
		dotColor: [255, 255, 255],
		rippleColor: [80, 200, 100], // intro ripple front only — dots settle white
		wavePeriod: 2,
		waveDelay: 0,
		waveDarkColor: [90, 90, 90],
		waveDisplacement: 4,
		maxDotRadius: 3.5,
	},
	settings: {
		dotColor: [255, 255, 255],
		convergenceDuration: 6, // seconds per full pull-release cycle
		convergenceAmount: 0.05, // fraction of distance pulled toward center
		convergenceEasing: "sine", // 'sine' | 'ease-in-out'
		spotlightGradientTarget: [
			[40, 0],
			[70, 100],
			[100, 0],
		],
	},
};

/** Mode that follows the cursor (repulsion + cursor spotlight) */
export const CURSOR_MODE = "ready";

/** Mode that runs the stretch/spring loop */
export const STRETCH_MODE = "processing";
