import { LitElement, html } from "lit";

import {
  createRipple,
  supportsHtmlInCanvas,
  type RippleInstance,
  type RippleOptions,
} from "./RippleVanilla";

export class CanvasUiRipple extends LitElement {
  static properties = {
    amplitude: { type: Number },
    speed: { type: Number },
    wavelength: { type: Number },
    rings: { type: Number },
    decay: { type: Number },
    refraction: { type: Number },
    dispersion: { type: Number },
    shine: { type: Number },
    trigger: { type: String },
    interval: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare amplitude?: number;
  declare speed?: number;
  declare wavelength?: number;
  declare rings?: number;
  declare decay?: number;
  declare refraction?: number;
  declare dispersion?: number;
  declare shine?: number;
  declare trigger?: string;
  declare interval?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: RippleInstance | null = null;
  _savedChildren: ChildNode[] | null = null;

  constructor() {
    super();
    this._native = false;
    this._failed = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._savedChildren = [...this.childNodes];
    this._native = supportsHtmlInCanvas();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._instance?.destroy();
    this._instance = null;
  }

  async firstUpdated(): Promise<void> {
    const source = this.querySelector<HTMLCanvasElement>("#source");
    const content = this.querySelector<HTMLDivElement>("#content");
    const output = this.querySelector<HTMLCanvasElement>("#output");
    if (!source || !content || !output) return;
    source.setAttribute("layoutsubtree", "true");
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    this._instance = createRipple(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): RippleOptions {
    return {
      ...(this.amplitude !== undefined && { amplitude: this.amplitude }),
      ...(this.speed !== undefined && { speed: this.speed }),
      ...(this.wavelength !== undefined && { wavelength: this.wavelength }),
      ...(this.rings !== undefined && { rings: this.rings }),
      ...(this.decay !== undefined && { decay: this.decay }),
      ...(this.refraction !== undefined && { refraction: this.refraction }),
      ...(this.dispersion !== undefined && { dispersion: this.dispersion }),
      ...(this.shine !== undefined && { shine: this.shine }),
      ...(this.trigger !== undefined && { trigger: this.trigger as RippleOptions["trigger"] }),
      ...(this.interval !== undefined && { interval: this.interval }),
    };
  }

  render() {
    const native = this._native && !this._failed;
    const children = this._savedChildren ?? [];
    return html`
      <div style="position: relative; height: 100%">
        <canvas id="source"
          style=${native
            ? "position: absolute; inset: 0; width: 100%; height: 100%"
            : "display: none"}
        >
          ${native ? html`
            <div id="content"
              style="position: relative; width: 100%; height: 100%; overflow: auto"
            >
              ${children}
            </div>
          ` : ""}
        </canvas>
        ${!native ? html`
          <div id="content"
            style="position: relative; width: 100%; height: 100%; overflow: auto"
          >
              ${children}
            </div>
        ` : ""}
        <canvas id="output" aria-hidden="true"
          style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none"
        ></canvas>
      </div>
    `;
  }
}

if (!customElements.get("canvas-ui-ripple")) {
  customElements.define("canvas-ui-ripple", CanvasUiRipple);
}

export type { RippleInstance, RippleOptions };
