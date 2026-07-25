import { LitElement, html } from "lit";

import {
  createCloth,
  supportsHtmlInCanvas,
  type ClothInstance,
  type ClothOptions,
} from "./ClothVanilla";

export class CanvasUiCloth extends LitElement {
  static properties = {
    pin: { type: String },
    wind: { type: Number },
    speed: { type: Number },
    amplitude: { type: Number },
    drape: { type: Number },
    brush: { type: Number },
    brushSize: { type: Number },
    damping: { type: Number },
    light: { type: Number },
    sheen: { type: Number },
    shadow: { type: Number },
    cornerRadius: { type: Number },
    backing: { type: Array },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare pin?: string;
  declare wind?: number;
  declare speed?: number;
  declare amplitude?: number;
  declare drape?: number;
  declare brush?: number;
  declare brushSize?: number;
  declare damping?: number;
  declare light?: number;
  declare sheen?: number;
  declare shadow?: number;
  declare cornerRadius?: number;
  declare backing?: [number, number, number] | "auto";
  declare _native: boolean;
  declare _failed: boolean;
  _instance: ClothInstance | null = null;
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
    this._instance = createCloth(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): ClothOptions {
    return {
      ...(this.pin !== undefined && { pin: this.pin as ClothOptions["pin"] }),
      ...(this.wind !== undefined && { wind: this.wind }),
      ...(this.speed !== undefined && { speed: this.speed }),
      ...(this.amplitude !== undefined && { amplitude: this.amplitude }),
      ...(this.drape !== undefined && { drape: this.drape }),
      ...(this.brush !== undefined && { brush: this.brush }),
      ...(this.brushSize !== undefined && { brushSize: this.brushSize }),
      ...(this.damping !== undefined && { damping: this.damping }),
      ...(this.light !== undefined && { light: this.light }),
      ...(this.sheen !== undefined && { sheen: this.sheen }),
      ...(this.shadow !== undefined && { shadow: this.shadow }),
      ...(this.cornerRadius !== undefined && { cornerRadius: this.cornerRadius }),
      ...(this.backing !== undefined && { backing: this.backing }),
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
              style="position: relative; width: 100%; height: 100%; overflow: hidden"
            >
              ${children}
            </div>
          ` : ""}
        </canvas>
        ${!native ? html`
          <div id="content"
            style="position: relative; width: 100%; height: 100%; overflow: hidden"
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

if (!customElements.get("canvas-ui-cloth")) {
  customElements.define("canvas-ui-cloth", CanvasUiCloth);
}

export type { ClothInstance, ClothOptions };
