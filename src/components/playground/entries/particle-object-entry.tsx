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
import { ParticleObject } from "@/components/docs/live/ParticleObject";
import {
  PARTICLE_OBJECT_CONTROLS,
  PARTICLE_OBJECT_PRESETS,
} from "@/demos/particle-object-demo";

const CONTROLS = omit(PARTICLE_OBJECT_CONTROLS, ["zoom"] as const);

export function ParticleObjectEntry() {
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
              <ParticleObject
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
        title="Particle Object controls"
        controls={controls}
        presets={PARTICLE_OBJECT_PRESETS}
        snippet={{ component: "ParticleObject", props }}
      />
    </>
  );
}
