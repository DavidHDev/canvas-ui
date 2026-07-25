import { LitElement, html, type PropertyValues } from "lit";

import {
  createDitheredObject,
  type DitheredObjectInstance,
  type DitheredObjectOptions,
} from "./DitheredObjectVanilla";

export class CanvasUiDitheredObject extends LitElement {
  static properties = {
    src: { type: String },
    gridSize: { type: Number },
    background: { type: String },
    orbit: { type: Boolean },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare src?: string;
  declare gridSize?: number;
  declare background?: string;
  declare orbit?: boolean;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: DitheredObjectInstance | null = null;
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
    this._instance = createDitheredObject({ canvas }, this._getOptions());
  }

  updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('src') || changedProperties.has('gridSize') ||
        changedProperties.has('background') || changedProperties.has('orbit')) {
      this._instance?.setOptions(this._getOptions());
    }
  }

  private _getOptions(): DitheredObjectOptions {
    return {
      ...(this.src !== undefined && { src: this.src }),
      ...(this.gridSize !== undefined && { gridSize: this.gridSize }),
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

if (!customElements.get("canvas-ui-dithered-object")) {
  customElements.define("canvas-ui-dithered-object", CanvasUiDitheredObject);
}

export type { DitheredObjectInstance, DitheredObjectOptions };
