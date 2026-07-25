import { LitElement, html } from "lit";

import {
  createHexFloat,
  supportsHtmlInCanvas,
  type HexFloatInstance,
  type HexFloatOptions,
} from "./HexFloatVanilla";

export class CanvasUiHexFloat extends LitElement {
  static properties = {
    size: { type: Number },
    gap: { type: Number },
    bevel: { type: Number },
    tilt: { type: Number },
    perspective: { type: Number },
    float: { type: Number },
    speed: { type: Number },
    shine: { type: Number },
    lift: { type: Number },
    radius: { type: Number },
    flow: { type: Number },
    swirl: { type: Number },
    trail: { type: Number },
    iridescence: { type: Number },
    bloom: { type: Number },
    grain: { type: Number },
    gapColor: { type: Array },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare size?: number;
  declare gap?: number;
  declare bevel?: number;
  declare tilt?: number;
  declare perspective?: number;
  declare float?: number;
  declare speed?: number;
  declare shine?: number;
  declare lift?: number;
  declare radius?: number;
  declare flow?: number;
  declare swirl?: number;
  declare trail?: number;
  declare iridescence?: number;
  declare bloom?: number;
  declare grain?: number;
  declare gapColor?: [number, number, number] | "auto";
  declare _native: boolean;
  declare _failed: boolean;
  _instance: HexFloatInstance | null = null;
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
    this._instance = createHexFloat(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): HexFloatOptions {
    return {
      ...(this.size !== undefined && { size: this.size }),
      ...(this.gap !== undefined && { gap: this.gap }),
      ...(this.bevel !== undefined && { bevel: this.bevel }),
      ...(this.tilt !== undefined && { tilt: this.tilt }),
      ...(this.perspective !== undefined && { perspective: this.perspective }),
      ...(this.float !== undefined && { float: this.float }),
      ...(this.speed !== undefined && { speed: this.speed }),
      ...(this.shine !== undefined && { shine: this.shine }),
      ...(this.lift !== undefined && { lift: this.lift }),
      ...(this.radius !== undefined && { radius: this.radius }),
      ...(this.flow !== undefined && { flow: this.flow }),
      ...(this.swirl !== undefined && { swirl: this.swirl }),
      ...(this.trail !== undefined && { trail: this.trail }),
      ...(this.iridescence !== undefined && { iridescence: this.iridescence }),
      ...(this.bloom !== undefined && { bloom: this.bloom }),
      ...(this.grain !== undefined && { grain: this.grain }),
      ...(this.gapColor !== undefined && { gapColor: this.gapColor }),
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

if (!customElements.get("canvas-ui-hex-float")) {
  customElements.define("canvas-ui-hex-float", CanvasUiHexFloat);
}

export type { HexFloatInstance, HexFloatOptions };
