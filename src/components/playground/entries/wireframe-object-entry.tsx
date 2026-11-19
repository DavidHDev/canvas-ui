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
import { WireframeObject } from "@/components/docs/live/WireframeObject";
import {
  WIREFRAME_OBJECT_CONTROLS,
  WIREFRAME_OBJECT_PRESETS,
} from "@/demos/wireframe-object-demo";

const CONTROLS = omit(WIREFRAME_OBJECT_CONTROLS, ["zoom"] as const);

export function WireframeObjectEntry() {
  const controls = useDemoControls(CONTROLS);
  const [status, setStatus] = useState<EntryStatus>("loading");
  const { background } = controls.values;
  const values = omit(controls.values, ["src", "background"]);
  const props = { src: HERO_MODEL, ...values };

  return (
    <>
      <EntryPage>
        <MockSite
          heroBleed
          heroMedia={
            <ObjectHero status={status} background={background}>
              <WireframeObject
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
        title="Wireframe Object controls"
        controls={controls}
        presets={WIREFRAME_OBJECT_PRESETS}
        snippet={{
          component: "WireframeObject",
          props: background ? { ...props, background } : props,
        }}
      />
    </>
  );
}
