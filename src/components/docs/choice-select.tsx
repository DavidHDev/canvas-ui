"use client";

import { play } from "cuelume";
import { useState } from "react";

import { effectPortalContainer } from "@/components/common/effect-portal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface ChoiceOption<T extends string = string> {
  id: T;
  label: string;
}

export function ChoiceSelect<T extends string>({
  label,
  options,
  value,
  onValueChange,
  align,
  className,
}: {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  align?: "start" | "end";
  className?: string;
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const container = effectPortalContainer(trigger);

  return (
    <Select<T>
      value={value}
      onValueChange={(next) => {
        if (next === null) return;
        onValueChange(next);
        play("bloom");
      }}
    >
      <SelectTrigger
        ref={setTrigger}
        aria-label={label}
        className={cn("min-w-0", className)}
      >
        <SelectValue className="truncate">
          {(current: T | null) =>
            options.find((option) => option.id === current)?.label ?? label
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent align={align} container={container}>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
