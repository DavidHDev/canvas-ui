"use client";

import { useState } from "react";
import { MousePointer2 } from "@/components/icons";

import { hexToRgb, withDefaults } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { EntryPage } from "@/components/playground/entries/shared";
import { MockDashboard, MockSite } from "@/components/playground/mock-site";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Peel } from "@/components/docs/live/Peel";
import { PEEL_CONTROLS, PEEL_PRESETS } from "@/demos/peel-demo";

const CONTROLS = withDefaults(PEEL_CONTROLS, { mode: "hover" });

function Layer({
  badge,
  variant,
}: {
  badge: string;
  variant: "modern" | "legacy";
}) {
  return (
    <div className="relative h-full w-full">
      <MockDashboard variant={variant} />
      <span
        className={`absolute right-4 bottom-4 rounded-full px-3 py-1.5 text-[12px] font-medium ${
          variant === "modern"
            ? "bg-foreground text-background"
            : "bg-[#3a382f] font-mono text-[#ece9e2]"
        }`}
      >
        {badge}
      </span>
    </div>
  );
}

export function PeelEntry() {
  const controls = useDemoControls(CONTROLS);
  const [peeked, setPeeked] = useState(false);
  const { shineColor, ...values } = controls.values;
  const props = {
    ...values,
    shineColor: shineColor === "auto" ? ("auto" as const) : hexToRgb(shineColor),
  };

  return (
    <>
      <EntryPage>
        <MockSite
          heroMedia={
            <div
              className="absolute inset-0 touch-none"
              onPointerEnter={() => setPeeked(true)}
            >
              <Peel
                {...props}
                className="inset-0"
                style={{ position: "absolute" }}
                under={<Layer badge="bolt in 2019" variant="legacy" />}
              >
                <Layer badge="bolt today" variant="modern" />
              </Peel>
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-x-0 bottom-4 flex justify-center transition-opacity duration-300 ease-out ${
                  peeked ? "opacity-0" : "opacity-100"
                }`}
              >
                <span className="surface-floating flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium text-foreground">
                  <MousePointer2 aria-hidden className="size-3.5" />
                  {values.mode === "hover"
                    ? `Hover the ${values.side} edge to peel back the redesign`
                    : `Move toward the ${values.side} edge to peel back the redesign`}
                </span>
              </div>
            </div>
          }
        />
      </EntryPage>

      <DemoControls
        title="Peel controls"
        controls={controls}
        presets={PEEL_PRESETS}
        onReset={() => setPeeked(false)}
        snippet={{ component: "Peel", props }}
      />
    </>
  );
}
