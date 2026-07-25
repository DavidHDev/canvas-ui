import { LitElement, html, type PropertyValues } from "lit";

import {
  createAsciify,
  supportsHtmlInCanvas,
  type AsciifyCharset,
  type AsciifyInstance,
  type AsciifyOptions,
} from "./AsciifyVanilla";

export class CanvasUiAsciify extends LitElement {
  static properties = {
    radius: { type: Number },
    charset: { type: String },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare radius?: number;
  declare charset?: string;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: AsciifyInstance | null = null;
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
    this._instance = createAsciify(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('radius') || changedProperties.has('charset')) {
      this._instance?.setOptions(this._getOptions());
    }
  }

  private _getOptions(): AsciifyOptions {
    return {
      ...(this.radius !== undefined && { radius: this.radius }),
      ...(this.charset !== undefined && { charset: this.charset as AsciifyCharset }),
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

if (!customElements.get("canvas-ui-asciify")) {
  customElements.define("canvas-ui-asciify", CanvasUiAsciify);
}

export type { AsciifyCharset, AsciifyInstance, AsciifyOptions };
