import { LitElement, html } from "lit";

import {
  createParticleScroll,
  supportsHtmlInCanvas,
  type ParticleScrollInstance,
  type ParticleScrollOptions,
} from "./ParticleScrollVanilla";

export class CanvasUiParticleScroll extends LitElement {
  static properties = {
    point: { type: Number },
    band: { type: Number },
    density: { type: Number },
    size: { type: Number },
    spread: { type: Number },
    gravity: { type: Number },
    drift: { type: Number },
    swirl: { type: Number },
    stagger: { type: Number },
    fade: { type: Number },
    settle: { type: Number },
    smoothing: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare point?: number;
  declare band?: number;
  declare density?: number;
  declare size?: number;
  declare spread?: number;
  declare gravity?: number;
  declare drift?: number;
  declare swirl?: number;
  declare stagger?: number;
  declare fade?: number;
  declare settle?: number;
  declare smoothing?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: ParticleScrollInstance | null = null;
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
    this._instance = createParticleScroll(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.size === 0) return;
    this._instance?.setOptions(this._getOptions());
  }

  private _getOptions(): ParticleScrollOptions {
    return {
      ...(this.point !== undefined && { point: this.point }),
      ...(this.band !== undefined && { band: this.band }),
      ...(this.density !== undefined && { density: this.density }),
      ...(this.size !== undefined && { size: this.size }),
      ...(this.spread !== undefined && { spread: this.spread }),
      ...(this.gravity !== undefined && { gravity: this.gravity }),
      ...(this.drift !== undefined && { drift: this.drift }),
      ...(this.swirl !== undefined && { swirl: this.swirl }),
      ...(this.stagger !== undefined && { stagger: this.stagger }),
      ...(this.fade !== undefined && { fade: this.fade }),
      ...(this.settle !== undefined && { settle: this.settle }),
      ...(this.smoothing !== undefined && { smoothing: this.smoothing }),
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

if (!customElements.get("canvas-ui-particle-scroll")) {
  customElements.define("canvas-ui-particle-scroll", CanvasUiParticleScroll);
}

export type { ParticleScrollInstance, ParticleScrollOptions };
