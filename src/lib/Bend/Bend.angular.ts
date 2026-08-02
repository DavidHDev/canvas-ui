import { NgTemplateOutlet } from "@angular/common";
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  input,
  signal,
  viewChild,
  type ElementRef,
  type OnDestroy,
} from "@angular/core";

import {
  createBend,
  supportsHtmlInCanvas,
  type BendInstance,
  type BendOptions,
} from "./BendVanilla";

@Component({
  selector: "cui-bend",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  styles: ":host { display: block; position: relative; }",
  template: `
    <canvas
      #source
      layoutsubtree="true"
      [style]="
        native()
          ? 'position: absolute; inset: 0; width: 100%; height: 100%;'
          : 'display: none;'
      "
    >
      @if (native()) {
        <div
          #content
          style="position: relative; width: 100%; height: 100%; overflow: auto;"
        >
          <ng-container [ngTemplateOutlet]="projected" />
        </div>
      }
    </canvas>
    @if (!native()) {
      <div
        #content
        style="position: relative; width: 100%; height: 100%; overflow: auto;"
      >
        <ng-container [ngTemplateOutlet]="projected" />
      </div>
    }
    <canvas
      #output
      aria-hidden="true"
      style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;"
    ></canvas>
    <ng-template #projected><ng-content /></ng-template>
  `,
})
export class BendComponent implements OnDestroy {
  readonly options = input<BendOptions>({});

  protected readonly native = signal(false);

  private readonly sourceEl =
    viewChild.required<ElementRef<HTMLCanvasElement>>("source");
  private readonly contentEl = viewChild<ElementRef<HTMLDivElement>>("content");
  private readonly outputEl =
    viewChild.required<ElementRef<HTMLCanvasElement>>("output");

  private readonly changeDetector = inject(ChangeDetectorRef);
  private instance: BendInstance | null = null;

  constructor() {
    afterNextRender(() => {
      this.native.set(supportsHtmlInCanvas());
      this.changeDetector.detectChanges();
      this.create();
      if (this.native() && !this.instance) {
        this.native.set(false);
        this.changeDetector.detectChanges();
        this.create();
      }
    });
    effect(() => {
      const next = { ...this.options() };
      this.instance?.setOptions(next);
    });
  }

  private create(): void {
    const source = this.sourceEl().nativeElement;
    const content = this.contentEl()?.nativeElement;
    const output = this.outputEl().nativeElement;
    if (!source || !content || !output) return;
    this.instance = createBend(
      { source, content, output },
      { ...this.options() },
    );
  }

  ngOnDestroy(): void {
    this.instance?.destroy();
    this.instance = null;
  }
}

export type { BendInstance, BendOptions };
