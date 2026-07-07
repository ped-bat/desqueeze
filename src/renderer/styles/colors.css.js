import { css } from "lit";

/**
 * Color utility classes shared across components.
 * Raw values live as custom properties in styles/global.css.
 */
export const colors = css`
	.fg { color: var(--dg-fg); }
	.fg-mid { color: var(--dg-fg-mid); }
	.fg-soft { color: var(--dg-fg-soft); }
	.fg-faint { color: var(--dg-fg-faint); }
	.fg-ghost { color: var(--dg-fg-ghost); }
`;
