import { LitElement, html } from "lit";

import {
  createBubble,
  supportsHtmlInCanvas,
  type BubbleInstance,
  type BubbleOptions,
} from "./BubbleVanilla";

export class CanvasUiBubble extends LitElement {
  static properties = {
    size: { type: Number },
    trail: { type: Number },
    follow: { type: Number },
    blend: { type: Number },
    speed: { type: Number },
    refraction: { type: Number },
    dispersion: { type: Number },
    frost: { type: Number },
    shine: { type: Number },
    rim: { type: Number },
    iridescence: { type: Number },
    intensity: { type: Number },
    tint: { type: Array },
    tintStrength: { type: Number },
    colorA: { type: Array },
    colorB: { type: Array },
    fallbackOpacity: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare size?: number;
  declare trail?: number;
  declare follow?: number;
  declare blend?: number;
  declare speed?: number;
  declare refraction?: number;
  declare dispersion?: number;
  declare frost?: number;
  declare shine?: number;
  declare rim?: number;
  declare iridescence?: number;
  declare intensity?: number;
  declare tint?: [number, number, number];
  declare tintStrength?: number;
  declare colorA?: [number, number, number];
  declare colorB?: [number, number, number];
  declare fallbackOpacity?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: BubbleInstance | null = null;
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
    this._instance = createBubble(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): BubbleOptions {
    return {
      ...(this.size !== undefined && { size: this.size }),
      ...(this.trail !== undefined && { trail: this.trail }),
      ...(this.follow !== undefined && { follow: this.follow }),
      ...(this.blend !== undefined && { blend: this.blend }),
      ...(this.speed !== undefined && { speed: this.speed }),
      ...(this.refraction !== undefined && { refraction: this.refraction }),
      ...(this.dispersion !== undefined && { dispersion: this.dispersion }),
      ...(this.frost !== undefined && { frost: this.frost }),
      ...(this.shine !== undefined && { shine: this.shine }),
      ...(this.rim !== undefined && { rim: this.rim }),
      ...(this.iridescence !== undefined && { iridescence: this.iridescence }),
      ...(this.intensity !== undefined && { intensity: this.intensity }),
      ...(this.tint !== undefined && { tint: this.tint }),
      ...(this.tintStrength !== undefined && { tintStrength: this.tintStrength }),
      ...(this.colorA !== undefined && { colorA: this.colorA }),
      ...(this.colorB !== undefined && { colorB: this.colorB }),
      ...(this.fallbackOpacity !== undefined && { fallbackOpacity: this.fallbackOpacity }),
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

if (!customElements.get("canvas-ui-bubble")) {
  customElements.define("canvas-ui-bubble", CanvasUiBubble);
}

export type { BubbleInstance, BubbleOptions };
