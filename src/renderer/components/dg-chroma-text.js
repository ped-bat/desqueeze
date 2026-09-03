import { LitElement, html, css } from "lit";
import { lerp } from "../core/easing.js";

/**
 * <dg-chroma-text> — three stacked text layers (R/G/B) with screen
 * blending, used for both the main title and the subtitle.
 *
 * variant="title"    static chroma colors, scaleX(1.5), large type
 * variant="subtitle" colors lerp white→chroma driven by frame intensity
 *
 * Per-frame animation values arrive via applyFrame() as direct style
 * writes — no re-render on the 60fps path.
 */
export class DgChromaText extends LitElement {
	static properties = {
		text: { type: String },
		variant: { type: String },
	};

	static styles = css`
		:host {
			display: block;
			position: relative;
			pointer-events: none;
		}

		.stack {
			position: relative;
			font-family: var(--dg-font);
			/* The engine drives opacity every frame. Without a hidden resting
			   state the element paints at full opacity for the frame between
			   mounting and its first applyFrame — which is what made the hero
			   flash when Clear dropped the list and remounted the stage
			   mid-transition. */
			opacity: 0;
		}

		/* Uppercase is display treatment, applied to the one short hero line.
		   The subtitle below it is a sentence and stays in sentence case. */
		:host([variant="title"]) .stack {
			text-transform: uppercase;
		}

		/* No scaleX here any more. Scaling the rendered glyph stretched the
		   vertical stems 50% heavier than the horizontal crossbars, which is
		   what made the display line read as broken rather than wide. The
		   width now comes from the font's own wdth axis, driven by the
		   engine (see ENGINE_CONFIG.fontWidth), which widens the letterforms
		   while holding stroke weight even. */
		:host([variant="title"]) .stack {
			font-weight: 600;
			font-size: var(--dg-font-size-title);
			letter-spacing: var(--dg-tracking-tight);
		}

		:host([variant="subtitle"]) .stack {
			font-size: var(--dg-font-size-sub);
			font-weight: 400;
			letter-spacing: 0;
			text-align: center;
			/* Was nowrap: a sentence long enough to say what is supported
			   overflows the 720px minimum window. */
			text-wrap: balance;
			max-width: 32ch;
		}

		.layer {
			display: block;
			mix-blend-mode: screen;
			will-change: transform;
		}

		.layer-r,
		.layer-b {
			position: absolute;
			left: 0;
			top: 0;
			/* The R and B layers are taken out of flow, so they need the
			   stack's width explicitly or they wrap at a different point
			   than the G layer and the channels separate. */
			width: 100%;
		}

		.layer-g {
			position: relative;
		}

		:host([variant="title"]) .layer-r {
			color: var(--dg-chroma-red);
			text-shadow: 0 0 12px rgba(255, 0, 0, 0.6), 0 0 30px rgba(255, 0, 0, 0.3);
		}
		:host([variant="title"]) .layer-g {
			color: var(--dg-chroma-blue);
			text-shadow: 0 0 12px rgba(0, 80, 204, 0.6), 0 0 30px rgba(0, 80, 204, 0.3);
		}
		:host([variant="title"]) .layer-b {
			color: var(--dg-chroma-green);
			text-shadow: 0 0 12px rgba(0, 200, 68, 0.6), 0 0 30px rgba(0, 200, 68, 0.3);
		}
	`;

	constructor() {
		super();
		this.text = "";
		this.variant = "title";
	}

	render() {
		return html`
			<div class="stack" id="stack">
				<span class="layer layer-r" id="r">${this.text}</span>
				<span class="layer layer-g" id="g">${this.text}</span>
				<span class="layer layer-b" id="b">${this.text}</span>
			</div>
		`;
	}

	get _els() {
		if (!this.__els) {
			const $ = (id) => this.renderRoot.getElementById(id);
			this.__els = { stack: $("stack"), r: $("r"), g: $("g"), b: $("b") };
		}
		return this.__els;
	}

	/**
	 * Apply per-frame animation values.
	 * @param {{opacity:number, wght:number, wdth:number, letterSpacing:number,
	 *          chromaOffset:number, intensity?:number}} f
	 */
	applyFrame(f) {
		if (!this.hasUpdated) {
			// Hold it rather than drop it: the very first frame after the
			// element mounts is the one that decides whether it appears at
			// the engine's opacity or flashes at the CSS default.
			this._pending = f;
			return;
		}
		const { stack, r, g, b } = this._els;

		stack.style.opacity = f.opacity;
		stack.style.fontVariationSettings = `'wght' ${f.wght}, 'wdth' ${f.wdth}`;
		stack.style.letterSpacing = `${f.letterSpacing}px`;

		if (this.variant === "title") {
			r.style.transform = `translateX(${f.chromaOffset}px)`;
			b.style.transform = `translateX(${-f.chromaOffset}px)`;
			return;
		}

		// Subtitle: lerp layer colors between plain white (idle) and chroma
		// RGB (processing), fading the R/B layers in with intensity.
		const t = f.intensity ?? 0;
		const opa = lerp(0.55, 0.7, t).toFixed(3);
		const ch = (r0, g0, b0) =>
			`rgba(${Math.round(lerp(255, r0, t))},${Math.round(lerp(255, g0, t))},${Math.round(lerp(255, b0, t))},${opa})`;
		r.style.color = ch(255, 0, 0);
		g.style.color = ch(0, 80, 204);
		b.style.color = ch(0, 200, 68);

		const blend = t > 0.001 ? "screen" : "normal";
		r.style.mixBlendMode = g.style.mixBlendMode = b.style.mixBlendMode = blend;
		r.style.opacity = t;
		b.style.opacity = t;
		g.style.opacity = "1";

		const glow1 = lerp(0.15, 0.5, t).toFixed(3);
		const glow2 = lerp(0.08, 0.25, t).toFixed(3);
		const idle = "var(--dg-glow-white)";
		r.style.textShadow = t > 0.001 ? `0 0 6px rgba(255,0,0,${glow1}), 0 0 16px rgba(255,0,0,${glow2})` : idle;
		g.style.textShadow = t > 0.001 ? `0 0 6px rgba(0,80,204,${glow1}), 0 0 16px rgba(0,80,204,${glow2})` : idle;
		b.style.textShadow = t > 0.001 ? `0 0 6px rgba(0,200,68,${glow1}), 0 0 16px rgba(0,200,68,${glow2})` : idle;

		const off = f.chromaOffset;
		r.style.transform = off > 0.1 ? `translateX(${off}px)` : "";
		b.style.transform = off > 0.1 ? `translateX(${-off}px)` : "";
	}

	firstUpdated() {
		if (this._pending) {
			const f = this._pending;
			this._pending = null;
			this.applyFrame(f);
		}
	}

	updated() {
		this.__els = null;
	}
}

customElements.define("dg-chroma-text", DgChromaText);
