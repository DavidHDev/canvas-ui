import { LitElement, html } from "lit";

import {
  createGrid,
  supportsHtmlInCanvas,
  type GridInstance,
  type GridOptions,
} from "./GridVanilla";

export class CanvasUiGrid extends LitElement {
  static properties = {
    tileSize: { type: Number },
    gap: { type: Number },
    cornerRadius: { type: Number },
    amplitude: { type: Number },
    waveSpeed: { type: Number },
    frequency: { type: Number },
    waveWidth: { type: Number },
    fadeTime: { type: Number },
    maxLift: { type: Number },
    jitter: { type: Number },
    liftHeight: { type: Number },
    perspective: { type: Number },
    tilt: { type: Number },
    shading: { type: Number },
    tint: { type: Array },
    tintStrength: { type: Number },
    idleRipples: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare tileSize?: number;
  declare gap?: number;
  declare cornerRadius?: number;
  declare amplitude?: number;
  declare waveSpeed?: number;
  declare frequency?: number;
  declare waveWidth?: number;
  declare fadeTime?: number;
  declare maxLift?: number;
  declare jitter?: number;
  declare liftHeight?: number;
  declare perspective?: number;
  declare tilt?: number;
  declare shading?: number;
  declare tint?: [number, number, number];
  declare tintStrength?: number;
  declare idleRipples?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: GridInstance | null = null;
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
    this._instance = createGrid(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): GridOptions {
    return {
      ...(this.tileSize !== undefined && { tileSize: this.tileSize }),
      ...(this.gap !== undefined && { gap: this.gap }),
      ...(this.cornerRadius !== undefined && { cornerRadius: this.cornerRadius }),
      ...(this.amplitude !== undefined && { amplitude: this.amplitude }),
      ...(this.waveSpeed !== undefined && { waveSpeed: this.waveSpeed }),
      ...(this.frequency !== undefined && { frequency: this.frequency }),
      ...(this.waveWidth !== undefined && { waveWidth: this.waveWidth }),
      ...(this.fadeTime !== undefined && { fadeTime: this.fadeTime }),
      ...(this.maxLift !== undefined && { maxLift: this.maxLift }),
      ...(this.jitter !== undefined && { jitter: this.jitter }),
      ...(this.liftHeight !== undefined && { liftHeight: this.liftHeight }),
      ...(this.perspective !== undefined && { perspective: this.perspective }),
      ...(this.tilt !== undefined && { tilt: this.tilt }),
      ...(this.shading !== undefined && { shading: this.shading }),
      ...(this.tint !== undefined && { tint: this.tint }),
      ...(this.tintStrength !== undefined && { tintStrength: this.tintStrength }),
      ...(this.idleRipples !== undefined && { idleRipples: this.idleRipples }),
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

if (!customElements.get("canvas-ui-grid")) {
  customElements.define("canvas-ui-grid", CanvasUiGrid);
}

export type { GridInstance, GridOptions };
