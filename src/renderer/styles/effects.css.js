import { css } from "lit";

/**
 * Glass-panel and glow effects shared across components:
 * buttons, dropdown toggles, inputs, menus, letterbox bars.
 */
export const effects = css`
	.glass {
		border: 1.5px solid var(--dg-border);
		border-radius: var(--dg-radius);
		background: var(--dg-surface);
		backdrop-filter: var(--dg-blur-glass);
		-webkit-backdrop-filter: var(--dg-blur-glass);
		box-shadow: var(--dg-glow-surface);
		transition:
			background var(--dg-spring-dur) var(--dg-spring),
			color var(--dg-spring-dur) var(--dg-spring),
			box-shadow var(--dg-spring-dur) var(--dg-spring),
			border-color var(--dg-spring-dur) var(--dg-spring);
	}

	.glass:hover {
		background: var(--dg-surface-hover);
		border-color: var(--dg-border-hover);
	}

	.glow-text {
		text-shadow: var(--dg-glow-white);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		color: var(--dg-fg);
		text-decoration: none;
		cursor: pointer;
		padding: 0.62em 1.44em 0.55em;
		margin-left: 10px;
		margin-right: 10px;
		background: rgba(0, 0, 0, 0.3);
		font-variation-settings: var(--dg-font-variation-rest);
		/* Transition comes from .glass — a single spring, same in both
		   directions. Hover must never change geometry (padding, border
		   width, transform, font metrics), only colour, so that flicking the
		   pointer across a button can't nudge it. */
	}

	.btn:hover {
		color: rgba(255, 255, 255, 0.8);
		background: rgba(40, 40, 40, 0.4);
		box-shadow: 0 0 12px rgba(255, 255, 255, 0.12), 0 0 28px rgba(255, 255, 255, 0.06);
	}

	.btn-sm {
		font-size: 0.85em;
		padding: 0.57em 1.2em 0.5em;
		font-variation-settings: inherit;
		color: var(--dg-fg-soft);
		border-color: var(--dg-border-soft);
	}
`;
