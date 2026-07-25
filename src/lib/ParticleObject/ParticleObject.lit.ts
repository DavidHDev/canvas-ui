import { LitElement, html, type PropertyValues } from "lit";

import {
  createParticleObject,
  type ParticleObjectInstance,
  type ParticleObjectOptions,
} from "./ParticleObjectVanilla";

export class CanvasUiParticleObject extends LitElement {
  static properties = {
    src: { type: String },
    count: { type: Number },
    size: { type: Number },
    color: { type: String },
    background: { type: String },
    orbit: { type: Boolean },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare src?: string;
  declare count?: number;
  declare size?: number;
  declare color?: string;
  declare background?: string;
  declare orbit?: boolean;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: ParticleObjectInstance | null = null;
  _savedChildren: ChildNode[] | null = null;

  constructor() {
    super();
    this._native = false;
    this._failed = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._savedChildren = [...this.childNodes];
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._instance?.destroy();
    this._instance = null;
  }

  async firstUpdated(): Promise<void> {
    const canvas = this.querySelector<HTMLCanvasElement>("canvas");
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (!canvas) return;
    this._instance = createParticleObject({ canvas }, this._getOptions());
  }

  updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('src') || changedProperties.has('count') ||
        changedProperties.has('size') || changedProperties.has('color') ||
        changedProperties.has('background') || changedProperties.has('orbit')) {
      this._instance?.setOptions(this._getOptions());
    }
  }

  private _getOptions(): ParticleObjectOptions {
    return {
      ...(this.src !== undefined && { src: this.src }),
      ...(this.count !== undefined && { count: this.count }),
      ...(this.size !== undefined && { size: this.size }),
      ...(this.color !== undefined && { color: this.color }),
      ...(this.background !== undefined && { background: this.background }),
      ...(this.orbit !== undefined && { orbit: this.orbit }),
    };
  }

  render() {
    return html`
      <div style="position: relative; height: 100%">
        <canvas
          style="position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none"
        ></canvas>
      </div>
    `;
  }
}

if (!customElements.get("canvas-ui-particle-object")) {
  customElements.define("canvas-ui-particle-object", CanvasUiParticleObject);
}

export type { ParticleObjectInstance, ParticleObjectOptions };
