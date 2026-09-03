import { LitElement, html, css } from "lit";
import { DotGridEngine } from "../engine/DotGridEngine.js";

/**
 * <dg-canvas> — hosts the dot-grid engine canvas + CRT scanline overlay.
 * Fills its container; forwards pointer position to the engine.
 *
 * Properties:
 * - mode: engine mode key (ready|settings|processing|error|success)
 * - onFrame(frameState): per-frame callback (set as .onFrame)
 * - onSwap(mode): content-swap moment callback (set as .onSwap)
 */
export class DgCanvas extends LitElement {
	static properties = {
		mode: { type: String },
	};

	static styles = css`
		:host {
			display: block;
			position: absolute;
			inset: 0;
			background: var(--dg-bg-canvas);
			/* Establishes a stacking context so .scanlines below stays inside
			   this element. Without it the host is position:absolute with
			   z-index:auto, which creates no context, and the overlay's
			   z-index:10 competed in dg-app's stacking order — landing above
			   the shell at z-index:6 and striping the whole UI. Invisible on
			   dark chrome; on a light button it read as a rendering fault.
			   The CRT belongs to the grid, which is the screen being imitated,
			   not to the app's own controls. */
			z-index: 0;
		}

		canvas {
			display: block;
			transition: opacity 0.4s ease;
		}

		canvas.resizing {
			opacity: 0;
			transition: opacity 0.12s ease;
		}

		.scanlines {
			position: absolute;
			inset: 0;
			z-index: 10;
			pointer-events: none;
			background: repeating-linear-gradient(
				to bottom,
				transparent 0px,
				transparent 1px,
				rgba(0, 0, 0, 0.14) 1px,
				rgba(0, 0, 0, 0.14) 2px
			);
		}
	`;

	constructor() {
		super();
		this.mode = "ready";
		this.onFrame = null;
		this.onSwap = null;
		this._engine = null;
		this._resizeObserver = null;
	}

	render() {
		return html`
			<canvas></canvas>
			<div class="scanlines"></div>
		`;
	}

	connectedCallback() {
		super.connectedCallback();
		// Document-level tracking so overlays (letterbox, buttons) don't
		// create dead zones for the cursor spotlight.
		this._onMove = (e) => {
			const rect = this.getBoundingClientRect();
			this._engine?.setPointer(e.clientX - rect.left, e.clientY - rect.top);
		};
		this._onLeave = () => this._engine?.clearPointer();
		document.addEventListener("mousemove", this._onMove);
		document.addEventListener("mouseleave", this._onLeave);
	}

	firstUpdated() {
		const canvas = this.renderRoot.querySelector("canvas");
		this._engine = new DotGridEngine(canvas, {
			onFrame: (f) => this.onFrame?.(f),
			onSwap: (m) => this.onSwap?.(m),
		});
		this._engine.mode = this.mode;

		// Resizing blanks the canvas and rebuilds the grid, which reads as a
		// flash — hide the dots while resize events stream in, ease back in
		// once they settle. The initial observation must not fade.
		this._resizeObserver = new ResizeObserver(() => {
			if (this._didInitialResize) {
				canvas.classList.add("resizing");
				clearTimeout(this._resizeSettle);
				this._resizeSettle = setTimeout(() => canvas.classList.remove("resizing"), 200);
			}
			this._didInitialResize = true;
			this._engine.resize(this.clientWidth, this.clientHeight);
		});
		this._resizeObserver.observe(this);
		this._engine.resize(this.clientWidth, this.clientHeight);
		this._engine.start();
	}

	updated(changed) {
		if (changed.has("mode") && this._engine) {
			this._engine.setMode(this.mode);
		}
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		this._engine?.stop();
		this._resizeObserver?.disconnect();
		clearTimeout(this._resizeSettle);
		document.removeEventListener("mousemove", this._onMove);
		document.removeEventListener("mouseleave", this._onLeave);
	}
}

customElements.define("dg-canvas", DgCanvas);
