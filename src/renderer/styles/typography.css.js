import { css } from "lit";

/**
 * Typography presets shared across components.
 * Science Gothic is a variable font (wght 100-900, wdth 50-200);
 * the engine animates font-variation-settings at runtime — these
 * classes only set the resting state.
 */
export const typography = css`
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
`;
