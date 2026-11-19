import {
  CATEGORIES,
  CATEGORY_META,
  COMPONENTS,
  type ComponentCategory,
  type ComponentEntry,
} from "@/data/components";

export interface ComponentGroup {
  category: ComponentCategory;
  label: string;
  description: string;
  items: ComponentEntry[];
}

export const COMPONENT_GROUPS: ComponentGroup[] = CATEGORIES.map(
  (category) => ({
    category,
    ...CATEGORY_META[category],
    items: COMPONENTS.filter((entry) => entry.category === category),
  }),
);

export const ORDERED_COMPONENTS: ComponentEntry[] = COMPONENT_GROUPS.flatMap(
  (group) => group.items,
);

const BY_HREF = new Map(COMPONENTS.map((entry) => [entry.href, entry]));

export const getComponent = (href: string) => BY_HREF.get(href);

export const categoryHref = (category: ComponentCategory) =>
  `/components#${category}`;
