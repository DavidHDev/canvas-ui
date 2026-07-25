import { LitElement, html, type PropertyValues } from "lit";

import {
  createGlassObject,
  type GlassObjectInstance,
  type GlassObjectOptions,
} from "./GlassObjectVanilla";

export class CanvasUiGlassObject extends LitElement {
  static properties = {
    src: { type: String },
    ior: { type: Number },
    thickness: { type: Number },
    background: { type: String },
    orbit: { type: Boolean },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare src?: string;
  declare ior?: number;
  declare thickness?: number;
  declare background?: string;
  declare orbit?: boolean;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: GlassObjectInstance | null = null;
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
    this._instance = createGlassObject({ canvas }, this._getOptions());
  }

  updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('src') || changedProperties.has('ior') ||
        changedProperties.has('thickness') || changedProperties.has('background') ||
        changedProperties.has('orbit')) {
      this._instance?.setOptions(this._getOptions());
    }
  }

  private _getOptions(): GlassObjectOptions {
    return {
      ...(this.src !== undefined && { src: this.src }),
      ...(this.ior !== undefined && { ior: this.ior }),
      ...(this.thickness !== undefined && { thickness: this.thickness }),
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

if (!customElements.get("canvas-ui-glass-object")) {
  customElements.define("canvas-ui-glass-object", CanvasUiGlassObject);
}

export type { GlassObjectInstance, GlassObjectOptions };
