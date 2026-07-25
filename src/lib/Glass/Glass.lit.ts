import { LitElement, html } from "lit";

import {
  createGlass,
  supportsHtmlInCanvas,
  type GlassInstance,
  type GlassOptions,
} from "./GlassVanilla";

export class CanvasUiGlass extends LitElement {
  static properties = {
    shape: { type: String },
    size: { type: Number },
    aspect: { type: Number },
    corner: { type: Number },
    ior: { type: Number },
    edge: { type: Number },
    bevel: { type: Number },
    depth: { type: Number },
    aberration: { type: Number },
    blurAmount: { type: Number },
    reflection: { type: Number },
    shine: { type: Number },
    zoom: { type: Number },
    targets: { type: String },
    follow: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare shape?: string;
  declare size?: number;
  declare aspect?: number;
  declare corner?: number;
  declare ior?: number;
  declare edge?: number;
  declare bevel?: number;
  declare depth?: number;
  declare aberration?: number;
  declare blurAmount?: number;
  declare reflection?: number;
  declare shine?: number;
  declare zoom?: number;
  declare targets?: string;
  declare follow?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: GlassInstance | null = null;
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
    this._instance = createGlass(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): GlassOptions {
    return {
      ...(this.shape !== undefined && { shape: this.shape as GlassOptions["shape"] }),
      ...(this.size !== undefined && { size: this.size }),
      ...(this.aspect !== undefined && { aspect: this.aspect }),
      ...(this.corner !== undefined && { corner: this.corner }),
      ...(this.ior !== undefined && { ior: this.ior }),
      ...(this.edge !== undefined && { edge: this.edge }),
      ...(this.bevel !== undefined && { bevel: this.bevel }),
      ...(this.depth !== undefined && { depth: this.depth }),
      ...(this.aberration !== undefined && { aberration: this.aberration }),
      ...(this.blurAmount !== undefined && { blur: this.blurAmount }),
      ...(this.reflection !== undefined && { reflection: this.reflection }),
      ...(this.shine !== undefined && { shine: this.shine }),
      ...(this.zoom !== undefined && { zoom: this.zoom }),
      ...(this.targets !== undefined && { targets: this.targets }),
      ...(this.follow !== undefined && { follow: this.follow }),
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

if (!customElements.get("canvas-ui-glass")) {
  customElements.define("canvas-ui-glass", CanvasUiGlass);
}

export type { GlassInstance, GlassOptions };
