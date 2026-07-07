import { LitElement, html, css } from "lit";
import { typography } from "../styles/typography.css.js";

/**
 * <dg-letterbox position="top|bottom"> — translucent blurred bar at the
 * top or bottom edge. Content is slotted by the parent.
 */
export class DgLetterbox extends LitElement {
	static properties = {
		position: { type: String, reflect: true },
	};

	static styles = [
		typography,
		css`
			:host {
				position: absolute;
				left: 0;
				right: 0;
				height: 17%;
				z-index: 5;
				display: flex;
				align-items: center;
				justify-content: center;
				padding: 0 var(--dg-pad-bar);
				pointer-events: none;
				font-family: var(--dg-font);
				font-size: var(--dg-font-size-bar);
				text-transform: uppercase;
				letter-spacing: var(--dg-tracking-bar);
				color: var(--dg-fg-ghost);
				text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 10px rgba(0, 0, 0, 0.6),
					0 0 8px rgba(255, 255, 255, 0.13), 0 0 20px rgba(255, 255, 255, 0.064);
			}

			:host([position="top"]) {
				top: 0;
			}

			:host([position="bottom"]) {
				bottom: 0;
				align-items: flex-end;
				padding-bottom: 2.6em;
				/* matches the old settings-hint size (0.75x subtitle) */
				font-size: calc(var(--dg-font-size-sub) * 0.75);
				/* same color as the subtitle's idle state */
				color: var(--dg-fg-mid);
			}

			::slotted(a),
			a {
				color: rgba(255, 255, 255, 0.48);
				text-decoration: none;
				cursor: pointer;
				pointer-events: auto;
			}
		`,
	];

	constructor() {
		super();
		this.position = "bottom";
	}

	render() {
		return html`<slot></slot>`;
	}
}

customElements.define("dg-letterbox", DgLetterbox);
