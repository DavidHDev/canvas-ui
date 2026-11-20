"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "@/components/icons";

import { cn } from "@/lib/utils";

function Select<Value>(props: SelectPrimitive.Root.Props<Value>) {
  return <SelectPrimitive.Root {...props} />;
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "inline-flex h-8 cursor-pointer items-center justify-between gap-1.5 rounded-control border border-transparent px-2.5 text-[13px] whitespace-nowrap text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out select-none hover:bg-[var(--surface-hover)] hover:text-foreground active:scale-[0.97] data-popup-open:bg-[var(--surface-hover)] data-popup-open:text-foreground motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="shrink-0 transition-transform duration-200 ease-out data-popup-open:rotate-180 motion-reduce:transition-none">
        <ChevronDown aria-hidden className="size-3.5" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

const SelectValue = SelectPrimitive.Value;

function SelectContent({
  className,
  children,
  align = "start",
  container,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "align"> &
  Pick<SelectPrimitive.Portal.Props, "container">) {
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Positioner
        className="z-40 outline-none"
        sideOffset={8}
        alignItemWithTrigger={false}
        align={align}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "surface-popover max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto outline-none transition-[opacity,transform] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-100 data-starting-style:scale-[0.97] data-starting-style:opacity-0 motion-reduce:transition-[opacity] motion-reduce:data-ending-style:scale-100 motion-reduce:data-starting-style:scale-100",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-control py-1.5 pr-2 pl-2.5 text-[13px] text-muted-foreground outline-none select-none data-highlighted:bg-[var(--surface-hover)] data-highlighted:text-foreground data-selected:font-medium data-selected:text-foreground",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ml-auto flex shrink-0 items-center">
        <Check aria-hidden className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
