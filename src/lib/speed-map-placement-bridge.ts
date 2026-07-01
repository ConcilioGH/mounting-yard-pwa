"use client";

/** Active-board placement engine (barrier / rail / overlap pipeline). */
export { applyActiveBoardRacePlacement } from "@/components/speed-map/speed-map-board";
export {
  applyActiveBoardPlacementIfReady,
  getActiveBoardPlacement,
  registerActiveBoardPlacement,
} from "@/lib/speed-map-placement-registry";
