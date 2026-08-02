import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  viewChild,
  type ElementRef,
  type OnDestroy,
} from "@angular/core";

import {
  createAsciiObject,
  type AsciiObjectInstance,
  type AsciiObjectOptions,
} from "./AsciiObjectVanilla";

@Component({
  selector: "cui-ascii-object",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ":host { display: block; position: relative; }",
  template: `
    <canvas
      #canvas
      style="position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none;"
    ></canvas>
  `,
})
export class AsciiObjectComponent implements OnDestroy {
  readonly options = input<AsciiObjectOptions>({});

  private readonly canvasEl =
    viewChild.required<ElementRef<HTMLCanvasElement>>("canvas");

  private instance: AsciiObjectInstance | null = null;

  constructor() {
    afterNextRender(() => {
      this.instance = createAsciiObject(
        { canvas: this.canvasEl().nativeElement },
        { ...this.options() },
      );
    });
    effect(() => {
      const next = { ...this.options() };
      this.instance?.setOptions(next);
    });
  }

  ngOnDestroy(): void {
    this.instance?.destroy();
    this.instance = null;
  }
}

export type { AsciiObjectInstance, AsciiObjectOptions };
