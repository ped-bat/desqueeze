import { LitElement, html, css } from "lit";
import { typography } from "../styles/typography.css.js";
import { effects } from "../styles/effects.css.js";

/**
 * <dg-dropdown> — inline glass dropdown used in settings sentences.
 *
 * @fires change - CustomEvent<{value: string}> on selection
 */
export class DgDropdown extends LitElement {
	static properties = {
		options: { type: Array }, // [{value, label}]
		value: { type: String },
		open: { type: Boolean, state: true },
	};

	static styles = [
		typography,
		effects,
		css`
			:host {
				position: relative;
				display: inline-block;
				pointer-events: auto;
				cursor: pointer;
			}

			.toggle {
				display: inline-block;
				color: var(--dg-fg);
				padding: 0.2em 0.9em;
				cursor: pointer;
				font: inherit;
				font-size: 1em;
				line-height: 1.6em;
				text-transform: uppercase;
				letter-spacing: var(--dg-tracking);
				font-variation-settings: var(--dg-font-variation-rest);
			}

			.toggle::after {
				content: " \\25BE";
				font-size: 0.8em;
				opacity: 0.5;
			}

			.menu {
				display: none;
				position: absolute;
				top: calc(100% + 6px);
				left: 50%;
				transform: translateX(-50%);
				background: var(--dg-surface-menu);
				backdrop-filter: var(--dg-blur-glass);
				-webkit-backdrop-filter: var(--dg-blur-glass);
				border: 1.5px solid rgba(255, 255, 255, 0.15);
				border-radius: var(--dg-radius);
				padding: 4px 0;
				z-index: 30;
				min-width: 100%;
				white-space: nowrap;
				box-shadow: var(--dg-glow-surface);
			}

			:host([open]) .menu {
				display: block;
			}

			.menu a {
				display: block;
				padding: 0.2em 0.9em;
				color: rgba(255, 255, 255, 0.6);
				text-decoration: none;
				font: inherit;
				font-size: 0.8em;
				text-transform: uppercase;
				letter-spacing: var(--dg-tracking);
				font-variation-settings: var(--dg-font-variation-rest);
				transition: background var(--dg-spring-dur) var(--dg-spring),
					color var(--dg-spring-dur) var(--dg-spring);
				cursor: pointer;
			}

			.menu a:hover {
				background: rgba(255, 255, 255, 0.1);
				color: var(--dg-fg-strong);
			}

			.menu a.active {
				color: var(--dg-fg-strong);
			}
		`,
	];

	static openInstance = null;

	constructor() {
		super();
		this.options = [];
		this.value = "";
		this.open = false;
		this._onDocClick = () => this._close();
	}

	connectedCallback() {
		super.connectedCallback();
		document.addEventListener("click", this._onDocClick);
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		document.removeEventListener("click", this._onDocClick);
		if (DgDropdown.openInstance === this) DgDropdown.openInstance = null;
	}

	render() {
		const selected = this.options.find((o) => o.value === this.value);
		return html`
			<span class="toggle glass" @click=${this._toggle}>${selected?.label ?? this.value}</span>
			<span class="menu">
				${this.options.map(
					(o) => html`
						<a
							class=${o.value === this.value ? "active" : ""}
							@click=${(e) => this._select(e, o.value)}
						>${o.label}</a>
					`
				)}
			</span>
		`;
	}

	updated() {
		this.toggleAttribute("open", this.open);
	}

	_toggle(e) {
		e.stopPropagation();
		if (DgDropdown.openInstance && DgDropdown.openInstance !== this) {
			DgDropdown.openInstance._close();
		}
		this.open = !this.open;
		DgDropdown.openInstance = this.open ? this : null;
	}

	_close() {
		this.open = false;
		if (DgDropdown.openInstance === this) DgDropdown.openInstance = null;
	}

	_select(e, value) {
		e.preventDefault();
		e.stopPropagation();
		this._close();
		if (value === this.value) return;
		this.value = value;
		this.dispatchEvent(new CustomEvent("change", { detail: { value }, bubbles: true, composed: true }));
	}
}

customElements.define("dg-dropdown", DgDropdown);
