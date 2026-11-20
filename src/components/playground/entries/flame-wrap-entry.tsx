"use client";

import { hexToRgb } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { EntryPage } from "@/components/playground/entries/shared";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { FlameWrap } from "@/components/docs/live/FlameWrap";
import {
  FLAME_WRAP_CONTROLS,
  FLAME_WRAP_PRESETS,
  FlameProfileCard,
} from "@/demos/flame-wrap-demo";

export function FlameWrapEntry() {
  const controls = useDemoControls(FLAME_WRAP_CONTROLS);
  const { flame, ...values } = controls.values;
  const props = { ...values, color: hexToRgb(flame) };

  return (
    <>
      <EntryPage>
        <div className="frame relative flex min-h-[calc(100svh-8rem)] items-center justify-center overflow-hidden">
          <FlameWrap {...props} className="w-[300px] sm:w-[340px]" style={{ height: 340 }}>
            <FlameProfileCard radius={values.radius} />
          </FlameWrap>
        </div>
      </EntryPage>

      <DemoControls
        title="Flame Wrap controls"
        controls={controls}
        presets={FLAME_WRAP_PRESETS}
        snippet={{ component: "FlameWrap", props }}
      />
    </>
  );
}
