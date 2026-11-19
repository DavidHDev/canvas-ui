type HtmlInCanvasContext = CanvasRenderingContext2D & {
  drawElementImage: (element: Element, x: number, y: number) => DOMMatrix | void;
};

type HtmlInCanvasElement = HTMLCanvasElement & {
  updateElementGeometry?: (
    element: Element,
    options: { canvasTransform: DOMMatrix },
  ) => void;
};

export function isHtmlInCanvasBlocked(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = (navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData?.platform;
  return platform === "Android" || /Android/i.test(navigator.userAgent);
}

export function prepareHtmlInCanvas(source: HTMLCanvasElement, content: HTMLElement) {
  if ("content" in source) {
    source.setAttribute("content", "drawable");
    content.setAttribute("drawable", "");
  } else {
    source.setAttribute("layoutsubtree", "");
  }
}

const captureBackdrops = new WeakMap<
  HTMLCanvasElement,
  { at: number; layers: string[] }
>();

function captureBackdrop(source: HTMLCanvasElement): string[] {
  const now = performance.now();
  const cached = captureBackdrops.get(source);
  if (cached && now - cached.at < 500) return cached.layers;
  const layers: string[] = [];
  for (let node: Element | null = source; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    let alpha = 1;
    if (!color || color === "transparent") {
      alpha = 0;
    } else {
      const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color);
      const rgba = /^rgba\(([^)]+)\)$/.exec(color);
      if (slash) alpha = Number(slash[1]) / (slash[2] ? 100 : 1);
      else if (rgba) alpha = Number(rgba[1].split(",")[3] ?? 1);
    }
    if (!(alpha > 0)) continue;
    layers.unshift(color);
    if (alpha >= 1) break;
  }
  captureBackdrops.set(source, { at: now, layers });
  return layers;
}

export function drawHtmlInCanvas(
  source: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  content: HTMLElement,
  fillBackdrop = false,
) {
  if (fillBackdrop) {
    for (const color of captureBackdrop(source)) {
      context.fillStyle = color;
      context.fillRect(0, 0, source.width, source.height);
    }
  }
  const transform = (context as HtmlInCanvasContext).drawElementImage(content, 0, 0);
  const canvas = source as HtmlInCanvasElement;
  if (transform && typeof canvas.updateElementGeometry === "function") {
    canvas.updateElementGeometry(content, { canvasTransform: transform });
  }
}
