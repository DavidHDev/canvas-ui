import { COMPONENTS, type ComponentEntry } from "@/data/components";

export const ORDERED_COMPONENTS: ComponentEntry[] = COMPONENTS;

const BY_HREF = new Map(COMPONENTS.map((entry) => [entry.href, entry]));

export const getComponent = (href: string) => BY_HREF.get(href);
