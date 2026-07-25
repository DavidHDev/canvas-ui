import { LitElement, html } from "lit";

import {
  createFrost,
  supportsHtmlInCanvas,
  type FrostInstance,
  type FrostOptions,
} from "./FrostVanilla";

export class CanvasUiFrost extends LitElement {
  static properties = {
    frost: { type: Number },
    strength: { type: Number },
    contrast: { type: Number },
    crispness: { type: Number },
    highlight: { type: Number },
    highlightStrength: { type: Number },
    haze: { type: Number },
    tintThin: { type: Array },
    tintThick: { type: Array },
    tintStrength: { type: Number },
    saturation: { type: Number },
    brightness: { type: Number },
    refraction: { type: Number },
    ior: { type: Number },
    detail: { type: Number },
    textureScale: { type: Number },
    fresnel: { type: Number },
    meltRadius: { type: Number },
    meltNoise: { type: Number },
    meltStrength: { type: Number },
    refreeze: { type: Number },
    edgeFade: { type: Number },
    meltEdges: { type: Boolean },
    introDuration: { type: Number },
    opacity: { type: Number },
    shimmer: { type: Number },
    quality: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare frost?: number;
  declare strength?: number;
  declare contrast?: number;
  declare crispness?: number;
  declare highlight?: number;
  declare highlightStrength?: number;
  declare haze?: number;
  declare tintThin?: [number, number, number];
  declare tintThick?: [number, number, number];
  declare tintStrength?: number;
  declare saturation?: number;
  declare brightness?: number;
  declare refraction?: number;
  declare ior?: number;
  declare detail?: number;
  declare textureScale?: number;
  declare fresnel?: number;
  declare meltRadius?: number;
  declare meltNoise?: number;
  declare meltStrength?: number;
  declare refreeze?: number;
  declare edgeFade?: number;
  declare meltEdges?: boolean;
  declare introDuration?: number;
  declare opacity?: number;
  declare shimmer?: number;
  declare quality?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: FrostInstance | null = null;
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
    this._instance = createFrost(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): FrostOptions {
    return {
      ...(this.frost !== undefined && { frost: this.frost }),
      ...(this.strength !== undefined && { strength: this.strength }),
      ...(this.contrast !== undefined && { contrast: this.contrast }),
      ...(this.crispness !== undefined && { crispness: this.crispness }),
      ...(this.highlight !== undefined && { highlight: this.highlight }),
      ...(this.highlightStrength !== undefined && { highlightStrength: this.highlightStrength }),
      ...(this.haze !== undefined && { haze: this.haze }),
      ...(this.tintThin !== undefined && { tintThin: this.tintThin }),
      ...(this.tintThick !== undefined && { tintThick: this.tintThick }),
      ...(this.tintStrength !== undefined && { tintStrength: this.tintStrength }),
      ...(this.saturation !== undefined && { saturation: this.saturation }),
      ...(this.brightness !== undefined && { brightness: this.brightness }),
      ...(this.refraction !== undefined && { refraction: this.refraction }),
      ...(this.ior !== undefined && { ior: this.ior }),
      ...(this.detail !== undefined && { detail: this.detail }),
      ...(this.textureScale !== undefined && { textureScale: this.textureScale }),
      ...(this.fresnel !== undefined && { fresnel: this.fresnel }),
      ...(this.meltRadius !== undefined && { meltRadius: this.meltRadius }),
      ...(this.meltNoise !== undefined && { meltNoise: this.meltNoise }),
      ...(this.meltStrength !== undefined && { meltStrength: this.meltStrength }),
      ...(this.refreeze !== undefined && { refreeze: this.refreeze }),
      ...(this.edgeFade !== undefined && { edgeFade: this.edgeFade }),
      ...(this.meltEdges !== undefined && { meltEdges: this.meltEdges }),
      ...(this.introDuration !== undefined && { introDuration: this.introDuration }),
      ...(this.opacity !== undefined && { opacity: this.opacity }),
      ...(this.shimmer !== undefined && { shimmer: this.shimmer }),
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

if (!customElements.get("canvas-ui-frost")) {
  customElements.define("canvas-ui-frost", CanvasUiFrost);
}

export type { FrostInstance, FrostOptions };
