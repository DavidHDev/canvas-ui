import { LitElement, html } from "lit";

import {
  createShatter,
  supportsHtmlInCanvas,
  type ShatterInstance,
  type ShatterOptions,
} from "./ShatterVanilla";

export class CanvasUiShatter extends LitElement {
  static properties = {
    radius: { type: Number },
    softness: { type: Number },
    tileSize: { type: Number },
    shards: { type: Number },
    corner: { type: Number },
    lift: { type: Number },
    tilt: { type: Number },
    scatter: { type: Number },
    perspective: { type: Number },
    gapColor: { type: Array },
    shadow: { type: Number },
    shading: { type: Number },
    refraction: { type: Number },
    dispersion: { type: Number },
    floatSpeed: { type: Number },
    strength: { type: Number },
    baseStrength: { type: Number },
    followSpeed: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare radius?: number;
  declare softness?: number;
  declare tileSize?: number;
  declare shards?: number;
  declare corner?: number;
  declare lift?: number;
  declare tilt?: number;
  declare scatter?: number;
  declare perspective?: number;
  declare gapColor?: [number, number, number];
  declare shadow?: number;
  declare shading?: number;
  declare refraction?: number;
  declare dispersion?: number;
  declare floatSpeed?: number;
  declare strength?: number;
  declare baseStrength?: number;
  declare followSpeed?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: ShatterInstance | null = null;
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
    this._instance = createShatter(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): ShatterOptions {
    return {
      ...(this.radius !== undefined && { radius: this.radius }),
      ...(this.softness !== undefined && { softness: this.softness }),
      ...(this.tileSize !== undefined && { tileSize: this.tileSize }),
      ...(this.shards !== undefined && { shards: this.shards }),
      ...(this.corner !== undefined && { corner: this.corner }),
      ...(this.lift !== undefined && { lift: this.lift }),
      ...(this.tilt !== undefined && { tilt: this.tilt }),
      ...(this.scatter !== undefined && { scatter: this.scatter }),
      ...(this.perspective !== undefined && { perspective: this.perspective }),
      ...(this.gapColor !== undefined && { gapColor: this.gapColor }),
      ...(this.shadow !== undefined && { shadow: this.shadow }),
      ...(this.shading !== undefined && { shading: this.shading }),
      ...(this.refraction !== undefined && { refraction: this.refraction }),
      ...(this.dispersion !== undefined && { dispersion: this.dispersion }),
      ...(this.floatSpeed !== undefined && { floatSpeed: this.floatSpeed }),
      ...(this.strength !== undefined && { strength: this.strength }),
      ...(this.baseStrength !== undefined && { baseStrength: this.baseStrength }),
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

if (!customElements.get("canvas-ui-shatter")) {
  customElements.define("canvas-ui-shatter", CanvasUiShatter);
}

export type { ShatterInstance, ShatterOptions };
