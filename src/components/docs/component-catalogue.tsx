import Link from "next/link";

import { ORDERED_COMPONENTS } from "@/components/common/component-groups";
import { PreviewVideo } from "@/components/common/preview-video";
import { NewDot } from "@/components/docs/docs-sidebar";

export function ComponentCatalogue() {
  return (
    <ul className="catalogue-enter mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ORDERED_COMPONENTS.map((component) => (
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
  );
}
