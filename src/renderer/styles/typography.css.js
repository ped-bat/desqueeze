import { css } from "lit";

/**
 * Typography presets shared across components.
 * Science Gothic is a variable font (wght 100-900, wdth 50-200);
 * the engine animates font-variation-settings at runtime — these
 * classes only set the resting state.
 *
 * Two families of preset, and they must not be mixed up:
 *   type-display / type-bar  uppercase, tracked, for the empty state
 *   type-ui / type-mono      sentence case, untracked, for the chrome
 * Tracking of 0.15em exists to open up uppercase. Applied to sentence
 * case it pulls words apart into loose letters, which is what made the
 * old subtitles hard to read.
 */
export const typography = css`
	/* Uppercase display — wordmark and micro-labels only */
	.type-ui {
		font-family: var(--dg-font);
		font-size: var(--dg-font-size-sub);
		font-weight: 300;
		text-transform: uppercase;
		letter-spacing: var(--dg-tracking);
	}

	.type-bar {
		font-family: var(--dg-font);
		font-size: var(--dg-font-size-bar);
		text-transform: uppercase;
		letter-spacing: var(--dg-tracking-bar);
	}

	.type-rest {
		font-variation-settings: var(--dg-font-variation-rest);
	}

	/* Sentence-case chrome — bars, rows, buttons, summaries */
	.type-body {
		font-family: var(--dg-font);
		font-size: var(--dg-ui);
		font-variation-settings: var(--dg-var-ui);
		letter-spacing: 0;
		text-transform: none;
	}

	.type-body-strong {
		font-variation-settings: var(--dg-var-ui-strong);
	}

	.type-small {
		font-size: var(--dg-ui-sm);
		font-variation-settings: var(--dg-var-ui);
		letter-spacing: 0;
		text-transform: none;
	}

	/* Filenames and paths — matched character for character against Finder */
	.type-mono {
		font-family: var(--dg-mono);
		font-size: var(--dg-ui-sm);
		letter-spacing: -0.01em;
		font-variant-numeric: tabular-nums;
	}
`;
