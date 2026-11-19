"use client";

import { useState } from "react";

import { DemoControls } from "@/components/demos/demo-controls";
import {
  EntryPage,
  HERO_BLEED_SCALE,
  HERO_MODEL,
  ObjectHero,
  omit,
  type EntryStatus,
} from "@/components/playground/entries/shared";
import { MockSite } from "@/components/playground/mock-site";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { LiquidObject } from "@/components/docs/live/LiquidObject";
import {
  LIQUID_OBJECT_CONTROLS,
  LIQUID_OBJECT_PRESETS,
} from "@/demos/liquid-object-demo";

const CONTROLS = omit(LIQUID_OBJECT_CONTROLS, ["zoom", "orbit"] as const);

export function LiquidObjectEntry() {
  const controls = useDemoControls(CONTROLS);
  const [status, setStatus] = useState<EntryStatus>("loading");
  const values = omit(controls.values, ["src", "background"]);
  const props = { src: HERO_MODEL, ...values };

  return (
    <>
      <EntryPage>
        <MockSite
          heroBleed
          heroMedia={
            <ObjectHero status={status} background={controls.values.background}>
              <LiquidObject
                {...props}
                scale={values.scale * HERO_BLEED_SCALE}
                cursorSize={values.cursorSize * HERO_BLEED_SCALE}
                orbit={false}
                zoom={false}
                background=""
                onLoad={() => setStatus("ready")}
                onError={() => setStatus("error")}
                className="h-full w-full"
              />
            </ObjectHero>
          }
        />
      </EntryPage>

      <DemoControls
        title="Liquid Object controls"
        controls={controls}
        presets={LIQUID_OBJECT_PRESETS}
        snippet={{ component: "LiquidObject", props }}
      />
    </>
  );
}
