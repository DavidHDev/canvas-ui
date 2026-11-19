"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  COMPONENT_GROUPS,
  ORDERED_COMPONENTS,
  type ComponentGroup,
} from "@/components/common/component-groups";
import { PreviewVideo } from "@/components/common/preview-video";
import { NewDot } from "@/components/docs/docs-sidebar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CATEGORIES, type ComponentCategory } from "@/data/components";

type Filter = "all" | ComponentCategory;

const FILTERS = [
  { id: "all" as Filter, label: "All", count: ORDERED_COMPONENTS.length },
  ...COMPONENT_GROUPS.map((group) => ({
    id: group.category as Filter,
    label: group.label,
    count: group.items.length,
  })),
];

const isCategory = (value: string): value is ComponentCategory =>
  (CATEGORIES as readonly string[]).includes(value);

const HASH_EVENT = "canvasui:catalogue-hash";

function readHash(): Filter {
  const hash = window.location.hash.slice(1);
  return isCategory(hash) ? hash : "all";
}

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener(HASH_EVENT, callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener(HASH_EVENT, callback);
  };
}

export function ComponentCatalogue() {
  const filter = useSyncExternalStore<Filter>(
    subscribeHash,
    readHash,
    () => "all",
  );

  const select = (next: Filter) => {
    const url = next === "all" ? window.location.pathname : `#${next}`;
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event(HASH_EVENT));
  };

  const groups =
    filter === "all"
      ? COMPONENT_GROUPS
      : COMPONENT_GROUPS.filter((group) => group.category === filter);

  return (
    <>
      <SegmentedControl
        label="Filter by category"
        options={FILTERS}
        value={filter}
        onValueChange={select}
        className="mt-8"
      />

      <div key={filter} className="catalogue-enter">
        {groups.map((group) => (
          <CatalogueGroup key={group.category} group={group} />
        ))}
      </div>
    </>
  );
}

function CatalogueGroup({ group }: { group: ComponentGroup }) {
  return (
    <section aria-labelledby={`${group.category}-heading`} className="mt-12">

      <h2
        id={`${group.category}-heading`}
        className="text-xl font-medium tracking-tight"
      >
        {group.label}
      </h2>
      <p className="mt-1.5 max-w-xl text-sm leading-6 text-pretty text-muted-foreground">
        {group.description}
      </p>

      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {group.items.map((component) => (
          <li key={component.href}>
            <Link
              href={component.href}
              className="group frame flex h-full flex-col transition-[background-color] duration-150 ease-out hover:bg-muted/70"
            >
              <div className="frame-inset relative flex aspect-4/3 shrink-0 items-center justify-center overflow-hidden bg-background">
                <PreviewVideo
                  src={component.video}
                  className="absolute inset-0 size-full object-cover"
                />
              </div>
              <div className="p-3.5">
                <h3 className="flex items-center gap-1.5 text-[15px] font-medium tracking-tight">
                  {component.name}
                  {component.isNew ? <NewDot /> : null}
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {component.description}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
