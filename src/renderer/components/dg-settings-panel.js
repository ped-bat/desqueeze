import { LitElement, html, css, nothing } from "lit";
import { typography } from "../styles/typography.css.js";
import { effects } from "../styles/effects.css.js";
import { store, StoreController, FACTOR_PRESETS } from "../state/app-state.js";
import "./dg-dropdown.js";

/**
 * <dg-settings-panel> — sentence-style settings driven by the
 * main-process config (formats + defaults arrive via store.config).
 */
export class DgSettingsPanel extends LitElement {
	static styles = [
		typography,
		effects,
		css`
			:host {
				position: relative;
				display: flex;
				flex-direction: column;
				align-items: center;
				margin-top: 1.2rem;
				pointer-events: auto;
				z-index: 3;
				font-family: var(--dg-font);
				font-size: var(--dg-font-size-sub);
				font-weight: 300;
				text-transform: uppercase;
				letter-spacing: var(--dg-tracking);
				color: var(--dg-fg-mid);
				text-shadow: var(--dg-glow-white);
			}

			.line {
				white-space: nowrap;
				line-height: 1.8;
			}

			.line + .line {
				margin-top: 0.6em;
			}

			.input-wrap {
				display: inline-flex;
				align-items: center;
				position: relative;
			}

			.input-wrap:focus-within {
				border-color: rgba(255, 255, 255, 0.5);
				background: var(--dg-surface-focus);
			}

			.input-wrap[data-suffix]::after {
				content: attr(data-suffix);
				font: inherit;
				font-size: 1em;
				line-height: 1.6em;
				color: rgba(255, 255, 255, 0.4);
				padding-right: 0.8em;
				pointer-events: none;
				font-variation-settings: var(--dg-font-variation-rest);
				letter-spacing: var(--dg-tracking);
				margin-left: -0.1em;
			}

			.input-wrap input {
				border: none;
				background: transparent;
				outline: none;
				padding: 0.2em 0.4em 0.2em 0.8em;
				width: 4em;
				text-align: center;
				color: var(--dg-fg);
				font: inherit;
				font-size: 1em;
				line-height: 1.6em;
				text-transform: uppercase;
				letter-spacing: var(--dg-tracking);
				font-variation-settings: var(--dg-font-variation-rest);
				appearance: textfield;
				-moz-appearance: textfield;
				cursor: text;
				user-select: text;
				-webkit-user-select: text;
			}

			.input-wrap input::-webkit-inner-spin-button,
			.input-wrap input::-webkit-outer-spin-button {
				-webkit-appearance: none;
				margin: 0;
			}

			.input-wrap input::selection {
				background: rgba(255, 255, 255, 0.3);
				color: inherit;
			}
		`,
	];

	constructor() {
		super();
		new StoreController(this);
	}

	firstUpdated() {
		// The panel is centre-aligned and sized by its widest line, so picking
		// a shorter option (1.33X -> 2X, or dropping the custom-factor input)
		// shrank it and slid both edges inward. Pin the width it opens at as a
		// floor. Measured after fonts settle — Science Gothic loads async and
		// a fallback-metrics measurement would lock in the wrong number.
		const lock = () => {
			const w = this.getBoundingClientRect().width;
			if (w > 0) this.style.minWidth = `${Math.ceil(w)}px`;
		};
		if (document.fonts?.ready) document.fonts.ready.then(lock);
		else requestAnimationFrame(lock);
	}

	render() {
		if (!store.config) return nothing;

		const formats = Object.entries(store.config.OUTPUT_FORMATS).map(([value, f]) => ({
			value,
			label: f.label,
		}));

		return html`
			<div class="line">
				Anamorphic factor of
				<dg-dropdown
					.options=${FACTOR_PRESETS}
					.value=${store.factorPreset}
					@change=${(e) => store.setFactorPreset(e.detail.value)}
				></dg-dropdown>
				${store.factorPreset === "custom"
					? html`
							<span class="input-wrap glass" data-suffix="x">
								<input
									type="text"
									.value=${store.customFactor}
									@input=${this._filterDecimal}
									@change=${(e) => this._onCustomFactorChange(e)}
								/>
							</span>
						`
					: nothing}
			</div>
			<div class="line">
				Output as
				<dg-dropdown
					.options=${formats}
					.value=${store.format}
					@change=${(e) => store.setFormat(e.detail.value)}
				></dg-dropdown>
				${this._formatOptions()}
			</div>
		`;
	}

	/** Strip anything but digits as it's typed */
	_filterDigits(e) {
		const v = e.target.value.replace(/\D/g, "");
		if (v !== e.target.value) e.target.value = v;
	}

	/** Strip anything but digits and a single decimal point as it's typed;
	 * values above MAX_STRETCH_FACTOR clamp immediately. */
	_filterDecimal(e) {
		const parts = e.target.value.replace(/[^0-9.]/g, "").split(".");
		let v = parts.shift() + (parts.length ? "." + parts.join("") : "");
		const max = store.config?.MAX_STRETCH_FACTOR;
		if (max && parseFloat(v) > max) v = String(max);
		if (v !== e.target.value) e.target.value = v;
	}

	/** Positive number ≤ MAX_STRETCH_FACTOR; non-numeric or ≤0 entries revert. */
	_onCustomFactorChange(e) {
		const f = parseFloat(e.target.value);
		if (Number.isNaN(f) || f <= 0) {
			e.target.value = store.customFactor;
			return;
		}
		const clamped = Math.min(f, store.config.MAX_STRETCH_FACTOR);
		e.target.value = String(clamped);
		store.setCustomFactor(String(clamped));
	}

	/** Integer input clamped to [min, max]; non-numeric entries revert. */
	_numberInput(format, key, value, suffix, min, max) {
		return html`
			<span class="input-wrap glass" data-suffix=${suffix || nothing}>
				<input
					type="text"
					.value=${String(value)}
					@input=${this._filterDigits}
					@change=${(e) => {
						const n = parseInt(e.target.value, 10);
						if (Number.isNaN(n)) {
							e.target.value = String(store.formatOptions[format][key]);
							return;
						}
						const clamped = Math.min(max, Math.max(min, n));
						e.target.value = String(clamped);
						store.setFormatOption(format, key, clamped);
					}}
				/>
			</span>
		`;
	}

	_formatOptions() {
		const opts = store.formatOptions;
		switch (store.format) {
			case "jpg":
				return html` at ${this._numberInput("jpg", "quality", opts.jpg.quality, "%", 1, 100)} quality`;
			case "tiff":
				return html` with
					<dg-dropdown
						.options=${[
							{ value: "lzw", label: "LZW" },
							{ value: "deflate", label: "Deflate" },
							{ value: "none", label: "None" },
						]}
						.value=${opts.tiff.compression}
						@change=${(e) => store.setFormatOption("tiff", "compression", e.detail.value)}
					></dg-dropdown>
					compression`;
			case "webp":
				return html`
					<dg-dropdown
						.options=${[
							{ value: "lossy", label: "Lossy" },
							{ value: "lossless", label: "Lossless" },
						]}
						.value=${opts.webp.lossless ? "lossless" : "lossy"}
						@change=${(e) => store.setFormatOption("webp", "lossless", e.detail.value === "lossless")}
					></dg-dropdown>
					${opts.webp.lossless
						? nothing
						: html` at ${this._numberInput("webp", "quality", opts.webp.quality, "%", 1, 100)} quality `}
				`;
			default:
				return nothing;
		}
	}

}

customElements.define("dg-settings-panel", DgSettingsPanel);
