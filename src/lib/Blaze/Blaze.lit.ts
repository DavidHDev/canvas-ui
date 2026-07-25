import { LitElement, html } from "lit";

import {
  createBlaze,
  supportsHtmlInCanvas,
  type BlazeInstance,
  type BlazeOptions,
} from "./BlazeVanilla";

export class CanvasUiBlaze extends LitElement {
  static properties = {
    height: { type: Number },
    distortion: { type: Number },
    distortionScale: { type: Number },
    speed: { type: Number },
    sparks: { type: Number },
    sparkDensity: { type: Number },
    sparkSize: { type: Number },
    layers: { type: Number },
    smoke: { type: Number },
    glow: { type: Number },
    sparkColor: { type: Array },
    smokeColor: { type: Array },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare height?: number;
  declare distortion?: number;
  declare distortionScale?: number;
  declare speed?: number;
  declare sparks?: number;
  declare sparkDensity?: number;
  declare sparkSize?: number;
  declare layers?: number;
  declare smoke?: number;
  declare glow?: number;
  declare sparkColor?: [number, number, number];
  declare smokeColor?: [number, number, number];
  declare _native: boolean;
  declare _failed: boolean;
  _instance: BlazeInstance | null = null;
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
    this._instance = createBlaze(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): BlazeOptions {
    return {
      ...(this.height !== undefined && { height: this.height }),
      ...(this.distortion !== undefined && { distortion: this.distortion }),
      ...(this.distortionScale !== undefined && { distortionScale: this.distortionScale }),
      ...(this.speed !== undefined && { speed: this.speed }),
      ...(this.sparks !== undefined && { sparks: this.sparks }),
      ...(this.sparkDensity !== undefined && { sparkDensity: this.sparkDensity }),
      ...(this.sparkSize !== undefined && { sparkSize: this.sparkSize }),
      ...(this.layers !== undefined && { layers: this.layers }),
      ...(this.smoke !== undefined && { smoke: this.smoke }),
      ...(this.glow !== undefined && { glow: this.glow }),
      ...(this.sparkColor !== undefined && { sparkColor: this.sparkColor }),
      ...(this.smokeColor !== undefined && { smokeColor: this.smokeColor }),
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

if (!customElements.get("canvas-ui-blaze")) {
  customElements.define("canvas-ui-blaze", CanvasUiBlaze);
}

export type { BlazeInstance, BlazeOptions };
