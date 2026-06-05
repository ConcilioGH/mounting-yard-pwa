import {
  getTileLeftNorm,
  getWirX,
  SPEED_MAP_TRACK_WIDTH_PX,
  VISUAL_COLUMNS,
} from "@/lib/wirTrackScale";

export type WirMappedZone =
  | "Leader"
  | "On Pace"
  | "On Pace/Midfield"
  | "Midfield"
  | "Midfield/Backmarker"
  | "Backmarker";

export type WirPlacement = {
  zoneLabel: WirMappedZone;
  tileIndex: number;
  /** Normalized tile **left** (0–1), aligned with `HorseTile` / board placement. */
  x: number;
};

function tileIndexFromWir(wIr: number): number {
  const cw = SPEED_MAP_TRACK_WIDTH_PX / VISUAL_COLUMNS;
  const xRight = getWirX(wIr);
  return Math.min(VISUAL_COLUMNS - 1, Math.max(0, Math.floor(xRight / cw)));
}

/**
 * Map w_ir to zone label and normalized tile left.
 * Horizontal scale: 11 equal columns (12→11 … 3→2), condensed 2→0 band per `getWirX`.
 */
export function mapRunnerByWir(wIr: number): WirPlacement {
  let zoneLabel: WirMappedZone = "Backmarker";

  if (wIr < 2) {
    zoneLabel = "Leader";
  } else if (wIr < 3) {
    zoneLabel = "Leader";
  } else if (wIr < 5) {
    zoneLabel = "On Pace";
  } else if (wIr < 7) {
    zoneLabel = "On Pace/Midfield";
  } else if (wIr < 9) {
    zoneLabel = "Midfield";
  } else if (wIr < 11) {
    zoneLabel = "Midfield/Backmarker";
  } else {
    zoneLabel = "Backmarker";
  }

  return {
    zoneLabel,
    tileIndex: tileIndexFromWir(wIr),
    x: getTileLeftNorm(wIr),
  };
}
