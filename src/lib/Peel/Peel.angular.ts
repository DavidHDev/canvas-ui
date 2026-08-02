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
  createPeel,
  supportsHtmlInCanvas,
  type PeelInstance,
  type PeelOptions,
} from "./PeelVanilla";

@Component({
  selector: "cui-peel",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  styles: ":host { display: block; position: relative; }",
  template: `
    @if (native()) {
      <div
        #under
        style="position: absolute; inset: 0; overflow: hidden; visibility: hidden;"
      >
        <ng-container [ngTemplateOutlet]="underContent" />
      </div>
    }
    <canvas
      #source
      layoutsubtree="true"
      [style]="
        native()
          ? 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;'
          : 'display: none;'
      "
    >
      @if (native()) {
        <div
          #content
          style="position: relative; width: 100%; height: 100%; overflow: hidden; pointer-events: auto;"
        >
          <ng-container [ngTemplateOutlet]="projected" />
        </div>
      }
    </canvas>
    @if (!native()) {
      <div
        #content
        style="position: relative; width: 100%; height: 100%; overflow: hidden;"
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
    <ng-template #underContent><ng-content select="[under]" /></ng-template>
  `,
})
export class PeelComponent implements OnDestroy {
  readonly options = input<PeelOptions>({});

  protected readonly native = signal(false);

  private readonly sourceEl =
    viewChild.required<ElementRef<HTMLCanvasElement>>("source");
  private readonly contentEl = viewChild<ElementRef<HTMLDivElement>>("content");
  private readonly outputEl =
    viewChild.required<ElementRef<HTMLCanvasElement>>("output");
  private readonly underEl = viewChild<ElementRef<HTMLDivElement>>("under");

  private readonly changeDetector = inject(ChangeDetectorRef);
  private instance: PeelInstance | null = null;

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
    this.instance = createPeel(
      { source, content, output, under: this.underEl()?.nativeElement },
      { ...this.options() },
    );
  }

  ngOnDestroy(): void {
    this.instance?.destroy();
    this.instance = null;
  }
}

export type { PeelInstance, PeelOptions };
