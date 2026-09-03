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
				/* The global reset doesn't cross the shadow boundary, so without
				   this the bottom bar's padding is added to its height and it
				   creeps 30px up into the content. */
				box-sizing: border-box;
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

			/* The bar itself: a lightly blurred backdrop so the dot grid softens
			   behind it, closed off by a hairline on the edge facing the canvas. */
			:host {
				background: var(--dg-bar-bg);
				backdrop-filter: var(--dg-bar-blur);
				-webkit-backdrop-filter: var(--dg-bar-blur);
			}

			:host([position="top"]) {
				top: 0;
				border-bottom: 1px solid var(--dg-bar-border);
			}

			:host([position="bottom"]) {
				bottom: 0;
				border-top: 1px solid var(--dg-bar-border);
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
