"use client";

import { useState } from "react";

import { DemoControls } from "@/components/demos/demo-controls";
import {
  EntryPage,
  HERO_BLEED_SCALE,
  ObjectHero,
  omit,
  type EntryStatus,
} from "@/components/playground/entries/shared";
import { MockSite } from "@/components/playground/mock-site";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { TopographicObject } from "@/components/docs/live/TopographicObject";
import {
  TOPOGRAPHIC_OBJECT_CONTROLS,
  TOPOGRAPHIC_OBJECT_PRESETS,
} from "@/demos/topographic-object-demo";

const MARK = "/assets/bolt-mark.svg";

const CONTROLS = omit(TOPOGRAPHIC_OBJECT_CONTROLS, ["zoom"] as const);

export function TopographicObjectEntry() {
  const controls = useDemoControls(CONTROLS);
  const [status, setStatus] = useState<EntryStatus>("loading");
  const { background } = controls.values;
  const values = omit(controls.values, ["src", "background"]);
  const props = { src: MARK, ...values };

  return (
    <>
      <EntryPage>
        <MockSite
          heroBleed
          heroMedia={
            <ObjectHero status={status} background={background}>
              <TopographicObject
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
        title="Topographic Object controls"
        controls={controls}
        presets={TOPOGRAPHIC_OBJECT_PRESETS}
        snippet={{
          component: "TopographicObject",
          props: background ? { ...props, background } : props,
        }}
      />
    </>
  );
}
