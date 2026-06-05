/**
 * Speed map horizontal scale: 11 equal columns for 12→11 … 3→2, then one condensed band 2→0
 * (w_ir 1 halfway between w_ir 2 line and right boundary; no separate w_ir 1 gridline).
 */

import { DEFAULT_SPEED_MAP_TILE } from "./speed-map-tile";

export const VISUAL_COLUMNS = 11;
/** Zone label boundary between Midfield and On Pace/Midfield (visual/layout only — not w_ir math). */
export const PACE_MIDFIELD_ZONE_DIVIDER_COL = 5;

export const SPEED_MAP_TRACK_WIDTH_PX = DEFAULT_SPEED_MAP_TILE.boardWidthPx;
export const SPEED_MAP_TILE_WIDTH_PX = DEFAULT_SPEED_MAP_TILE.WIDTH;

export const MIN_WIR = 0;
export const MAX_WIR = 12;

/** Right-edge x (px, from inner left) for this w_ir — same function for gridlines, placement, debug. */
export function getWirX(
  wir: number,
  usableWidthPx: number = SPEED_MAP_TRACK_WIDTH_PX,
  leftEdgePx = 0,
): number {
  const columnWidth = usableWidthPx / VISUAL_COLUMNS;
  const clamped = Math.max(MIN_WIR, Math.min(MAX_WIR, wir));

  if (clamped >= 2) {
    return leftEdgePx + (12 - clamped) * columnWidth;
  }

  const xAt2 = leftEdgePx + (12 - 2) * columnWidth;
  const rightEdge = leftEdgePx + usableWidthPx;
  const t = (2 - clamped) / 2;
  return xAt2 + t * (rightEdge - xAt2);
}

/** Tile left (px), clamped — N/A / invalid w_ir uses 12. */
export function getTileLeftPx(
  wIr: number,
  tileWidthPx: number = SPEED_MAP_TILE_WIDTH_PX,
  usableWidthPx: number = SPEED_MAP_TRACK_WIDTH_PX,
): number {
  const rawWir = Number.isFinite(wIr) ? wIr : 12;
  const xFromWirPx = getWirX(rawWir, usableWidthPx);
  return Math.max(0, Math.min(usableWidthPx - tileWidthPx, xFromWirPx - tileWidthPx));
}

export function getTileLeftNorm(
  wIr: number,
  tileWidthPx: number = SPEED_MAP_TILE_WIDTH_PX,
  usableWidthPx: number = SPEED_MAP_TRACK_WIDTH_PX,
): number {
  return getTileLeftPx(wIr, tileWidthPx, usableWidthPx) / usableWidthPx;
}
