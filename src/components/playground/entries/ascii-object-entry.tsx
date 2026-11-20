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
import { AsciiObject } from "@/components/docs/live/AsciiObject";
import {
  ASCII_OBJECT_CONTROLS,
  ASCII_OBJECT_PRESETS,
  CHARSETS,
} from "@/demos/ascii-object-demo";

const CONTROLS = omit(ASCII_OBJECT_CONTROLS, ["zoom"] as const);

export function AsciiObjectEntry() {
  const controls = useDemoControls(CONTROLS);
  const [status, setStatus] = useState<EntryStatus>("loading");
  const { charsetChoice, background, ...rest } = controls.values;
  const values = omit(rest, ["src"]);
  const charset = CHARSETS[charsetChoice];
  const props = { src: HERO_MODEL, ...values, ...(charset ? { charset } : {}) };

  return (
    <>
      <EntryPage>
        <MockSite
          heroBleed
          heroMedia={
            <ObjectHero status={status} background={background}>
              <AsciiObject
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
        title="ASCII Object controls"
        controls={controls}
        presets={ASCII_OBJECT_PRESETS}
        snippet={{ component: "AsciiObject", props }}
      />
    </>
  );
}
