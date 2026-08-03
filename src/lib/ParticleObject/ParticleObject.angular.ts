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
  createParticleObject,
  type ParticleObjectInstance,
  type ParticleObjectOptions,
} from "./ParticleObjectVanilla";

@Component({
  selector: "cui-particle-object",
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
export class ParticleObjectComponent implements OnDestroy {
  readonly options = input<ParticleObjectOptions>({});

  private readonly canvasEl =
    viewChild.required<ElementRef<HTMLCanvasElement>>("canvas");

  private instance: ParticleObjectInstance | null = null;

  constructor() {
    afterNextRender(() => {
      this.instance = createParticleObject(
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

export type { ParticleObjectInstance, ParticleObjectOptions };
