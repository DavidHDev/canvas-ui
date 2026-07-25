import { LitElement, html } from "lit";

import {
  createMagnify,
  supportsHtmlInCanvas,
  type MagnifyInstance,
  type MagnifyOptions,
} from "./MagnifyVanilla";

export class CanvasUiMagnify extends LitElement {
  static properties = {
    size: { type: Number },
    zoom: { type: Number },
    color: { type: Array },
    follow: { type: Number },
    hud: { type: Number },
    ring: { type: Boolean },
    crosshair: { type: Boolean },
    ticks: { type: Boolean },
    brackets: { type: Boolean },
    dot: { type: Boolean },
    grid: { type: Boolean },
    readout: { type: Boolean },
    aberration: { type: Number },
    haze: { type: Number },
    ripples: { type: Boolean },
    rippleSpeed: { type: Number },
    rippleWidth: { type: Number },
    rippleBendWidth: { type: Number },
    rippleBend: { type: Number },
    rippleGlow: { type: Number },
    rippleLife: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare size?: number;
  declare zoom?: number;
  declare color?: [number, number, number];
  declare follow?: number;
  declare hud?: number;
  declare ring?: boolean;
  declare crosshair?: boolean;
  declare ticks?: boolean;
  declare brackets?: boolean;
  declare dot?: boolean;
  declare grid?: boolean;
  declare readout?: boolean;
  declare aberration?: number;
  declare haze?: number;
  declare ripples?: boolean;
  declare rippleSpeed?: number;
  declare rippleWidth?: number;
  declare rippleBendWidth?: number;
  declare rippleBend?: number;
  declare rippleGlow?: number;
  declare rippleLife?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: MagnifyInstance | null = null;
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
    this._instance = createMagnify(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): MagnifyOptions {
    return {
      ...(this.size !== undefined && { size: this.size }),
      ...(this.zoom !== undefined && { zoom: this.zoom }),
      ...(this.color !== undefined && { color: this.color }),
      ...(this.follow !== undefined && { follow: this.follow }),
      ...(this.hud !== undefined && { hud: this.hud }),
      ...(this.ring !== undefined && { ring: this.ring }),
      ...(this.crosshair !== undefined && { crosshair: this.crosshair }),
      ...(this.ticks !== undefined && { ticks: this.ticks }),
      ...(this.brackets !== undefined && { brackets: this.brackets }),
      ...(this.dot !== undefined && { dot: this.dot }),
      ...(this.grid !== undefined && { grid: this.grid }),
      ...(this.readout !== undefined && { readout: this.readout }),
      ...(this.aberration !== undefined && { aberration: this.aberration }),
      ...(this.haze !== undefined && { haze: this.haze }),
      ...(this.ripples !== undefined && { ripples: this.ripples }),
      ...(this.rippleSpeed !== undefined && { rippleSpeed: this.rippleSpeed }),
      ...(this.rippleWidth !== undefined && { rippleWidth: this.rippleWidth }),
      ...(this.rippleBendWidth !== undefined && { rippleBendWidth: this.rippleBendWidth }),
      ...(this.rippleBend !== undefined && { rippleBend: this.rippleBend }),
      ...(this.rippleGlow !== undefined && { rippleGlow: this.rippleGlow }),
      ...(this.rippleLife !== undefined && { rippleLife: this.rippleLife }),
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

if (!customElements.get("canvas-ui-magnify")) {
  customElements.define("canvas-ui-magnify", CanvasUiMagnify);
}

export type { MagnifyInstance, MagnifyOptions };
