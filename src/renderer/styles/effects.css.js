import { css } from "lit";

/**
 * Glass-panel, glow and button styles shared across components.
 *
 * The button set is deliberately three roles, not one look: exactly one
 * primary per screen carries the action the user came for, ghost carries
 * the reversible alternative, and quiet carries the discard. Before this
 * they were a single `.btn.glass` pill, which left "Cancel" and
 * "Desqueeze 12 images" visually identical.
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

	/* ── Buttons ─────────────────────────────────────────────────
	   Sentence case, no tracking, no glow stack. These are <button>
	   elements now, so they take keyboard focus and Enter/Space for
	   free — the old <a class="btn"> had no href and did neither. */

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5em;
		font-family: var(--dg-font);
		font-size: var(--dg-ui);
		font-variation-settings: var(--dg-var-ui-strong);
		line-height: 1;
		white-space: nowrap;
		padding: 0.72em 1.1em;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		color: var(--dg-fg-strong);
		text-decoration: none;
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			color 0.16s ease;
	}

	.btn:focus-visible {
		outline: 2px solid var(--dg-accent-ring);
		outline-offset: 2px;
	}

	.btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.btn-primary {
		background: var(--dg-accent);
		color: var(--dg-accent-fg);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--dg-accent-hover);
	}

	.btn-ghost {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.btn-ghost:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.32);
	}

	/* Quiet still carries a border and a ground. Without them it read as a
	   text link sitting next to two buttons, so "Desqueeze more" did not
	   look pressable at all. The hierarchy is now carried by contrast
	   between three button shapes rather than button-vs-text. */
	.btn-quiet {
		color: var(--dg-fg-soft);
		background: rgba(255, 255, 255, 0.03);
		border-color: rgba(255, 255, 255, 0.13);
	}

	.btn-quiet:hover:not(:disabled) {
		color: var(--dg-fg-strong);
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.24);
	}

	.btn-sm {
		font-size: var(--dg-ui-sm);
		padding: 0.5em 0.8em;
		border-radius: 5px;
	}
`;
