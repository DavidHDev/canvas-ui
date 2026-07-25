import { LitElement, html, type PropertyValues } from "lit";

import {
  createBend,
  supportsHtmlInCanvas,
  type BendInstance,
  type BendOptions,
} from "./BendVanilla";

export class CanvasUiBend extends LitElement {
  static properties = {
    perspective: { type: Number },
    radius: { type: Number },
    _native: { state: true },
    _failed: { state: true },
  };

  createRenderRoot() { return this; }

  declare perspective?: number;
  declare radius?: number;
  declare _native: boolean;
  declare _failed: boolean;
  _instance: BendInstance | null = null;
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
    this._instance = createBend(
      { source, content, output },
      this._getOptions(),
    );
    if (this._native && !this._instance) this._failed = true;
  }

  updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('perspective') || changedProperties.has('radius')) {
      this._instance?.setOptions(this._getOptions());
    }
  }

  private _getOptions(): BendOptions {
    return {
      ...(this.perspective !== undefined && { perspective: this.perspective }),
      ...(this.radius !== undefined && { radius: this.radius }),
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

if (!customElements.get("canvas-ui-bend")) {
  customElements.define("canvas-ui-bend", CanvasUiBend);
}

export type { BendInstance, BendOptions };
