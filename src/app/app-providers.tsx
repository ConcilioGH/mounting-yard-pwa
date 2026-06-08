"use client";

import type { ReactNode } from "react";
import { HydrationStageProvider } from "@/components/hydration-stage-tracker";
import { StartupDiagnosticsRoot } from "@/components/startup-diagnostics";
import { SpeedMapProvider } from "@/components/speed-map/speed-map-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <HydrationStageProvider>
      <StartupDiagnosticsRoot>
        <SpeedMapProvider>{children}</SpeedMapProvider>
      </StartupDiagnosticsRoot>
    </HydrationStageProvider>
  );
}
