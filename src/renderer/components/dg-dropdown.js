import { LitElement, html, css } from "lit";
import { typography } from "../styles/typography.css.js";
import { effects } from "../styles/effects.css.js";

/**
 * <dg-dropdown> — inline dropdown used in the settings sentences.
 *
 * The toggle and the options are real <button> elements, so the control can
 * be reached and operated from the keyboard; they were <span>/<a> before and
 * could only be clicked.
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
			}

			.toggle {
				display: inline-flex;
				align-items: center;
				gap: 0.4em;
				font-family: var(--dg-font);
				font-size: inherit;
				/* Pinned, not inherited: the settings sentence runs at
				   line-height 2 and the control must not inherit that. */
				line-height: 1.15;
				font-variation-settings: var(--dg-var-ui-strong);
				letter-spacing: 0;
				color: var(--dg-fg-strong);
				background: rgba(255, 255, 255, 0.07);
				border: 1px solid rgba(255, 255, 255, 0.22);
				border-radius: 6px;
				padding: 0.28em 0.7em;
				cursor: pointer;
				transition:
					background 0.16s ease,
					border-color 0.16s ease;
			}

			.toggle:hover,
			:host([open]) .toggle {
				background: rgba(255, 255, 255, 0.12);
				border-color: rgba(255, 255, 255, 0.34);
			}

			.toggle:focus-visible {
				outline: 2px solid var(--dg-accent-ring);
				outline-offset: 2px;
			}

			.cv {
				font-size: 0.75em;
				opacity: 0.55;
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
				border: 1px solid rgba(255, 255, 255, 0.15);
				border-radius: 8px;
				padding: 4px;
				z-index: 30;
				min-width: 100%;
				white-space: nowrap;
				box-shadow: 0 14px 34px -14px rgba(0, 0, 0, 0.9);
			}

			:host([open]) .menu {
				display: flex;
				flex-direction: column;
				gap: 1px;
			}

			.menu button {
				display: block;
				width: 100%;
				text-align: left;
				padding: 0.36em 0.8em;
				color: var(--dg-fg-soft);
				background: transparent;
				border: 0;
				border-radius: 5px;
				font-family: var(--dg-font);
				font-size: var(--dg-ui-sm);
				font-variation-settings: var(--dg-var-ui);
				letter-spacing: 0;
				cursor: pointer;
				transition:
					background var(--dg-ease-fast),
					color var(--dg-ease-fast);
			}

			.menu button:hover {
				background: rgba(255, 255, 255, 0.1);
				color: var(--dg-fg-strong);
			}

			.menu button:focus-visible {
				outline: 2px solid var(--dg-accent-ring);
				outline-offset: -2px;
			}

			.menu button.active {
				color: var(--dg-fg-strong);
				background: var(--dg-accent-wash);
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
		this._onKey = (e) => {
			if (e.key === "Escape" && this.open) this._close();
		};
	}

	connectedCallback() {
		super.connectedCallback();
		document.addEventListener("click", this._onDocClick);
		document.addEventListener("keydown", this._onKey);
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		document.removeEventListener("click", this._onDocClick);
		document.removeEventListener("keydown", this._onKey);
		if (DgDropdown.openInstance === this) DgDropdown.openInstance = null;
	}

	render() {
		const selected = this.options.find((o) => o.value === this.value);
		return html`
			<button
				class="toggle"
				aria-haspopup="listbox"
				aria-expanded=${this.open ? "true" : "false"}
				@click=${this._toggle}
			>
				${selected?.label ?? this.value}<span class="cv">&#9662;</span>
			</button>
			<span class="menu" role="listbox">
				${this.options.map(
					(o) => html`
						<button
							role="option"
							aria-selected=${o.value === this.value ? "true" : "false"}
							class=${o.value === this.value ? "active" : ""}
							@click=${(e) => this._select(e, o.value)}
						>
							${o.label}
						</button>
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
