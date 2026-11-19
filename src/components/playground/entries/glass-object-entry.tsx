"use client";

import { useState } from "react";
import { useTheme } from "next-themes";

import { DemoControls } from "@/components/demos/demo-controls";
import {
  EntryPage,
  StatusPill,
  omit,
  type EntryStatus,
} from "@/components/playground/entries/shared";
import { MockSite } from "@/components/playground/mock-site";
import { photoUrl } from "@/lib/demo-photo";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { GlassObject } from "@/components/docs/live/GlassObject";
import {
  GLASS_OBJECT_CONTROLS,
  GLASS_OBJECT_PRESETS,
} from "@/demos/glass-object-demo";

const MARK = "/assets/bolt-mark.svg";

const CONTROLS = omit(GLASS_OBJECT_CONTROLS, ["zoom", "backdrop"] as const);

export function GlassObjectEntry() {
  const { resolvedTheme } = useTheme();
  const controls = useDemoControls(CONTROLS);
  const [status, setStatus] = useState<EntryStatus>("loading");
  const values = omit(controls.values, ["src", "background"]);
  const props = {
    src: MARK,
    ...values,
    background: resolvedTheme === "dark" ? "#0a0a0a" : "#ffffff",
    backgroundImage: photoUrl(0, resolvedTheme === "light" ? "light" : "dark"),
  };

  return (
    <>
      <EntryPage>
        <MockSite
          heroMedia={
            <div className="absolute inset-0">
              <GlassObject
                {...props}
                zoom={false}
                onLoad={() => setStatus("ready")}
                onError={() => setStatus("error")}
                className="h-full w-full"
              />
              <StatusPill status={status} />
            </div>
          }
        />
      </EntryPage>

      <DemoControls
        title="Glass Object controls"
        controls={controls}
        presets={GLASS_OBJECT_PRESETS}
        snippet={{ component: "GlassObject", props }}
      />
    </>
  );
}
