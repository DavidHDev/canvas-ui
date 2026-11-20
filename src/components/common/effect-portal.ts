const EFFECT_CONTENT = "canvas[layoutsubtree] > div";

export function effectPortalContainer(
  trigger: Element | null,
): HTMLElement | undefined {
  return trigger?.closest<HTMLElement>(EFFECT_CONTENT) ?? undefined;
}
