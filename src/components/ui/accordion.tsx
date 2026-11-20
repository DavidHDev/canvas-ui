"use client";

import type { ComponentProps } from "react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDown } from "@/components/icons";

import { cn } from "@/lib/utils";

function Accordion(props: ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={className}
      {...props}
    />
  );
}

function AccordionHeader({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Header>) {
  return (
    <AccordionPrimitive.Header
      data-slot="accordion-header"
      className={cn("flex", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Trigger
      data-slot="accordion-trigger"
      className={cn(
        "group inline-flex cursor-pointer items-center gap-1 rounded-sm transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-250 ease-out group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
      />
    </AccordionPrimitive.Trigger>
  );
}

function AccordionPanel({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof AccordionPrimitive.Panel>, "className"> & {
  className?: string;
}) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-panel"
      className="h-[var(--accordion-panel-height)] overflow-hidden transition-[height] duration-250 ease-out data-[ending-style]:h-0 data-[ending-style]:duration-200 data-[starting-style]:h-0 motion-reduce:transition-none"
      {...props}
    >
      <div
        className={cn(
          "transition-opacity duration-200 ease-out in-data-[ending-style]:opacity-0 in-data-[starting-style]:opacity-0 motion-reduce:transition-none",
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
}

export {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
  AccordionPanel,
};
