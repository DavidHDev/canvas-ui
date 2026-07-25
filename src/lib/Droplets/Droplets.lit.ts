import { LitElement, html } from "lit";

import {
  createDroplets,
  supportsHtmlInCanvas,
  type DropletsInstance,
  type DropletsOptions,
} from "./DropletsVanilla";

export class CanvasUiDroplets extends LitElement {
  static properties = {
    intensity: { type: Number },
    speed: { type: Number },
    scale: { type: Number },
    dropWidth: { type: Number },
    dropLength: { type: Number },
    refraction: { type: Number },
    blurAmount: { type: Number },
    vignette: { type: Number },
    fallSpeed: { type: Number },
    wiggle: { type: Number },
    staticDrops: { type: Number },
    interactive: { type: Boolean },
    interactionRadius: { type: Number },
    interactionStrength: { type: Number },
    interactionDistortion: { type: Number },
    tint: { type: Array },
    tintStrength: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare intensity?: number;
  declare speed?: number;
  declare scale?: number;
  declare dropWidth?: number;
  declare dropLength?: number;
  declare refraction?: number;
  declare blurAmount?: number;
  declare vignette?: number;
  declare fallSpeed?: number;
  declare wiggle?: number;
  declare staticDrops?: number;
  declare interactive?: boolean;
  declare interactionRadius?: number;
  declare interactionStrength?: number;
  declare interactionDistortion?: number;
  declare tint?: [number, number, number];
  declare tintStrength?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: DropletsInstance | null = null;
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
    this._instance = createDroplets(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): DropletsOptions {
    return {
      ...(this.intensity !== undefined && { intensity: this.intensity }),
      ...(this.speed !== undefined && { speed: this.speed }),
      ...(this.scale !== undefined && { scale: this.scale }),
      ...(this.dropWidth !== undefined && { dropWidth: this.dropWidth }),
      ...(this.dropLength !== undefined && { dropLength: this.dropLength }),
      ...(this.refraction !== undefined && { refraction: this.refraction }),
      ...(this.blurAmount !== undefined && { blur: this.blurAmount }),
      ...(this.vignette !== undefined && { vignette: this.vignette }),
      ...(this.fallSpeed !== undefined && { fallSpeed: this.fallSpeed }),
      ...(this.wiggle !== undefined && { wiggle: this.wiggle }),
      ...(this.staticDrops !== undefined && { staticDrops: this.staticDrops }),
      ...(this.interactive !== undefined && { interactive: this.interactive }),
      ...(this.interactionRadius !== undefined && { interactionRadius: this.interactionRadius }),
      ...(this.interactionStrength !== undefined && { interactionStrength: this.interactionStrength }),
      ...(this.interactionDistortion !== undefined && { interactionDistortion: this.interactionDistortion }),
      ...(this.tint !== undefined && { tint: this.tint }),
      ...(this.tintStrength !== undefined && { tintStrength: this.tintStrength }),
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

if (!customElements.get("canvas-ui-droplets")) {
  customElements.define("canvas-ui-droplets", CanvasUiDroplets);
}

export type { DropletsInstance, DropletsOptions };
