"use client";

import type { ReactNode } from "react";
import { SpeedMapProvider } from "@/components/speed-map/speed-map-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return <SpeedMapProvider>{children}</SpeedMapProvider>;
}
