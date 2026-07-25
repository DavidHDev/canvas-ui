import { LitElement, html } from "lit";

import {
  createRetroDither,
  supportsHtmlInCanvas,
  type RetroDitherInstance,
  type RetroDitherOptions,
} from "./RetroDitherVanilla";

export class CanvasUiRetroDither extends LitElement {
  static properties = {
    radius: { type: Number },
    softness: { type: Number },
    pixelSize: { type: Number },
    levels: { type: Number },
    darkColor: { type: Array },
    lightColor: { type: Array },
    colorize: { type: Number },
    contrast: { type: Number },
    brightness: { type: Number },
    strength: { type: Number },
    baseStrength: { type: Number },
    invert: { type: Number },
    scanlines: { type: Number },
    followSpeed: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare radius?: number;
  declare softness?: number;
  declare pixelSize?: number;
  declare levels?: number;
  declare darkColor?: [number, number, number];
  declare lightColor?: [number, number, number];
  declare colorize?: number;
  declare contrast?: number;
  declare brightness?: number;
  declare strength?: number;
  declare baseStrength?: number;
  declare invert?: number;
  declare scanlines?: number;
  declare followSpeed?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: RetroDitherInstance | null = null;
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
    this._instance = createRetroDither(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): RetroDitherOptions {
    return {
      ...(this.radius !== undefined && { radius: this.radius }),
      ...(this.softness !== undefined && { softness: this.softness }),
      ...(this.pixelSize !== undefined && { pixelSize: this.pixelSize }),
      ...(this.levels !== undefined && { levels: this.levels }),
      ...(this.darkColor !== undefined && { darkColor: this.darkColor }),
      ...(this.lightColor !== undefined && { lightColor: this.lightColor }),
      ...(this.colorize !== undefined && { colorize: this.colorize }),
      ...(this.contrast !== undefined && { contrast: this.contrast }),
      ...(this.brightness !== undefined && { brightness: this.brightness }),
      ...(this.strength !== undefined && { strength: this.strength }),
      ...(this.baseStrength !== undefined && { baseStrength: this.baseStrength }),
      ...(this.invert !== undefined && { invert: this.invert }),
      ...(this.scanlines !== undefined && { scanlines: this.scanlines }),
      ...(this.followSpeed !== undefined && { followSpeed: this.followSpeed }),
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

if (!customElements.get("canvas-ui-retro-dither")) {
  customElements.define("canvas-ui-retro-dither", CanvasUiRetroDither);
}

export type { RetroDitherInstance, RetroDitherOptions };
