import { LitElement, html, type PropertyValues } from "lit";

import {
  createPeel,
  supportsHtmlInCanvas,
  type PeelInstance,
  type PeelOptions,
} from "./PeelVanilla";

export class CanvasUiPeel extends LitElement {
  static properties = {
    side: { type: String },
    mode: { type: String },
    reveal: { type: Number },
    zone: { type: Number },
    curl: { type: Number },
    bow: { type: Number },
    shade: { type: Number },
    shine: { type: Number },
    shineDistance: { type: Number },
    shineColor: { type: Object },
    bulge: { type: Number },
    perspective: { type: Number },
    smoothing: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare side?: string;
  declare mode?: string;
  declare reveal?: number;
  declare zone?: number;
  declare curl?: number;
  declare bow?: number;
  declare shade?: number;
  declare shine?: number;
  declare shineDistance?: number;
  declare shineColor?: [number, number, number] | "auto";
  declare bulge?: number;
  declare perspective?: number;
  declare smoothing?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: PeelInstance | null = null;
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
    const under = this.querySelector<HTMLDivElement>("#under");
    if (!source || !content || !output) return;
    source.setAttribute("layoutsubtree", "true");
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    this._instance = createPeel(
      { source, content, output, under: under ?? undefined },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('side') || changedProperties.has('mode') ||
        changedProperties.has('reveal') || changedProperties.has('zone') ||
        changedProperties.has('curl') || changedProperties.has('bow') ||
        changedProperties.has('shade') || changedProperties.has('shine') ||
        changedProperties.has('shineDistance') || changedProperties.has('shineColor') ||
        changedProperties.has('bulge') || changedProperties.has('perspective') ||
        changedProperties.has('smoothing')) {
      this._instance?.setOptions(this._getOptions());
    }
  }

  private _getOptions(): PeelOptions {
    return {
      ...(this.side !== undefined && { side: this.side as PeelOptions["side"] }),
      ...(this.mode !== undefined && { mode: this.mode as PeelOptions["mode"] }),
      ...(this.reveal !== undefined && { reveal: this.reveal }),
      ...(this.zone !== undefined && { zone: this.zone }),
      ...(this.curl !== undefined && { curl: this.curl }),
      ...(this.bow !== undefined && { bow: this.bow }),
      ...(this.shade !== undefined && { shade: this.shade }),
      ...(this.shine !== undefined && { shine: this.shine }),
      ...(this.shineDistance !== undefined && { shineDistance: this.shineDistance }),
      ...(this.shineColor !== undefined && { shineColor: this.shineColor as PeelOptions["shineColor"] }),
      ...(this.bulge !== undefined && { bulge: this.bulge }),
      ...(this.perspective !== undefined && { perspective: this.perspective }),
      ...(this.smoothing !== undefined && { smoothing: this.smoothing }),
    };
  }

  render() {
    const native = this._native && !this._failed;
    const children = this._savedChildren ?? [];
    return html`
      <div style="position: relative; height: 100%">
        ${native ? html`
          <div id="under"
            style="position: absolute; inset: 0; overflow: hidden; visibility: hidden"
          >
            <slot name="under"></slot>
          </div>
        ` : ""}
        <canvas id="source"
          style=${native
            ? "position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none"
            : "display: none"}
        >
          ${native ? html`
            <div id="content"
              style="position: relative; width: 100%; height: 100%; overflow: hidden; pointer-events: auto"
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

if (!customElements.get("canvas-ui-peel")) {
  customElements.define("canvas-ui-peel", CanvasUiPeel);
}

export type { PeelInstance, PeelOptions };
