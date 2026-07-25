import { LitElement, html } from "lit";

import {
  createVHS,
  supportsHtmlInCanvas,
  type VHSInstance,
  type VHSOptions,
} from "./VHSVanilla";

export class CanvasUiVHS extends LitElement {
  static properties = {
    speed: { type: Number },
    wave: { type: Number },
    jitter: { type: Number },
    crease: { type: Number },
    switching: { type: Number },
    switchingHeight: { type: Number },
    bloom: { type: Number },
    aberration: { type: Number },
    acBeat: { type: Number },
    grain: { type: Number },
    scanlines: { type: Number },
    vignette: { type: Number },
    barrel: { type: Number },
    saturation: { type: Number },
    exposure: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare speed?: number;
  declare wave?: number;
  declare jitter?: number;
  declare crease?: number;
  declare switching?: number;
  declare switchingHeight?: number;
  declare bloom?: number;
  declare aberration?: number;
  declare acBeat?: number;
  declare grain?: number;
  declare scanlines?: number;
  declare vignette?: number;
  declare barrel?: number;
  declare saturation?: number;
  declare exposure?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: VHSInstance | null = null;
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
    this._instance = createVHS(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): VHSOptions {
    return {
      ...(this.speed !== undefined && { speed: this.speed }),
      ...(this.wave !== undefined && { wave: this.wave }),
      ...(this.jitter !== undefined && { jitter: this.jitter }),
      ...(this.crease !== undefined && { crease: this.crease }),
      ...(this.switching !== undefined && { switching: this.switching }),
      ...(this.switchingHeight !== undefined && { switchingHeight: this.switchingHeight }),
      ...(this.bloom !== undefined && { bloom: this.bloom }),
      ...(this.aberration !== undefined && { aberration: this.aberration }),
      ...(this.acBeat !== undefined && { acBeat: this.acBeat }),
      ...(this.grain !== undefined && { grain: this.grain }),
      ...(this.scanlines !== undefined && { scanlines: this.scanlines }),
      ...(this.vignette !== undefined && { vignette: this.vignette }),
      ...(this.barrel !== undefined && { barrel: this.barrel }),
      ...(this.saturation !== undefined && { saturation: this.saturation }),
      ...(this.exposure !== undefined && { exposure: this.exposure }),
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

if (!customElements.get("canvas-ui-vhs")) {
  customElements.define("canvas-ui-vhs", CanvasUiVHS);
}

export type { VHSInstance, VHSOptions };
