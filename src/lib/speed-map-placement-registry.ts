import type { SpeedMapRunner } from "@/lib/speed-map";
import { normalizeErrorMessage } from "@/lib/startup-diagnostics";

export type ActiveBoardPlacementFn = (
  runners: SpeedMapRunner[],
  raceNo?: string,
) => SpeedMapRunner[];

let placementFn: ActiveBoardPlacementFn | null = null;

/** Registered by speed-map-board when its placement module finishes loading. */
export function registerActiveBoardPlacement(fn: ActiveBoardPlacementFn): void {
  placementFn = fn;
}

export function getActiveBoardPlacement(): ActiveBoardPlacementFn | null {
  return placementFn;
}

export function applyActiveBoardPlacementIfReady(
  runners: SpeedMapRunner[],
  raceNo?: string,
): SpeedMapRunner[] {
  const placement = getActiveBoardPlacement();
  if (!placement) return runners;
  try {
    return placement(runners, raceNo);
  } catch (error) {
    console.warn("[speed-map] placement failed:", normalizeErrorMessage(error));
    return runners;
  }
}
