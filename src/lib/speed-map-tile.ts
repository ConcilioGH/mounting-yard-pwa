/**
 * Single source of truth for speed-map runner tile geometry (render + collision).
 * Defaults match design reference frame; update via measureSpeedMapTileFromDom when board mounts.
 */

export type SpeedMapTileMetrics = {
  WIDTH: number;
  HEIGHT: number;
  GAP_X: number;
  GAP_Y: number;
  RAIL_CLEARANCE: number;
  /** Px from tile top to stored runner.y anchor (board coordinates). */
  ANCHOR_OFFSET_Y: number;
  boardWidthPx: number;
  boardHeightPx: number;
};

export const DEFAULT_SPEED_MAP_BOARD_WIDTH_PX = 1280;
export const DEFAULT_SPEED_MAP_BOARD_HEIGHT_PX = 720;

export const DEFAULT_SPEED_MAP_TILE: SpeedMapTileMetrics = {
  WIDTH: 96,
  HEIGHT: 72,
  GAP_X: 6,
  GAP_Y: 4,
  RAIL_CLEARANCE: 12,
  ANCHOR_OFFSET_Y: 34,
  boardWidthPx: DEFAULT_SPEED_MAP_BOARD_WIDTH_PX,
  boardHeightPx: DEFAULT_SPEED_MAP_BOARD_HEIGHT_PX,
};

let tileMetrics: SpeedMapTileMetrics = { ...DEFAULT_SPEED_MAP_TILE };

export function getSpeedMapTile(): Readonly<SpeedMapTileMetrics> {
  return tileMetrics;
}

/** Uniform vertical spacing between lane tile tops: HEIGHT + GAP_Y. */
export function laneStepPx(tile: Readonly<SpeedMapTileMetrics> = tileMetrics): number {
  return tile.HEIGHT + tile.GAP_Y;
}

/** Tile top (px) for lane index — grid anchored inward from rail clearance. */
export function laneTileTopPx(lane: number, railY: number, tile: Readonly<SpeedMapTileMetrics> = tileMetrics): number {
  const step = laneStepPx(tile);
  return railY - tile.RAIL_CLEARANCE - tile.HEIGHT - lane * step;
}

export function tileWidthNorm(tile: Readonly<SpeedMapTileMetrics> = tileMetrics): number {
  return tile.WIDTH / tile.boardWidthPx;
}

export function gapHalfNormX(tile: Readonly<SpeedMapTileMetrics> = tileMetrics): number {
  return tile.GAP_X / 2 / tile.boardWidthPx;
}

export function gapHalfNormY(tile: Readonly<SpeedMapTileMetrics> = tileMetrics): number {
  return tile.GAP_Y / 2 / tile.boardHeightPx;
}

export type TileRectNorm = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Board-pixel box matching HorseTile CSS (left/top/width/height + anchor). */
export type TileBoxPx = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function tileBoundingBoxPxFromPlacement(
  xNorm: number,
  yNorm: number,
  tile: Readonly<SpeedMapTileMetrics> = tileMetrics,
): TileBoxPx {
  const left = xNorm * tile.boardWidthPx;
  const top = yNorm * tile.boardHeightPx - tile.ANCHOR_OFFSET_Y;
  return {
    left,
    right: left + tile.WIDTH,
    top,
    bottom: top + tile.HEIGHT,
  };
}

/** 6px visual clearance — same predicate as final rendered collision pass. */
export function tileBoxesViolateVisualClearance(
  a: TileBoxPx,
  b: TileBoxPx,
  gapPx = 6,
): boolean {
  return (
    a.right + gapPx > b.left &&
    a.left < b.right + gapPx &&
    a.bottom + gapPx > b.top &&
    a.top < b.bottom + gapPx
  );
}

export function shiftTileBoxPxY(box: TileBoxPx, deltaPx: number): TileBoxPx {
  return {
    left: box.left,
    right: box.right,
    top: box.top + deltaPx,
    bottom: box.bottom + deltaPx,
  };
}

/** Smallest vertical shift (px) so mover no longer violates clearance vs other. */
export function minVerticalDeltaPxToClearPair(
  moverBox: TileBoxPx,
  otherBox: TileBoxPx,
  gapPx = 6,
): number | null {
  const candidates = [
    otherBox.top - gapPx - moverBox.bottom,
    otherBox.bottom + gapPx - moverBox.top,
  ];
  let best: number | null = null;
  for (const deltaPx of candidates) {
    const moved = shiftTileBoxPxY(moverBox, deltaPx);
    if (!tileBoxesViolateVisualClearance(moved, otherBox, gapPx)) {
      if (best === null || Math.abs(deltaPx) < Math.abs(best)) best = deltaPx;
    }
  }
  return best;
}

/** Normalized tile box (fractions of board width/height) — matches HorseTile layout. */
export function tileRectNormFromPlacement(
  xNorm: number,
  yNorm: number,
  tile: Readonly<SpeedMapTileMetrics> = tileMetrics,
): TileRectNorm {
  const left = xNorm;
  const top = yNorm - tile.ANCHOR_OFFSET_Y / tile.boardHeightPx;
  const w = tile.WIDTH / tile.boardWidthPx;
  const h = tile.HEIGHT / tile.boardHeightPx;
  return { left, top, right: left + w, bottom: top + h };
}

export function rectsOverlap2D(a: TileRectNorm, b: TileRectNorm): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function inflateTileRectNorm(rect: TileRectNorm, tile: Readonly<SpeedMapTileMetrics> = tileMetrics): TileRectNorm {
  const padX = gapHalfNormX(tile);
  const padY = gapHalfNormY(tile);
  return {
    left: rect.left - padX,
    top: rect.top - padY,
    right: rect.right + padX,
    bottom: rect.bottom + padY,
  };
}

export function tileTopPxFromYNorm(yNorm: number, tile: Readonly<SpeedMapTileMetrics> = tileMetrics): number {
  return yNorm * tile.boardHeightPx - tile.ANCHOR_OFFSET_Y;
}

export function tileBottomPxFromYNorm(yNorm: number, tile: Readonly<SpeedMapTileMetrics> = tileMetrics): number {
  return tileTopPxFromYNorm(yNorm, tile) + tile.HEIGHT;
}

export function maxTileBottomPx(railY: number, tile: Readonly<SpeedMapTileMetrics> = tileMetrics): number {
  return railY - tile.RAIL_CLEARANCE;
}

export function measureSpeedMapTileFromDom(
  boardRect: DOMRect,
  tileRect: DOMRect,
  anchorYFraction: number,
): SpeedMapTileMetrics {
  const anchorPx = boardRect.top + anchorYFraction * boardRect.height;
  const anchorOffset = anchorPx - tileRect.top;
  return {
    WIDTH: tileRect.width,
    HEIGHT: tileRect.height,
    GAP_X: DEFAULT_SPEED_MAP_TILE.GAP_X,
    GAP_Y: DEFAULT_SPEED_MAP_TILE.GAP_Y,
    RAIL_CLEARANCE: DEFAULT_SPEED_MAP_TILE.RAIL_CLEARANCE,
    ANCHOR_OFFSET_Y: anchorOffset,
    boardWidthPx: boardRect.width,
    boardHeightPx: boardRect.height,
  };
}

function metricsNearlyEqual(a: SpeedMapTileMetrics, b: SpeedMapTileMetrics, eps = 0.5): boolean {
  return (
    Math.abs(a.WIDTH - b.WIDTH) < eps &&
    Math.abs(a.HEIGHT - b.HEIGHT) < eps &&
    Math.abs(a.ANCHOR_OFFSET_Y - b.ANCHOR_OFFSET_Y) < eps &&
    Math.abs(a.boardWidthPx - b.boardWidthPx) < eps &&
    Math.abs(a.boardHeightPx - b.boardHeightPx) < eps
  );
}

/** Returns true when metrics changed. */
export function applySpeedMapTileMetrics(next: Partial<SpeedMapTileMetrics>): boolean {
  const merged: SpeedMapTileMetrics = { ...tileMetrics, ...next };
  if (metricsNearlyEqual(tileMetrics, merged)) return false;
  tileMetrics = merged;
  return true;
}

export function resetSpeedMapTileMetrics(): void {
  tileMetrics = { ...DEFAULT_SPEED_MAP_TILE };
}

/** Live runner-tile dimensions (render + collision). */
export const TILE = {
  get WIDTH() {
    return tileMetrics.WIDTH;
  },
  get HEIGHT() {
    return tileMetrics.HEIGHT;
  },
  get GAP_X() {
    return tileMetrics.GAP_X;
  },
  get GAP_Y() {
    return tileMetrics.GAP_Y;
  },
  get RAIL_CLEARANCE() {
    return tileMetrics.RAIL_CLEARANCE;
  },
  get ANCHOR_OFFSET_Y() {
    return tileMetrics.ANCHOR_OFFSET_Y;
  },
  get LANE_STEP() {
    return laneStepPx(tileMetrics);
  },
};
