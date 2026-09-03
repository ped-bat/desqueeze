import { LitElement, html, css, nothing } from "lit";
import { typography } from "../styles/typography.css.js";
import { effects } from "../styles/effects.css.js";
import { store, StoreController, FACTOR_PRESETS } from "../state/app-state.js";
import "./dg-dropdown.js";

/**
 * <dg-settings-panel> — sentence-style settings, now a popover anchored to
 * the top bar's chip rather than a screen the user has to pass through.
 *
 * The sentence form is kept — it reads better than a label/field grid for
 * two settings — but set in sentence case at a readable size instead of
 * tracked-out uppercase.
 */
export class DgSettingsPanel extends LitElement {
	static styles = [
		typography,
		effects,
		css`
			:host {
				display: block;
				min-width: 22rem;
				padding: 16px 18px;
				border-radius: 10px;
				border: 1px solid var(--dg-chrome-border);
				background: var(--dg-chrome);
				backdrop-filter: var(--dg-blur-chrome);
				-webkit-backdrop-filter: var(--dg-blur-chrome);
				box-shadow: 0 18px 44px -18px rgba(0, 0, 0, 0.9);
				pointer-events: auto;
				font-family: var(--dg-font);
				font-size: var(--dg-ui);
				font-variation-settings: var(--dg-var-ui);
				color: var(--dg-fg-strong);
			}

			.line {
				display: flex;
				align-items: center;
				flex-wrap: wrap;
				gap: 0.4em;
				line-height: 2;
			}

			.line + .line {
				margin-top: 8px;
			}

			/* Explicit margin: the reset in global.css is light-DOM only, so a
			   <p> in here still carries the UA's 1em top and bottom, which
			   was padding the panel out below the last line. */
			.hint {
				margin: 12px 0 0;
				padding-top: 12px;
				border-top: 1px solid rgba(255, 255, 255, 0.1);
				font-size: var(--dg-ui-sm);
				color: var(--dg-fg-faint);
				line-height: 1.5;
			}

			.hint.lossy {
				color: #e8c78b;
			}

			/* Mirrors dg-dropdown's .toggle exactly - same padding, border,
			   radius, ground and weight - because the two sit side by side in
			   the same sentence and any difference reads as a mistake. The
			   input inside carries no box of its own; the wrapper is the
			   control. */
			.input-wrap {
				display: inline-flex;
				align-items: center;
				gap: 0.1em;
				font-family: var(--dg-font);
				font-size: inherit;
				/* Matches dg-dropdown's .toggle; see the note there. */
				line-height: 1.15;
				font-variation-settings: var(--dg-var-ui-strong);
				letter-spacing: 0;
				color: var(--dg-fg-strong);
				background: rgba(255, 255, 255, 0.07);
				border: 1px solid rgba(255, 255, 255, 0.22);
				border-radius: 6px;
				padding: 0.28em 0.7em;
				transition:
					background 0.16s ease,
					border-color 0.16s ease;
			}

			.input-wrap:hover {
				background: rgba(255, 255, 255, 0.12);
				border-color: rgba(255, 255, 255, 0.34);
			}

			.input-wrap:focus-within {
				background: rgba(255, 255, 255, 0.12);
				border-color: var(--dg-accent-ring);
			}

			.input-wrap[data-suffix]::after {
				content: attr(data-suffix);
				font: inherit;
				color: var(--dg-fg-faint);
				pointer-events: none;
			}

			.input-wrap input {
				border: none;
				background: transparent;
				outline: none;
				padding: 0;
				/* Sizes to what is typed, so a 2-digit quality and a 4-digit
				   factor each get a control only as wide as they need. */
				field-sizing: content;
				min-width: 1.1em;
				max-width: 4em;
				text-align: right;
				color: inherit;
				font: inherit;
				line-height: 1.15;
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
							<span class="input-wrap" data-suffix="x">
								<input
									type="text"
									aria-label="Custom anamorphic factor"
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
			<p class="hint ${this._lossy() ? "lossy" : ""}">${this._hint()}</p>
		`;
	}

	/** Whether the current format resamples pixel data */
	_lossy() {
		if (store.format === "dng") return false;
		return store.format === "jpg" || (store.format === "webp" && !store.formatOptions.webp?.lossless);
	}

	_hint() {
		if (store.format === "dng")
			return "DNG writes DefaultScale metadata. No pixels are resampled.";
		return this._lossy()
			? "Pixel data is resampled and re-compressed for this format."
			: "Pixel data is resampled for this format.";
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
			<span class="input-wrap" data-suffix=${suffix || nothing}>
				<input
					type="text"
					aria-label=${`${format} ${key}`}
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
