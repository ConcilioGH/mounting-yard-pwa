"use client";

import type { ReactNode } from "react";
import { StartupDiagnosticsRoot } from "@/components/startup-diagnostics";
import { SpeedMapProvider } from "@/components/speed-map/speed-map-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StartupDiagnosticsRoot>
      <SpeedMapProvider>{children}</SpeedMapProvider>
    </StartupDiagnosticsRoot>
  );
}
