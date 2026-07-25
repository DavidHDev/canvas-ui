import { LitElement, html } from "lit";

import {
  createLiquid,
  supportsHtmlInCanvas,
  type LiquidInstance,
  type LiquidOptions,
} from "./LiquidVanilla";

export class CanvasUiLiquid extends LitElement {
  static properties = {
    simResolution: { type: Number },
    dyeResolution: { type: Number },
    densityDissipation: { type: Number },
    velocityDissipation: { type: Number },
    pressure: { type: Number },
    pressureIterations: { type: Number },
    curl: { type: Number },
    radius: { type: Number },
    force: { type: Number },
    intensity: { type: Number },
    distortion: { type: Number },
    blend: { type: Number },
    color: { type: Array },
    rainbow: { type: Boolean },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare simResolution?: number;
  declare dyeResolution?: number;
  declare densityDissipation?: number;
  declare velocityDissipation?: number;
  declare pressure?: number;
  declare pressureIterations?: number;
  declare curl?: number;
  declare radius?: number;
  declare force?: number;
  declare intensity?: number;
  declare distortion?: number;
  declare blend?: number;
  declare color?: [number, number, number];
  declare rainbow?: boolean;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: LiquidInstance | null = null;
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
    this._instance = createLiquid(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): LiquidOptions {
    return {
      ...(this.simResolution !== undefined && { simResolution: this.simResolution }),
      ...(this.dyeResolution !== undefined && { dyeResolution: this.dyeResolution }),
      ...(this.densityDissipation !== undefined && { densityDissipation: this.densityDissipation }),
      ...(this.velocityDissipation !== undefined && { velocityDissipation: this.velocityDissipation }),
      ...(this.pressure !== undefined && { pressure: this.pressure }),
      ...(this.pressureIterations !== undefined && { pressureIterations: this.pressureIterations }),
      ...(this.curl !== undefined && { curl: this.curl }),
      ...(this.radius !== undefined && { radius: this.radius }),
      ...(this.force !== undefined && { force: this.force }),
      ...(this.intensity !== undefined && { intensity: this.intensity }),
      ...(this.distortion !== undefined && { distortion: this.distortion }),
      ...(this.blend !== undefined && { blend: this.blend }),
      ...(this.color !== undefined && { color: this.color }),
      ...(this.rainbow !== undefined && { rainbow: this.rainbow }),
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

if (!customElements.get("canvas-ui-liquid")) {
  customElements.define("canvas-ui-liquid", CanvasUiLiquid);
}

export type { LiquidInstance, LiquidOptions };
