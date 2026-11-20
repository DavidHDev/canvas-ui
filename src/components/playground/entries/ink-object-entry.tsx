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
import { InkObject } from "@/components/docs/live/InkObject";
import {
  INK_OBJECT_CONTROLS,
  INK_OBJECT_PRESETS,
} from "@/demos/ink-object-demo";

const CONTROLS = omit(INK_OBJECT_CONTROLS, ["zoom"] as const);

export function InkObjectEntry() {
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
              <InkObject
                {...props}
                scale={values.scale * HERO_BLEED_SCALE}
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
        title="Ink Object controls"
        controls={controls}
        presets={INK_OBJECT_PRESETS}
        snippet={{ component: "InkObject", props }}
      />
    </>
  );
}
