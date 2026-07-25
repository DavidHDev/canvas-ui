import { LitElement, html } from "lit";

import {
  createLaser,
  supportsHtmlInCanvas,
  type LaserInstance,
  type LaserOptions,
} from "./LaserVanilla";

export class CanvasUiLaser extends LitElement {
  static properties = {
    speed: { type: Number },
    offset: { type: Number },
    color: { type: Array },
    thickness: { type: Number },
    core: { type: Number },
    radius: { type: Number },
    glow: { type: Number },
    wave: { type: Number },
    width: { type: Number },
    flicker: { type: Number },
    reveal: { type: Number },
    heat: { type: Number },
    shimmer: { type: Number },
    sparkle: { type: Number },
    reactivity: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare speed?: number;
  declare offset?: number;
  declare color?: [number, number, number];
  declare thickness?: number;
  declare core?: number;
  declare radius?: number;
  declare glow?: number;
  declare wave?: number;
  declare width?: number;
  declare flicker?: number;
  declare reveal?: number;
  declare heat?: number;
  declare shimmer?: number;
  declare sparkle?: number;
  declare reactivity?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: LaserInstance | null = null;
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
    this._instance = createLaser(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): LaserOptions {
    return {
      ...(this.speed !== undefined && { speed: this.speed }),
      ...(this.offset !== undefined && { offset: this.offset }),
      ...(this.color !== undefined && { color: this.color }),
      ...(this.thickness !== undefined && { thickness: this.thickness }),
      ...(this.core !== undefined && { core: this.core }),
      ...(this.radius !== undefined && { radius: this.radius }),
      ...(this.glow !== undefined && { glow: this.glow }),
      ...(this.wave !== undefined && { wave: this.wave }),
      ...(this.width !== undefined && { width: this.width }),
      ...(this.flicker !== undefined && { flicker: this.flicker }),
      ...(this.reveal !== undefined && { reveal: this.reveal }),
      ...(this.heat !== undefined && { heat: this.heat }),
      ...(this.shimmer !== undefined && { shimmer: this.shimmer }),
      ...(this.sparkle !== undefined && { sparkle: this.sparkle }),
      ...(this.reactivity !== undefined && { reactivity: this.reactivity }),
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

if (!customElements.get("canvas-ui-laser")) {
  customElements.define("canvas-ui-laser", CanvasUiLaser);
}

export type { LaserInstance, LaserOptions };
