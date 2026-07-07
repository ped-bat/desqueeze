import { css } from "lit";

/**
 * Shared transition/keyframe definitions.
 * Canvas animation lives in engine/DotGridEngine.js — this file only
 * covers DOM-side transitions (fades, dropdown reveals).
 */
export const animations = css`
	.fade {
		transition: opacity var(--dg-ease);
	}

	.fade-out {
		opacity: 0;
	}

	@keyframes dg-menu-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
`;
