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
			background var(--dg-ease),
			color var(--dg-ease),
			box-shadow var(--dg-ease),
			border-color var(--dg-ease);
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
		/* mouse-out: slow ease-in-out (base transition applies when leaving) */
		transition:
			background 0.45s ease-in-out,
			color 0.45s ease-in-out,
			box-shadow 0.45s ease-in-out,
			border-color 0.45s ease-in-out;
	}

	.btn:hover {
		color: rgba(255, 255, 255, 0.8);
		background: rgba(40, 40, 40, 0.4);
		box-shadow: 0 0 12px rgba(255, 255, 255, 0.12), 0 0 28px rgba(255, 255, 255, 0.06);
		/* mouse-in: quick decelerate */
		transition:
			background 0.12s cubic-bezier(0, 0, 0.2, 1),
			color 0.12s cubic-bezier(0, 0, 0.2, 1),
			box-shadow 0.12s cubic-bezier(0, 0, 0.2, 1),
			border-color 0.12s cubic-bezier(0, 0, 0.2, 1);
	}

	.btn-sm {
		font-size: 0.85em;
		padding: 0.57em 1.2em 0.5em;
		font-variation-settings: inherit;
		color: var(--dg-fg-soft);
		border-color: var(--dg-border-soft);
	}
`;
