import { LitElement, html } from "lit";

import {
  createGlitch,
  supportsHtmlInCanvas,
  type GlitchInstance,
  type GlitchOptions,
} from "./GlitchVanilla";

export class CanvasUiGlitch extends LitElement {
  static properties = {
    intensity: { type: Number },
    interval: { type: Number },
    duration: { type: Number },
    slices: { type: Number },
    shift: { type: Number },
    rgbShift: { type: Number },
    blocks: { type: Number },
    noise: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare intensity?: number;
  declare interval?: number;
  declare duration?: number;
  declare slices?: number;
  declare shift?: number;
  declare rgbShift?: number;
  declare blocks?: number;
  declare noise?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: GlitchInstance | null = null;
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
    this._instance = createGlitch(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): GlitchOptions {
    return {
      ...(this.intensity !== undefined && { intensity: this.intensity }),
      ...(this.interval !== undefined && { interval: this.interval }),
      ...(this.duration !== undefined && { duration: this.duration }),
      ...(this.slices !== undefined && { slices: this.slices }),
      ...(this.shift !== undefined && { shift: this.shift }),
      ...(this.rgbShift !== undefined && { rgbShift: this.rgbShift }),
      ...(this.blocks !== undefined && { blocks: this.blocks }),
      ...(this.noise !== undefined && { noise: this.noise }),
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

if (!customElements.get("canvas-ui-glitch")) {
  customElements.define("canvas-ui-glitch", CanvasUiGlitch);
}

export type { GlitchInstance, GlitchOptions };
