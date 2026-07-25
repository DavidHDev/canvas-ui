import { LitElement, html } from "lit";

import {
  createClouds,
  supportsHtmlInCanvas,
  type CloudsInstance,
  type CloudsOptions,
} from "./CloudsVanilla";

export class CanvasUiClouds extends LitElement {
  static properties = {
    scale: { type: Number },
    speed: { type: Number },
    cover: { type: Number },
    density: { type: Number },
    shading: { type: Number },
    color: { type: Array },
    opacity: { type: Number },
    shadow: { type: Number },
    shadowOffsetX: { type: Number },
    shadowOffsetY: { type: Number },
    shadowSoftness: { type: Number },
    wind: { type: Number },
    windRadius: { type: Number },
    refraction: { type: Number },
    fogBlur: { type: Number },
    quality: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare scale?: number;
  declare speed?: number;
  declare cover?: number;
  declare density?: number;
  declare shading?: number;
  declare color?: [number, number, number] | "auto";
  declare opacity?: number;
  declare shadow?: number;
  declare shadowOffsetX?: number;
  declare shadowOffsetY?: number;
  declare shadowSoftness?: number;
  declare wind?: number;
  declare windRadius?: number;
  declare refraction?: number;
  declare fogBlur?: number;
  declare quality?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: CloudsInstance | null = null;
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
    this._instance = createClouds(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): CloudsOptions {
    return {
      ...(this.scale !== undefined && { scale: this.scale }),
      ...(this.speed !== undefined && { speed: this.speed }),
      ...(this.cover !== undefined && { cover: this.cover }),
      ...(this.density !== undefined && { density: this.density }),
      ...(this.shading !== undefined && { shading: this.shading }),
      ...(this.color !== undefined && { color: this.color }),
      ...(this.opacity !== undefined && { opacity: this.opacity }),
      ...(this.shadow !== undefined && { shadow: this.shadow }),
      ...(this.shadowOffsetX !== undefined && { shadowOffsetX: this.shadowOffsetX }),
      ...(this.shadowOffsetY !== undefined && { shadowOffsetY: this.shadowOffsetY }),
      ...(this.shadowSoftness !== undefined && { shadowSoftness: this.shadowSoftness }),
      ...(this.wind !== undefined && { wind: this.wind }),
      ...(this.windRadius !== undefined && { windRadius: this.windRadius }),
      ...(this.refraction !== undefined && { refraction: this.refraction }),
      ...(this.fogBlur !== undefined && { fogBlur: this.fogBlur }),
      ...(this.quality !== undefined && { quality: this.quality }),
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

if (!customElements.get("canvas-ui-clouds")) {
  customElements.define("canvas-ui-clouds", CanvasUiClouds);
}

export type { CloudsInstance, CloudsOptions };
