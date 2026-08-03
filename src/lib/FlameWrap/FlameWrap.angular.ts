import { NgTemplateOutlet } from "@angular/common";
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  type ElementRef,
  type OnDestroy,
} from "@angular/core";

import {
  createFlameWrap,
  supportsHtmlInCanvas,
  type FlameWrapInstance,
  type FlameWrapOptions,
} from "./FlameWrapVanilla";

@Component({
  selector: "cui-flame-wrap",
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
    <canvas #output aria-hidden="true" [style]="outputStyle()"></canvas>
    <ng-template #projected><ng-content /></ng-template>
  `,
})
export class FlameWrapComponent implements OnDestroy {
  readonly options = input<FlameWrapOptions>({});

  protected readonly native = signal(false);

  protected readonly outputStyle = computed(() => {
    const options = this.options();
    const reach = Math.round(Math.max(options.height ?? 170, 24) * 1.5) + 40;
    const glow = Math.round(Math.max(options.spread ?? 8, 8) * 3) + 16;
    return (
      `position: absolute; top: ${-reach}px; right: ${-glow}px; ` +
      `bottom: ${-glow}px; left: ${-glow}px; ` +
      `width: calc(100% + ${glow * 2}px); ` +
      `height: calc(100% + ${reach + glow}px); pointer-events: none;`
    );
  });

  private readonly sourceEl =
    viewChild.required<ElementRef<HTMLCanvasElement>>("source");
  private readonly contentEl = viewChild<ElementRef<HTMLDivElement>>("content");
  private readonly outputEl =
    viewChild.required<ElementRef<HTMLCanvasElement>>("output");

  private readonly changeDetector = inject(ChangeDetectorRef);
  private instance: FlameWrapInstance | null = null;

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
    this.instance = createFlameWrap(
      { source, content, output },
      { ...this.options() },
    );
  }

  ngOnDestroy(): void {
    this.instance?.destroy();
    this.instance = null;
  }
}

export type { FlameWrapInstance, FlameWrapOptions };
