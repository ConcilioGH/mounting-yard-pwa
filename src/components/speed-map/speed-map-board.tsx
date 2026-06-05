"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { ControlsPanel } from "@/components/speed-map/controls-panel";
import { useSpeedMapSession } from "@/components/speed-map/speed-map-provider";
import { HORSE_TILE_SURFACE_CLASS, HorseTile, horseTileStyleFromMetrics } from "@/components/speed-map/horse-tile";
import { KeyIdeaBox } from "@/components/speed-map/key-idea-box";
import { PressureMeter } from "@/components/speed-map/pressure-meter";
import { RaceMetaBar } from "@/components/speed-map/race-meta-bar";
import {
  hydrateRunnerSpeedFields,
  pressureFromRunners,
  type RaceMapStateEntry,
  type RaceMeta,
  type SpeedMapImportDebug,
  type SpeedMapRunner,
  type RunnerFlags,
} from "@/lib/speed-map";
import {
  applySpeedMapTileMetrics,
  gapHalfNormX,
  getSpeedMapTile,
  inflateTileRectNorm,
  laneStepPx,
  laneTileTopPx,
  measureSpeedMapTileFromDom,
  rectsOverlap2D,
  tileBottomPxFromYNorm,
  minVerticalDeltaPxToClearPair,
  tileBoundingBoxPxFromPlacement,
  tileBoxesViolateVisualClearance,
  tileRectNormFromPlacement,
  tileTopPxFromYNorm,
  tileWidthNorm,
  type TileRectNorm,
} from "@/lib/speed-map-tile";
import {
  clearSpeedMapLocalStorage,
  hardResetAppStorage,
} from "@/lib/speed-map-storage";
import { getTileLeftNorm, VISUAL_COLUMNS } from "@/lib/wirTrackScale";
import { cn } from "@/lib/utils";

type RaceMapEntry = RaceMapStateEntry;
const WIR_TRACK_TEMPLATE = `repeat(${VISUAL_COLUMNS}, minmax(0, 1fr))`;
const TILE_HALF_HEIGHT = 0.05;
const RAIL_TOP = 0.92;
const RAIL_PADDING = 0.008;
const MAX_TILE_CENTER_Y = RAIL_TOP - TILE_HALF_HEIGHT - RAIL_PADDING;

const BOARD_TOP_PADDING_PX = 12;
/** w_ir margin for cross-in-front / drop-behind (tactical layer). */
const CROSS_INSIDE_WIR_MARGIN = 1.1;
const CROSSING_Y_TOL_NORM = 0.0025;
/** Nearby pack for barrier depth during rail compression (tile widths / lane heights). */
const BARRIER_PROXIMITY_X_TILES = 2.5;
const BARRIER_PROXIMITY_LANE_STEPS = 4;
/** Padded collision for final rendered overlap checks (border/shadow). */
const COLLISION_PAD_X = 6;
const COLLISION_PAD_Y = 4;
/** Visual-only nudge cap within a tactical column (px). */
const VISUAL_NUDGE_MAX_PX = 28;

const EMPTY_RUNNER_FLAGS: RunnerFlags = {
  favourite: false,
  target: false,
  mapAdvantage: false,
  risk: false,
};

function railLinePx() {
  return RAIL_TOP * getSpeedMapTile().boardHeightPx;
}

function crossingTolPx() {
  return CROSSING_Y_TOL_NORM * getSpeedMapTile().boardHeightPx;
}

function columnKeyDivisorPx() {
  return getSpeedMapTile().WIDTH * 0.75;
}

/** Tile top limits (px from board top) — keeps tiles inside the map, not in the page header. */
function boardTileTopLimitsPx() {
  const tile = getSpeedMapTile();
  const railY = railLinePx();
  return {
    minTileTop: BOARD_TOP_PADDING_PX,
    maxTileTop: laneTileTopPx(0, railY, tile),
  };
}

function clampTileTopPx(tileTopPx: number) {
  const { minTileTop, maxTileTop } = boardTileTopLimitsPx();
  return Math.max(minTileTop, Math.min(tileTopPx, maxTileTop));
}

function anchorPxFromTileTopPx(tileTopPx: number) {
  return clampTileTopPx(tileTopPx) + getSpeedMapTile().ANCHOR_OFFSET_Y;
}

function yNormFromAnchorPx(anchorPx: number) {
  const tile = getSpeedMapTile();
  const { minTileTop, maxTileTop } = boardTileTopLimitsPx();
  const minAnchor = minTileTop + tile.ANCHOR_OFFSET_Y;
  const maxAnchor = maxTileTop + tile.ANCHOR_OFFSET_Y;
  const clamped = Math.max(minAnchor, Math.min(anchorPx, maxAnchor));
  return clamped / tile.boardHeightPx;
}

function barrierSortKey(barrier: string) {
  const b = Number(barrier);
  return Number.isFinite(b) && b > 0 ? b : 999;
}

/** Effective w_ir for horizontal placement (N/A / invalid → 12 = backmarker). */
function effectiveWirForPlacement(runner: SpeedMapRunner): number {
  const raw = runner.wIr;
  if (raw == null || Number.isNaN(raw) || !Number.isFinite(raw)) return 12;
  if (!runner.hasSpeedData) return 12;
  return raw;
}

/** Normalized tile left — clamped so w_ir 12 / backmarker tiles stay inside the board. */
function xNormFromEffectiveWir(effectiveWir: number) {
  const tile = getSpeedMapTile();
  return getTileLeftNorm(effectiveWir, tile.WIDTH, tile.boardWidthPx);
}

function clampRunnerXNormToBoard(xNorm: number) {
  const tile = getSpeedMapTile();
  const maxLeft = (tile.boardWidthPx - tile.WIDTH) / tile.boardWidthPx;
  return Math.max(0, Math.min(maxLeft, xNorm));
}

type PlacedTile = {
  runnerId: string;
  x: number;
  rect: TileRectNorm;
  barrier: number;
  y: number;
  /** Tactical ideal y at first placement. */
  tacticalY: number;
  /** Y after placement passes — preserved anchor for overlap repair. */
  originalY: number;
  wIr: number;
  lane: number;
  no: number;
};

type LaneRunner = {
  runner: SpeedMapRunner;
  x: number;
  wEff: number;
  barrier: number;
  band: number;
};

function wirBandIndex(wEff: number) {
  if (wEff < 3) return 0;
  if (wEff < 5) return 1;
  if (wEff < 7) return 2;
  if (wEff < 9) return 3;
  if (wEff < 12) return 4;
  return 5;
}

const WIR_BAND_PLACEMENT_ORDER = [0, 1, 2, 3, 4, 5] as const;

function maxLaneOnBoard() {
  const tile = getSpeedMapTile();
  const railY = railLinePx();
  const minY = BOARD_TOP_PADDING_PX;
  const lane0Top = laneTileTopPx(0, railY, tile);
  const span = lane0Top - minY;
  const step = laneStepPx(tile);
  if (span <= 0) return 0;
  return Math.max(0, Math.floor(span / step));
}

/** Collision layer: lane 0 = inside (closest to rail); uniform LANE_STEP spacing. */
function laneToTileTopPx(lane: number) {
  return laneTileTopPx(lane, railLinePx(), getSpeedMapTile());
}

function laneToYNorm(lane: number) {
  return yNormFromAnchorPx(anchorPxFromTileTopPx(clampTileTopPx(laneToTileTopPx(lane))));
}

/** y from lane index only — LANE_STEP = HEIGHT + GAP_Y (no extra barrier/pack spacing). */
function syncPlacedTileYFromLane(tile: PlacedTile, maxLane: number) {
  const lane = Math.max(0, Math.min(tile.lane, maxLane));
  tile.lane = lane;
  tile.y = laneToYNorm(lane);
  syncPlacedTileGeometry(tile);
}

function syncRunnerYFromLane(runner: SpeedMapRunner, maxLane: number) {
  if (runner.manuallyPlaced) return;
  const lane = Math.max(0, Math.min(runner.lane ?? yToLane(runner.y, maxLane), maxLane));
  runner.lane = lane;
  runner.y = laneToYNorm(lane);
  runner.modelY = runner.y;
}

function snapAllPlacedYFromLane(placed: PlacedTile[], maxLane: number) {
  for (const tile of placed) syncPlacedTileYFromLane(tile, maxLane);
}

function snapAllRunnerYFromLane(runners: SpeedMapRunner[], maxLane: number) {
  for (const runner of runners) syncRunnerYFromLane(runner, maxLane);
}

function satisfiesRailClearance(yNorm: number) {
  const tile = getSpeedMapTile();
  return tileBottomPxFromYNorm(yNorm, tile) <= railLinePx() - tile.RAIL_CLEARANCE + 0.5;
}

/** Ideal anchor y → preferred lane (collision layer only). */
function yToLane(yNorm: number, maxLane: number) {
  const tile = getSpeedMapTile();
  const railY = railLinePx();
  const tileTopPx = tileTopPxFromYNorm(yNorm, tile);
  const step = laneStepPx(tile);
  const raw = Math.round((railY - tile.RAIL_CLEARANCE - tile.HEIGHT - tileTopPx) / step);
  return Math.max(0, Math.min(raw, maxLane));
}

function syncPlacedTileGeometry(tile: PlacedTile) {
  tile.rect = tileRectNormFromPlacement(tile.x, tile.y);
}

function paddedVisualRectsOverlap(a: TileRectNorm, b: TileRectNorm) {
  const tile = getSpeedMapTile();
  return rectsOverlap2D(inflateTileRectNorm(a, tile), inflateTileRectNorm(b, tile));
}

function visualPaddingMoveTarget(a: PlacedTile, b: PlacedTile) {
  if (a.barrier !== b.barrier) return a.barrier >= b.barrier ? a : b;
  if (a.wIr !== b.wIr) return a.wIr >= b.wIr ? a : b;
  return a.no >= b.no ? a : b;
}

function clampPlacedTileToVisualRailClearance(tile: PlacedTile) {
  const metrics = getSpeedMapTile();
  const maxBottom = railLinePx() - metrics.RAIL_CLEARANCE;
  let topPx = tileTopPxFromYNorm(tile.y, metrics);
  const bottomPx = topPx + metrics.HEIGHT;
  if (bottomPx <= maxBottom) return;
  topPx -= bottomPx - maxBottom;
  tile.y = yNormFromAnchorPx(topPx + metrics.ANCHOR_OFFSET_Y);
  syncPlacedTileGeometry(tile);
}

function tryMovePlacedTileUpPx(tile: PlacedTile, deltaPx: number) {
  const metrics = getSpeedMapTile();
  const { minTileTop } = boardTileTopLimitsPx();
  const minAnchorPx = minTileTop + metrics.ANCHOR_OFFSET_Y;
  const nextAnchorPx = tile.y * metrics.boardHeightPx - deltaPx;
  if (nextAnchorPx < minAnchorPx) return false;
  tile.y = yNormFromAnchorPx(nextAnchorPx);
  syncPlacedTileGeometry(tile);
  return true;
}

function repairMoveBlockedAtY(tile: PlacedTile, candidateY: number, placed: PlacedTile[]) {
  const probeRect = tileRectNormFromPlacement(tile.x, candidateY);
  for (const other of placed) {
    if (other.runnerId === tile.runnerId) continue;
    if (rectsOverlap2D(probeRect, other.rect)) return true;
    if (!settlingRuleAllowsAtY(tile, candidateY, other)) return true;
  }
  return false;
}

function tryMovePlacedTileUpPxChecked(tile: PlacedTile, deltaPx: number, placed: PlacedTile[]) {
  const metrics = getSpeedMapTile();
  const { minTileTop } = boardTileTopLimitsPx();
  const minAnchorPx = minTileTop + metrics.ANCHOR_OFFSET_Y;
  const nextAnchorPx = tile.y * metrics.boardHeightPx - deltaPx;
  const candidateY = nextAnchorPx / metrics.boardHeightPx;
  if (nextAnchorPx < minAnchorPx) return false;
  if (repairMoveBlockedAtY(tile, candidateY, placed)) return false;
  tile.y = yNormFromAnchorPx(nextAnchorPx);
  syncPlacedTileGeometry(tile);
  return true;
}

/** Post-placement only: visual rail + card gaps (does not change x or tactical logic). */
function applyVisualSafetyPadding(placed: PlacedTile[]) {
  for (const tile of placed) {
    clampPlacedTileToVisualRailClearance(tile);
  }

  const maxIter = Math.max(500, placed.length * placed.length);
  for (let iter = 0; iter < maxIter; iter += 1) {
    let changed = false;
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i]!;
        const b = placed[j]!;
        if (!paddedVisualRectsOverlap(a.rect, b.rect)) continue;
        const target = visualPaddingMoveTarget(a, b);
        if (tryMovePlacedTileUpPx(target, 1)) changed = true;
      }
    }
    if (!changed) break;
  }

  for (const tile of placed) {
    clampPlacedTileToVisualRailClearance(tile);
  }
}

function tilesHorizontallyOverlap(
  a: { left: number; right: number },
  b: { left: number; right: number },
) {
  return a.left < b.right && a.right > b.left;
}

/** Cross in front (faster) or drop in behind (slower) — |Δw_ir| must be ≥ 1.1. */
function canSettleInsideNeighbour(runnerWir: number, insideWir: number) {
  return (
    runnerWir <= insideWir - CROSS_INSIDE_WIR_MARGIN ||
    runnerWir >= insideWir + CROSS_INSIDE_WIR_MARGIN
  );
}

function speedsWithinCrossingPack(wA: number, wB: number) {
  return Math.abs(wA - wB) < CROSS_INSIDE_WIR_MARGIN;
}

function sameSpeedPackLaneSortKey(a: { barrier: number; wIr: number; no: number }, b: typeof a) {
  return a.barrier - b.barrier || a.wIr - b.wIr || a.no - b.no;
}

type BarrierPackMember = {
  id: string;
  horse: string;
  x: number;
  y: number;
  wIr: number;
  barrier: number;
  no: number;
  lane: number;
};

/** Connected same-speed packs: |Δw_ir| < 1.1 and tactical proximity from placed x/y (not w_ir x-band only). */
function sameSpeedPackTacticalProximity(
  a: Pick<BarrierPackMember, "x" | "y" | "wIr">,
  b: Pick<BarrierPackMember, "x" | "y" | "wIr">,
) {
  if (!speedsWithinCrossingPack(a.wIr, b.wIr)) return false;

  if (columnKeyFromXNorm(a.x) === columnKeyFromXNorm(b.x)) return true;

  const tile = getSpeedMapTile();
  if (Math.abs(a.x - b.x) <= tileWidthNorm() + gapHalfNormX() * 2) return true;

  const boxA = tileRectNormFromPlacement(a.x, a.y, tile);
  const boxB = tileRectNormFromPlacement(b.x, b.y, tile);
  if (tilesHorizontallyOverlapOrNear(boxA, boxB)) {
    const dyPx = Math.abs(a.y - b.y) * tile.boardHeightPx;
    if (dyPx <= laneStepPx(tile) * BARRIER_PROXIMITY_LANE_STEPS) return true;
  }

  const centerAx = ((boxA.left + boxA.right) / 2) * tile.boardWidthPx;
  const centerBx = ((boxB.left + boxB.right) / 2) * tile.boardWidthPx;
  const dxPx = Math.abs(centerAx - centerBx);
  const dyPx = Math.abs(a.y - b.y) * tile.boardHeightPx;
  return (
    dxPx <= tile.WIDTH * BARRIER_PROXIMITY_X_TILES &&
    dyPx <= laneStepPx(tile) * BARRIER_PROXIMITY_LANE_STEPS
  );
}

function buildSameSpeedPackGroupIndices<T extends { wIr: number; x: number; y: number }>(
  items: T[],
  sameTacticalProximity: (a: T, b: T) => boolean,
): number[][] {
  const n = items.length;
  if (n < 2) return [];

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    let cursor = i;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor]!;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (!sameTacticalProximity(items[i]!, items[j]!)) continue;
      union(i, j);
    }
  }

  const grouped = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root)!.push(i);
  }

  return [...grouped.values()].filter((group) => group.length >= 2);
}

/**
 * Same-speed pack lane order — barrier ascending, lanes from pack base.
 * Lane only; x unchanged. Caller must snap y from lane after this pass.
 */
function assignSameSpeedPackBarrierLanesCore(members: BarrierPackMember[], maxLane: number) {
  for (const group of buildSameSpeedPackGroupIndices(members, sameSpeedPackTacticalProximity)) {
    const pack = group.map((index) => members[index]!);
    const sorted = [...pack].sort(sameSpeedPackLaneSortKey);
    const baseLane = Math.min(...pack.map((member) => member.lane));

    for (const [index, member] of sorted.entries()) {
      member.lane = Math.min(baseLane + index, maxLane);
    }
  }
}

function assignSameSpeedPackBarrierLanesOnRunners(runners: SpeedMapRunner[], maxLane: number) {
  const members: BarrierPackMember[] = runners
    .filter((runner) => !runner.manuallyPlaced)
    .map((runner) => ({
      id: runner.id,
      horse: runner.horse,
      x: runner.x,
      y: runner.y,
      wIr: effectiveWirForPlacement(runner),
      barrier: barrierSortKey(runner.barrier),
      no: runner.no,
      lane: runner.lane ?? yToLane(runner.y, maxLane),
    }));

  assignSameSpeedPackBarrierLanesCore(members, maxLane);

  const laneById = new Map(members.map((member) => [member.id, member.lane]));
  for (const runner of runners) {
    if (runner.manuallyPlaced) continue;
    const lane = laneById.get(runner.id);
    if (lane !== undefined) runner.lane = lane;
  }
}

function logBarrierOrderCheck(runners: SpeedMapRunner[], raceNo?: string) {
  const maxLane = maxLaneOnBoard();
  const rows = [...runners]
    .sort((a, b) => barrierSortKey(a.barrier) - barrierSortKey(b.barrier) || a.no - b.no)
    .map((runner) => ({
      horse: runner.horse,
      barrier: barrierSortKey(runner.barrier),
      w_ir: effectiveWirForPlacement(runner),
      lane: runner.lane ?? yToLane(runner.y, maxLane),
      x: runner.x,
    }));

  console.log("[BarrierOrderCheck]", raceNo ? { raceNo } : undefined);
  console.table(rows);
}

function warnBarrierOrderViolations(runners: SpeedMapRunner[]) {
  const maxLane = maxLaneOnBoard();
  const members: BarrierPackMember[] = runners.map((runner) => ({
    id: runner.id,
    horse: runner.horse,
    x: runner.x,
    y: runner.y,
    wIr: effectiveWirForPlacement(runner),
    barrier: barrierSortKey(runner.barrier),
    no: runner.no,
    lane: runner.lane ?? yToLane(runner.y, maxLane),
  }));

  for (const group of buildRunningLineGroups(runners)) {
    const groupIds = new Set(group.map((r) => r.id));
    const groupMembers = members.filter((m) => groupIds.has(m.id));

    for (let i = 0; i < groupMembers.length; i += 1) {
      for (let j = i + 1; j < groupMembers.length; j += 1) {
        const a = groupMembers[i]!;
        const b = groupMembers[j]!;
        if (!sameSpeedPackTacticalProximity(a, b)) continue;
        if (a.barrier === b.barrier) continue;

        const low = a.barrier < b.barrier ? a : b;
        const high = low === a ? b : a;
        if (low.y < high.y - CROSSING_Y_TOL_NORM) {
          console.warn("Barrier order violation", {
            inside: low.horse,
            insideBarrier: low.barrier,
            insideY: low.y,
            outside: high.horse,
            outsideBarrier: high.barrier,
            outsideY: high.y,
            w_irDelta: Math.abs(a.wIr - b.wIr),
          });
        }
      }
    }
  }
}

/** Final barrier lane order + y snap — must run after all y-mutating passes. */
function syncRunnerLanesFromY(runners: SpeedMapRunner[], maxLane: number) {
  for (const runner of runners) {
    if (runner.manuallyPlaced) continue;
    runner.lane = yToLane(runner.y, maxLane);
  }
}

function runnersWithinReclaimProximity(a: SpeedMapRunner, b: SpeedMapRunner) {
  const tile = getSpeedMapTile();
  const boxA = tileRectNormFromPlacement(a.x, a.y, tile);
  const boxB = tileRectNormFromPlacement(b.x, b.y, tile);
  const centerAx = ((boxA.left + boxA.right) / 2) * tile.boardWidthPx;
  const centerBx = ((boxB.left + boxB.right) / 2) * tile.boardWidthPx;
  const dxPx = Math.abs(centerAx - centerBx);
  const dyPx = Math.abs(a.y - b.y) * tile.boardHeightPx;
  if (dxPx <= tile.WIDTH * BARRIER_PROXIMITY_X_TILES && dyPx <= laneStepPx(tile) * BARRIER_PROXIMITY_LANE_STEPS) {
    return true;
  }
  if (Math.abs(a.x - b.x) <= tileWidthNorm() + gapHalfNormX() * 2) return true;
  return tilesHorizontallyOverlapOrNear(boxA, boxB);
}

function buildAllRunningLines(runners: SpeedMapRunner[]): SpeedMapRunner[][] {
  const groupedIds = new Set<string>();
  const lines: SpeedMapRunner[][] = [];

  for (const group of buildRunningLineGroups(runners)) {
    lines.push([...group]);
    for (const runner of group) groupedIds.add(runner.id);
  }

  const singletons = runners.filter((runner) => !groupedIds.has(runner.id));
  for (const singleton of singletons) {
    let attached = false;
    for (const line of lines) {
      if (line.some((member) => runnersWithinReclaimProximity(singleton, member))) {
        line.push(singleton);
        groupedIds.add(singleton.id);
        attached = true;
        break;
      }
    }
    if (!attached) lines.push([singleton]);
  }

  return lines;
}

function lineContextForRunner(
  runner: SpeedMapRunner,
  lines: SpeedMapRunner[][],
  allRunners: SpeedMapRunner[],
): SpeedMapRunner[] {
  const group = lines.find((line) => line.some((member) => member.id === runner.id));
  if (group && group.length > 1) return group;

  const proximity = allRunners.filter(
    (other) => other.id !== runner.id && runnersWithinReclaimProximity(runner, other),
  );
  if (!group) return [runner, ...proximity];

  const merged = [...group];
  for (const other of proximity) {
    if (!merged.some((member) => member.id === other.id)) merged.push(other);
  }
  return merged;
}

function crossingJustifiesInsideRunner(mover: SpeedMapRunner, insideRunner: SpeedMapRunner) {
  const wMover = effectiveWirForPlacement(mover);
  const wInside = effectiveWirForPlacement(insideRunner);
  if (speedsWithinCrossingPack(wMover, wInside)) return false;
  return crossingPermitsInsideMove(wMover, wInside);
}

function finalYLegalForRailOwnership(
  runner: SpeedMapRunner,
  candidateY: number,
  runners: SpeedMapRunner[],
  lineMembers: SpeedMapRunner[],
): boolean {
  if (runner.manuallyPlaced) return Math.abs(candidateY - runner.y) <= CROSSING_Y_TOL_NORM;
  if (!satisfiesRailClearance(candidateY)) return false;
  if (!runnerClearAtYNormWithGap(runner, candidateY, runners, FINAL_RENDERED_BBOX_GAP_PX)) return false;

  const crossingRelevant = (other: SpeedMapRunner) =>
    lineMembers.some((member) => member.id === other.id) ||
    runnersWithinReclaimProximity(runner, other);

  for (const other of runners) {
    if (other.id === runner.id || !crossingRelevant(other)) continue;

    if (higherBarrierWronglyInsideLowerAtY(runner, candidateY, other)) return false;
    if (lowerBarrierWronglyOutsideHigherAtY(runner, candidateY, other)) return false;

    const wOther = effectiveWirForPlacement(other);
    const wRunner = effectiveWirForPlacement(runner);

    if (candidateY > other.y + CROSSING_Y_TOL_NORM) {
      if (!insideMovePermittedAtY(wRunner, wOther, candidateY, other.y)) return false;
    }
  }

  return true;
}

/** Step 4 — search toward rail (max y) for the furthest legal position, not the first valid slot. */
function furthestLegalRailYForRunner(
  runner: SpeedMapRunner,
  runners: SpeedMapRunner[],
  lineMembers: SpeedMapRunner[],
): number {
  const minY = minPlacementYNorm();
  const maxInsideY = maxInsidePlacementYNorm();
  const tile = getSpeedMapTile();
  const stepNorm = 1 / tile.boardHeightPx;
  const maxSteps = Math.ceil((maxInsideY - minY) / stepNorm) + 1;
  let bestY: number | null = null;

  for (let step = 0; step <= maxSteps; step += 1) {
    const y = Math.min(maxInsideY, minY + step * stepNorm);
    if (!finalYLegalForRailOwnership(runner, y, runners, lineMembers)) continue;
    bestY = y;
  }

  return bestY ?? runner.y;
}

/** Steps 2–3 — default barrier ascending with 1.1 crossing overrides only. */
function orderLineByBarrierWithCrossings(line: SpeedMapRunner[]): SpeedMapRunner[] {
  const active = line.filter((runner) => !runner.manuallyPlaced);
  let ordered = [...active].sort(
    (a, b) => barrierSortKey(a.barrier) - barrierSortKey(b.barrier) || a.no - b.no,
  );

  for (let pass = 0; pass < active.length * 3; pass += 1) {
    let changed = false;
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const insideCandidate = ordered[i]!;
      const outsideCandidate = ordered[i + 1]!;
      if (barrierSortKey(insideCandidate.barrier) <= barrierSortKey(outsideCandidate.barrier)) continue;
      if (crossingJustifiesInsideRunner(insideCandidate, outsideCandidate)) continue;
      ordered[i] = outsideCandidate;
      ordered[i + 1] = insideCandidate;
      changed = true;
    }
    if (!changed) break;
  }

  return ordered;
}

function higherBarrierWronglyInsideLowerAtY(
  runner: SpeedMapRunner,
  candidateY: number,
  other: SpeedMapRunner,
): boolean {
  const barrierRunner = barrierSortKey(runner.barrier);
  const barrierOther = barrierSortKey(other.barrier);
  if (barrierRunner <= barrierOther) return false;
  if (candidateY < other.y - CROSSING_Y_TOL_NORM) return false;

  const wRunner = effectiveWirForPlacement(runner);
  const wOther = effectiveWirForPlacement(other);
  if (speedsWithinCrossingPack(wRunner, wOther)) return true;
  return !crossingJustifiesInsideRunner(runner, other);
}

function lowerBarrierWronglyOutsideHigherAtY(
  runner: SpeedMapRunner,
  candidateY: number,
  other: SpeedMapRunner,
): boolean {
  const barrierRunner = barrierSortKey(runner.barrier);
  const barrierOther = barrierSortKey(other.barrier);
  if (barrierRunner >= barrierOther) return false;
  if (candidateY >= other.y - CROSSING_Y_TOL_NORM) return false;

  const wRunner = effectiveWirForPlacement(runner);
  const wOther = effectiveWirForPlacement(other);
  if (speedsWithinCrossingPack(wRunner, wOther)) return true;
  return !crossingJustifiesInsideRunner(other, runner);
}

function enforceBarrierStackOrderInLine(line: SpeedMapRunner[], allRunners: SpeedMapRunner[]) {
  const ordered = orderLineByBarrierWithCrossings(line);
  if (ordered.length < 2) return;

  const railContext = lineContextForRunner(ordered[0]!, [line], allRunners);
  const railY = furthestLegalRailYForRunner(ordered[0]!, allRunners, railContext);
  ordered[0]!.y = railY;
  ordered[0]!.modelY = railY;

  for (let i = 1; i < ordered.length; i += 1) {
    const inside = ordered[i - 1]!;
    const outside = ordered[i]!;
    const targetTopPx = runnerBoundingBoxPx(inside).bottom + FINAL_RENDERED_BBOX_GAP_PX;
    const targetY = yNormFromTileTopPx(targetTopPx);
    const context = lineContextForRunner(outside, [line], allRunners);
    const resolvedY = resolveCompressedStackY(outside, targetY, allRunners, line);
    let nextY =
      resolvedY ??
      (finalYLegalForRailOwnership(outside, targetY, allRunners, context) ? targetY : null);

    if (nextY === null) {
      const tile = getSpeedMapTile();
      const stepNorm = 1 / tile.boardHeightPx;
      for (
        let y = targetY;
        y >= minPlacementYNorm() - CROSSING_Y_TOL_NORM;
        y -= stepNorm
      ) {
        if (
          runnerClearAtYNormWithGap(outside, y, allRunners, FINAL_RENDERED_BBOX_GAP_PX) &&
          finalYLegalForRailOwnership(outside, y, allRunners, context)
        ) {
          nextY = y;
          break;
        }
      }
    }

    if (nextY === null) continue;
    outside.y = nextY;
    outside.modelY = nextY;
  }
}

function applyFurthestLegalRailYInBarrierOrder(
  runners: SpeedMapRunner[],
  lines: SpeedMapRunner[][],
) {
  const sorted = [...runners]
    .filter((runner) => !runner.manuallyPlaced)
    .sort((a, b) => barrierSortKey(a.barrier) - barrierSortKey(b.barrier) || a.no - b.no);

  for (const runner of sorted) {
    const context = lineContextForRunner(runner, lines, runners);
    const tile = getSpeedMapTile();
    const stepNorm = 1 / tile.boardHeightPx;
    let maxAllowedY = maxInsidePlacementYNorm();

    for (const mate of context) {
      if (mate.id === runner.id) continue;
      if (barrierSortKey(mate.barrier) >= barrierSortKey(runner.barrier)) continue;
      maxAllowedY = Math.min(maxAllowedY, mate.y - CROSSING_Y_TOL_NORM);
    }

    let bestY = Math.min(furthestLegalRailYForRunner(runner, runners, context), maxAllowedY);

    for (const mate of context) {
      if (mate.id === runner.id) continue;
      if (barrierSortKey(mate.barrier) >= barrierSortKey(runner.barrier)) continue;
      while (
        bestY >= mate.y - CROSSING_Y_TOL_NORM &&
        higherBarrierWronglyInsideLowerAtY(runner, bestY, mate)
      ) {
        bestY = Math.max(minPlacementYNorm(), bestY - stepNorm);
      }
    }

    if (!finalYLegalForRailOwnership(runner, bestY, runners, context)) continue;
    if (Math.abs(bestY - runner.y) <= CROSSING_Y_TOL_NORM) continue;
    runner.y = bestY;
    runner.modelY = bestY;
  }
}

function enforceBarrierStackOrderForAllLines(lines: SpeedMapRunner[][], allRunners: SpeedMapRunner[]) {
  for (const line of lines) {
    if (line.length >= 2) enforceBarrierStackOrderInLine(line, allRunners);
  }
}

function legalCrossingAppliedForRunner(
  runner: SpeedMapRunner,
  lineSortedInsideFirst: SpeedMapRunner[],
): boolean {
  const index = lineSortedInsideFirst.findIndex((member) => member.id === runner.id);
  if (index <= 0) return false;

  const inside = lineSortedInsideFirst[index - 1]!;
  if (barrierSortKey(runner.barrier) <= barrierSortKey(inside.barrier)) return false;
  return crossingJustifiesInsideRunner(runner, inside);
}

function logFinalRailOwnerDiagnostics(
  runners: SpeedMapRunner[],
  lines: SpeedMapRunner[][],
  raceNo?: string,
) {
  const rows: Array<{
    horse: string;
    barrier: number;
    w_ir: number;
    runningLine: number;
    legalCrossingApplied: boolean;
    finalRankInLine: number;
  }> = [];

  lines.forEach((line, lineIndex) => {
    const sorted = [...line].sort((a, b) => b.y - a.y || barrierSortKey(a.barrier) - barrierSortKey(b.barrier));
    sorted.forEach((runner, rankIndex) => {
      rows.push({
        horse: runner.horse,
        barrier: barrierSortKey(runner.barrier),
        w_ir: effectiveWirForPlacement(runner),
        runningLine: lineIndex,
        legalCrossingApplied: legalCrossingAppliedForRunner(runner, sorted),
        finalRankInLine: rankIndex + 1,
      });
    });
  });

  console.log("[FinalRailOwner]", raceNo ? { raceNo } : undefined);
  console.table(rows);

  for (const line of lines) {
    if (line.length < 2) continue;
    const sorted = [...line].sort((a, b) => b.y - a.y);

    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const inside = sorted[i]!;
        const outside = sorted[j]!;
        if (inside.y < outside.y - CROSSING_Y_TOL_NORM) continue;
        if (barrierSortKey(inside.barrier) <= barrierSortKey(outside.barrier)) continue;
        if (crossingJustifiesInsideRunner(inside, outside)) continue;
        console.warn("[FinalRailOwner] line barrier violation", {
          insideHorse: inside.horse,
          insideBarrier: barrierSortKey(inside.barrier),
          insideY: inside.y,
          outsideHorse: outside.horse,
          outsideBarrier: barrierSortKey(outside.barrier),
          outsideY: outside.y,
        });
      }
    }
  }
}

/** Final rail ownership — steps 1–5 only; tactical placement unchanged. */
function repairLineBarrierInversions(line: SpeedMapRunner[], allRunners: SpeedMapRunner[]) {
  const ordered = orderLineByBarrierWithCrossings(line);
  const tile = getSpeedMapTile();
  const stepNorm = 1 / tile.boardHeightPx;
  const contextLine = line;

  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const lowerBarrier = ordered[i]!;
      const higherBarrier = ordered[j]!;
      if (barrierSortKey(higherBarrier.barrier) <= barrierSortKey(lowerBarrier.barrier)) continue;
      if (higherBarrier.y < lowerBarrier.y - CROSSING_Y_TOL_NORM) continue;
      if (crossingJustifiesInsideRunner(higherBarrier, lowerBarrier)) continue;

      const context = lineContextForRunner(higherBarrier, [contextLine], allRunners);
      let targetY = Math.max(
        minPlacementYNorm(),
        lowerBarrier.y - CROSSING_Y_TOL_NORM - stepNorm,
      );

      for (
        ;
        targetY >= minPlacementYNorm() - CROSSING_Y_TOL_NORM;
        targetY -= stepNorm
      ) {
        if (
          runnerClearAtYNormWithGap(higherBarrier, targetY, allRunners, FINAL_RENDERED_BBOX_GAP_PX) &&
          finalYLegalForRailOwnership(higherBarrier, targetY, allRunners, context)
        ) {
          higherBarrier.y = targetY;
          higherBarrier.modelY = targetY;
          break;
        }
      }

      if (
        higherBarrier.y >= lowerBarrier.y - CROSSING_Y_TOL_NORM &&
        speedsWithinCrossingPack(
          effectiveWirForPlacement(higherBarrier),
          effectiveWirForPlacement(lowerBarrier),
        )
      ) {
        const forcedY = Math.max(
          minPlacementYNorm(),
          lowerBarrier.y - laneSeparationYNorm(),
        );
        if (runnerClearAtYNormWithGap(higherBarrier, forcedY, allRunners, FINAL_RENDERED_BBOX_GAP_PX)) {
          higherBarrier.y = forcedY;
          higherBarrier.modelY = forcedY;
        }
      }

      if (
        lowerBarrier.y < higherBarrier.y - CROSSING_Y_TOL_NORM &&
        speedsWithinCrossingPack(
          effectiveWirForPlacement(higherBarrier),
          effectiveWirForPlacement(lowerBarrier),
        ) &&
        !crossingJustifiesInsideRunner(higherBarrier, lowerBarrier)
      ) {
        const contextIn = lineContextForRunner(lowerBarrier, [contextLine], allRunners);
        let targetInY = Math.min(
          maxInsidePlacementYNorm(),
          higherBarrier.y + stepNorm,
        );
        for (
          ;
          targetInY <= maxInsidePlacementYNorm() + CROSSING_Y_TOL_NORM;
          targetInY += stepNorm
        ) {
          if (
            runnerClearAtYNormWithGap(lowerBarrier, targetInY, allRunners, FINAL_RENDERED_BBOX_GAP_PX) &&
            finalYLegalForRailOwnership(lowerBarrier, targetInY, allRunners, contextIn)
          ) {
            lowerBarrier.y = targetInY;
            lowerBarrier.modelY = targetInY;
            break;
          }
        }
      }
    }
  }
}

function repairAllLineBarrierInversions(lines: SpeedMapRunner[][], allRunners: SpeedMapRunner[]) {
  for (const line of lines) {
    if (line.length >= 2) repairLineBarrierInversions(line, allRunners);
  }
}

function applyFinalRailOwnership(runners: SpeedMapRunner[], maxLane: number, raceNo?: string) {
  const lines = buildAllRunningLines(runners);

  enforceBarrierStackOrderForAllLines(lines, runners);
  applyRunningLineStackCompression(runners);
  enforceBarrierStackOrderForAllLines(lines, runners);

  applyFurthestLegalRailYInBarrierOrder(runners, lines);
  enforceBarrierStackOrderForAllLines(lines, runners);

  applyFinalRenderedBBoxValidation(runners, lines);
  enforceBarrierStackOrderForAllLines(lines, runners);
  repairAllLineBarrierInversions(lines, runners);

  logFinalRailOwnerDiagnostics(runners, lines, raceNo);
  syncRunnerLanesFromY(runners, maxLane);
  logBarrierOrderCheck(runners, raceNo);
}

function finalizeRenderedBoard(runners: SpeedMapRunner[], maxLane: number, raceNo?: string) {
  applyFinalRailOwnership(runners, maxLane, raceNo);
}

function runnerClearAtYNormWithGap(
  runner: SpeedMapRunner,
  candidateY: number,
  runners: SpeedMapRunner[],
  gapPx: number,
) {
  if (!satisfiesRailClearance(candidateY)) return false;
  const box = tileBoundingBoxPxFromPlacement(runner.x, candidateY);
  for (const other of runners) {
    if (other.id === runner.id) continue;
    if (tileBoxesViolateVisualClearance(box, runnerBoundingBoxPx(other), gapPx)) return false;
  }
  return true;
}

function findFirstRenderedBBoxOverlap(runners: SpeedMapRunner[], gapPx: number) {
  for (let i = 0; i < runners.length; i += 1) {
    for (let j = i + 1; j < runners.length; j += 1) {
      const a = runners[i]!;
      const b = runners[j]!;
      if (!tileBoxesViolateVisualClearance(runnerBoundingBoxPx(a), runnerBoundingBoxPx(b), gapPx)) continue;
      return { a, b };
    }
  }
  return null;
}

function countRenderedBBoxOverlapsWithGap(runners: SpeedMapRunner[], gapPx: number) {
  let count = 0;
  for (let i = 0; i < runners.length; i += 1) {
    for (let j = i + 1; j < runners.length; j += 1) {
      if (tileBoxesViolateVisualClearance(runnerBoundingBoxPx(runners[i]!), runnerBoundingBoxPx(runners[j]!), gapPx)) {
        count += 1;
      }
    }
  }
  return count;
}

function resolveRunnerYForBBoxOverlap(
  mover: SpeedMapRunner,
  other: SpeedMapRunner,
  runners: SpeedMapRunner[],
  gapPx: number,
): number | null {
  const tile = getSpeedMapTile();
  const minY = minPlacementYNorm();
  const maxInsideY = maxInsidePlacementYNorm();
  const moverBox = runnerBoundingBoxPx(mover);
  const otherBox = runnerBoundingBoxPx(other);
  const stepNorm = 1 / tile.boardHeightPx;
  const maxStepPx = Math.ceil(tile.boardHeightPx * 2);

  const tryY = (yNorm: number) => {
    const clamped = Math.max(minY, Math.min(maxInsideY, yNorm));
    return runnerClearAtYNormWithGap(mover, clamped, runners, gapPx) ? clamped : null;
  };

  const deltaPx = minVerticalDeltaPxToClearPair(moverBox, otherBox, gapPx);
  if (deltaPx !== null) {
    const direct = tryY(mover.y + deltaPx / tile.boardHeightPx);
    if (direct !== null) return direct;
  }

  for (let stepPx = 1; stepPx <= maxStepPx; stepPx += 1) {
    for (const dir of [-1, 1] as const) {
      const resolved = tryY(mover.y + dir * stepPx * stepNorm);
      if (resolved !== null) return resolved;
    }
  }

  return null;
}

function resolveRunnerYForFinalBBoxOverlap(
  mover: SpeedMapRunner,
  other: SpeedMapRunner,
  runners: SpeedMapRunner[],
  gapPx: number,
  lineMembers: SpeedMapRunner[],
): number | null {
  const tile = getSpeedMapTile();
  const minY = minPlacementYNorm();
  const maxInsideY = maxInsidePlacementYNorm();
  const stepNorm = 1 / tile.boardHeightPx;
  const maxStepPx = Math.ceil(tile.boardHeightPx * 2);

  const tryY = (yNorm: number) => {
    const clamped = Math.max(minY, Math.min(maxInsideY, yNorm));
    if (!runnerClearAtYNormWithGap(mover, clamped, runners, gapPx)) return null;
    if (!finalYLegalForRailOwnership(mover, clamped, runners, lineMembers)) return null;
    return clamped;
  };

  const moverBox = runnerBoundingBoxPx(mover);
  const otherBox = runnerBoundingBoxPx(other);
  const deltaPx = minVerticalDeltaPxToClearPair(moverBox, otherBox, gapPx);
  if (deltaPx !== null) {
    const outwardY = mover.y - Math.abs(deltaPx) / tile.boardHeightPx;
    const outward = tryY(outwardY);
    if (outward !== null) return outward;
    const inwardY = mover.y + Math.abs(deltaPx) / tile.boardHeightPx;
    const inward = tryY(inwardY);
    if (inward !== null) return inward;
  }

  for (let stepPx = 1; stepPx <= maxStepPx; stepPx += 1) {
    const outward = tryY(mover.y - stepPx * stepNorm);
    if (outward !== null) return outward;
  }

  for (let stepPx = 1; stepPx <= maxStepPx; stepPx += 1) {
    const inward = tryY(mover.y + stepPx * stepNorm);
    if (inward !== null) return inward;
  }

  return null;
}

function pickFinalBBoxOverlapMover(a: SpeedMapRunner, b: SpeedMapRunner) {
  const barrierA = barrierSortKey(a.barrier);
  const barrierB = barrierSortKey(b.barrier);
  if (barrierA !== barrierB) return barrierA > barrierB ? a : b;
  return a.y >= b.y ? a : b;
}

/** Issue 2 — zero overlapping tile bboxes after all other final passes (y-only). */
function applyFinalRenderedBBoxValidation(runners: SpeedMapRunner[], lines?: SpeedMapRunner[][]) {
  const gapPx = 0;

  for (let iter = 0; iter < FINAL_RENDERED_BBOX_PASS_MAX_ITER; iter += 1) {
    const hit = findFirstRenderedBBoxOverlap(runners, gapPx);
    if (!hit) break;

    const { a, b } = hit;
    const mover = pickFinalBBoxOverlapMover(a, b);
    const lineMembers = lines
      ? lineContextForRunner(mover, lines, runners)
      : runners.filter((runner) => runner.id === mover.id || runner.id === (mover === a ? b.id : a.id));
    const newY = resolveRunnerYForFinalBBoxOverlap(mover, mover === a ? b : a, runners, gapPx, lineMembers);
    if (newY === null || Math.abs(newY - mover.y) <= CROSSING_Y_TOL_NORM) break;

    mover.y = newY;
    mover.modelY = newY;
  }

  console.log("remainingOverlapsAfterFinalPass", countRenderedBBoxOverlapsWithGap(runners, gapPx));
}

/** Lane change inside permitted: cross in front (≤ inside−1.1) or cross behind (≥ inside+1.1). */
function crossingPermitsInsideMove(runnerWir: number, insideRunnerWir: number) {
  return canSettleInsideNeighbour(runnerWir, insideRunnerWir);
}

/** Runner at candidateY may sit inside insideRunner (higher y = toward rail). */
function insideMovePermittedAtY(
  runnerWir: number,
  insideRunnerWir: number,
  candidateY: number,
  insideRunnerY: number,
) {
  if (candidateY <= insideRunnerY + CROSSING_Y_TOL_NORM) return true;
  if (speedsWithinCrossingPack(runnerWir, insideRunnerWir)) return false;
  return crossingPermitsInsideMove(runnerWir, insideRunnerWir);
}

function pairInsideMovePermittedAtY(
  wirA: number,
  yA: number,
  wirB: number,
  yB: number,
) {
  if (yA > yB + CROSSING_Y_TOL_NORM && !insideMovePermittedAtY(wirA, wirB, yA, yB)) return false;
  if (yB > yA + CROSSING_Y_TOL_NORM && !insideMovePermittedAtY(wirB, wirA, yB, yA)) return false;
  return true;
}

function laneSeparationYNorm() {
  const tile = getSpeedMapTile();
  return laneStepPx(tile) / tile.boardHeightPx;
}

/** Higher barrier inside lower barrier only when a legal inside crossing exists (and not same-speed pack). */
function crossingPermitsHigherInsideLower(high: PlacedTile, low: PlacedTile) {
  if (speedsWithinCrossingPack(high.wIr, low.wIr)) return false;
  return crossingPermitsInsideMove(high.wIr, low.wIr);
}

/**
 * Higher barrier is wrongly at/inside a nearby lower barrier (inside = higher y / toward rail).
 */
function higherBarrierInsideLowerViolation(high: PlacedTile, low: PlacedTile) {
  if (low.barrier >= high.barrier) return false;
  if (!tilesWithinReclaimProximity(high.x, high.y, low)) return false;
  if (crossingPermitsHigherInsideLower(high, low)) return false;
  return high.y >= low.y - CROSSING_Y_TOL_NORM;
}

/** Block railward move when crossing inside is not permitted (same-speed pack → barrier order only). */
function barrierBlocksRailwardMove(mover: PlacedTile, candidateY: number, other: PlacedTile) {
  if (mover.barrier <= other.barrier) return false;
  if (!tilesWithinReclaimProximity(mover.x, candidateY, other)) return false;
  if (candidateY <= other.y + CROSSING_Y_TOL_NORM) return false;
  if (speedsWithinCrossingPack(mover.wIr, other.wIr)) return true;
  return !crossingPermitsInsideMove(mover.wIr, other.wIr);
}

function tilesWithinReclaimProximity(moverX: number, moverYNorm: number, other: PlacedTile) {
  const tile = getSpeedMapTile();
  const moverRect = tileRectNormFromPlacement(moverX, moverYNorm, tile);
  const otherRect = other.rect;
  const moverCenterXPx = ((moverRect.left + moverRect.right) / 2) * tile.boardWidthPx;
  const otherCenterXPx = ((otherRect.left + otherRect.right) / 2) * tile.boardWidthPx;
  const dxPx = Math.abs(moverCenterXPx - otherCenterXPx);
  const dyPx = Math.abs(moverYNorm - other.y) * tile.boardHeightPx;
  return (
    dxPx <= tile.WIDTH * BARRIER_PROXIMITY_X_TILES &&
    dyPx <= laneStepPx(tile) * BARRIER_PROXIMITY_LANE_STEPS
  );
}

/**
 * Crossing / settling + barrier depth for railward (downward) moves.
 * Inside = higher y (toward rail). Lower barrier has inside priority when speeds are similar.
 */
function settlingRuleAllowsAtY(mover: PlacedTile, candidateY: number, other: PlacedTile) {
  if (!tilesWithinReclaimProximity(mover.x, candidateY, other)) return true;
  if (!pairInsideMovePermittedAtY(mover.wIr, candidateY, other.wIr, other.y)) return false;

  if (speedsWithinCrossingPack(mover.wIr, other.wIr)) {
    const low = mover.barrier < other.barrier ? mover : other;
    const high = low === mover ? other : mover;
    const lowY = low === mover ? candidateY : other.y;
    const highY = high === mover ? candidateY : other.y;
    if (Math.abs(candidateY - other.y) <= CROSSING_Y_TOL_NORM) return true;
    return lowY >= highY - CROSSING_Y_TOL_NORM;
  }

  return true;
}

function settlingBlockedAtY(tile: PlacedTile, candidateY: number, placed: PlacedTile[]) {
  for (const other of placed) {
    if (other.runnerId === tile.runnerId) continue;
    if (barrierBlocksRailwardMove(tile, candidateY, other)) return true;
    if (!settlingRuleAllowsAtY(tile, candidateY, other)) return true;
  }
  return false;
}

function railCompressionBlockedAtY(tile: PlacedTile, candidateY: number, placed: PlacedTile[]) {
  if (!satisfiesRailClearance(candidateY)) return true;
  return settlingBlockedAtY(tile, candidateY, placed);
}

/** Final rail reclaim: rail clearance, tile overlap, 1.1 w_ir, barrier depth. */
function finalRailReclaimBlockedAtY(tile: PlacedTile, candidateY: number, placed: PlacedTile[]) {
  if (!satisfiesRailClearance(candidateY)) return true;
  if (settlingBlockedAtY(tile, candidateY, placed)) return true;
  const probeRect = tileRectNormFromPlacement(tile.x, candidateY);
  for (const other of placed) {
    if (other.runnerId === tile.runnerId) continue;
    if (rectsOverlap2D(probeRect, other.rect)) return true;
  }
  return false;
}

function tryMovePlacedTileDownPx(
  tile: PlacedTile,
  deltaPx: number,
  placed: PlacedTile[],
  blockedAtY: (tile: PlacedTile, candidateY: number, placed: PlacedTile[]) => boolean,
) {
  const boardH = getSpeedMapTile().boardHeightPx;
  const nextAnchorPx = tile.y * boardH + deltaPx;
  const candidateY = nextAnchorPx / boardH;
  if (blockedAtY(tile, candidateY, placed)) return false;
  tile.y = yNormFromAnchorPx(nextAnchorPx);
  syncPlacedTileGeometry(tile);
  return true;
}

function syncPlacedTileLane(tile: PlacedTile, maxLane: number) {
  tile.lane = yToLane(tile.y, maxLane);
}

const railPrioritySortKey = (a: PlacedTile, b: PlacedTile) =>
  a.barrier - b.barrier || a.wIr - b.wIr || a.no - b.no;

function applyRailPriorityCompressionPass(placed: PlacedTile[]) {
  const order = [...placed].sort(railPrioritySortKey);
  for (const tile of order) {
    while (tryMovePlacedTileDownPx(tile, 1, placed, railCompressionBlockedAtY)) {
      // tactical compression — crossing + rail only
    }
  }
}

function applyRailPriorityCompression(placed: PlacedTile[]) {
  applyRailPriorityCompressionPass(placed);
  applyRailPriorityCompressionPass(placed);
}

/**
 * Repair packs: lower barrier inside (rail); higher stays outside unless ≥1.1 w_ir faster (cross in front).
 */
function enforceBarrierDepthViolations(placed: PlacedTile[], maxLane: number) {
  const laneSep = laneSeparationYNorm();
  const maxPasses = Math.max(10, placed.length * 4);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = 0; j < placed.length; j += 1) {
        if (i === j) continue;
        const a = placed[i]!;
        const b = placed[j]!;
        const low = a.barrier < b.barrier ? a : b;
        const high = a.barrier < b.barrier ? b : a;
        if (!higherBarrierInsideLowerViolation(high, low)) continue;

        const targetOutsideY = low.y - laneSep;

        while (higherBarrierInsideLowerViolation(high, low)) {
          let moved = false;
          while (
            high.y > targetOutsideY + CROSSING_Y_TOL_NORM &&
            tryMovePlacedTileUpPxChecked(high, 1, placed)
          ) {
            moved = true;
            changed = true;
          }
          if (!higherBarrierInsideLowerViolation(high, low)) break;
          if (tryMovePlacedTileDownPx(low, 1, placed, finalRailReclaimBlockedAtY)) {
            moved = true;
            changed = true;
            continue;
          }
          if (!moved) break;
        }

        syncPlacedTileLane(low, maxLane);
        syncPlacedTileLane(high, maxLane);
      }
    }

    if (!changed) break;
  }
}

/**
 * After placement + collision + visual padding: legal rail reclaim (x fixed).
 * Lower barriers first; repeat until stable so inside gaps close when legal.
 */
function applyFinalRailReclaim(placed: PlacedTile[], maxLane: number) {
  const order = [...placed].sort(railPrioritySortKey);
  const maxPasses = Math.max(6, placed.length * 2);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let anyMoved = false;
    for (const tile of order) {
      while (tryMovePlacedTileDownPx(tile, 1, placed, finalRailReclaimBlockedAtY)) {
        anyMoved = true;
      }
      syncPlacedTileLane(tile, maxLane);
    }
    if (!anyMoved) break;
  }

  enforceBarrierDepthViolations(placed, maxLane);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let anyMoved = false;
    for (const tile of order) {
      while (tryMovePlacedTileDownPx(tile, 1, placed, finalRailReclaimBlockedAtY)) {
        anyMoved = true;
      }
      syncPlacedTileLane(tile, maxLane);
    }
    if (!anyMoved) break;
  }

  enforceBarrierDepthViolations(placed, maxLane);
}

function normalizeRaceNoKey(raceNo: string | undefined) {
  return (raceNo ?? "").trim().replace(/^R/i, "");
}

function syncPositionedRunnerY(runner: SpeedMapRunner, y: number, maxLane: number) {
  runner.y = y;
  runner.modelY = y;
  runner.lane = yToLane(y, maxLane);
}

function runnerNumber(runner: SpeedMapRunner): number {
  const raw = (runner as SpeedMapRunner & { number?: number }).number ?? runner.no;
  return Number(raw);
}

function findPositionedByNumber(positioned: SpeedMapRunner[], number: number) {
  return positioned.find((r) => runnerNumber(r) === number);
}

function findRenderedRunner(
  positioned: SpeedMapRunner[],
  number: number,
  horseNeedle?: string,
) {
  const byNumber = findPositionedByNumber(positioned, number);
  if (byNumber) return byNumber;
  if (!horseNeedle) return undefined;
  const needle = horseNeedle.toLowerCase();
  return positioned.find((r) => r.horse.toLowerCase().includes(needle));
}

/** Race 2 only: #17 on #15's line, then minimum 1px upward steps until visually clear. */
function applyRace2Runner17TacticalRefinement(positioned: SpeedMapRunner[], maxLane: number) {
  const r15 = findRenderedRunner(positioned, 15, "spenzalot");
  const r17 = findRenderedRunner(positioned, 17, "favour");
  if (!r15 || !r17) return;
  const tile = getSpeedMapTile();
  const VISUAL_GAP = 8;
  const yStepPx = 1 / tile.boardHeightPx;
  const { minTileTop } = boardTileTopLimitsPx();
  const minY = yNormFromAnchorPx(minTileTop + tile.ANCHOR_OFFSET_Y);

  syncPositionedRunnerY(r17, r15.y, maxLane);
  let safety = 0;
  while (visualRunnersOverlap(r17, r15, VISUAL_GAP) && safety < 200) {
    const nextY = Math.max(minY, r17.y - yStepPx);
    if (nextY === r17.y) break;
    syncPositionedRunnerY(r17, nextY, maxLane);
    safety += 1;
  }
}

function renderedRunnersOverlap(a: SpeedMapRunner, b: SpeedMapRunner) {
  return visualRunnersOverlap(a, b, COLLISION_PAD_X, COLLISION_PAD_Y);
}

function visualRunnersOverlap(
  a: SpeedMapRunner,
  b: SpeedMapRunner,
  visualPadPx: number,
  visualPadYPx: number = visualPadPx,
) {
  const tile = getSpeedMapTile();
  const tileWidth = tile.WIDTH;
  const tileHeight = tile.HEIGHT;
  const ax = a.x * tile.boardWidthPx;
  const ay = tileTopPxFromYNorm(a.y, tile);
  const bx = b.x * tile.boardWidthPx;
  const by = tileTopPxFromYNorm(b.y, tile);
  return !(
    ax + tileWidth - visualPadPx <= bx ||
    ax + visualPadPx >= bx + tileWidth ||
    ay + tileHeight - visualPadYPx <= by ||
    ay + visualPadYPx >= by + tileHeight
  );
}

/**
 * Final rendered-array fixes (Races 2 & 7). Mutates runners in place; x unchanged.
 * Call after placement and again on the array passed to HorseTile.
 */
function applyFinalRenderedRaceFixes(
  positioned: SpeedMapRunner[],
  raceNo: string | undefined,
  maxLane: number,
) {
  const laneStep = laneSeparationYNorm();
  const tile = getSpeedMapTile();
  const tileHeight = tile.HEIGHT / tile.boardHeightPx;
  const { minTileTop } = boardTileTopLimitsPx();
  const minY = yNormFromAnchorPx(minTileTop + tile.ANCHOR_OFFSET_Y);
  const raceKey = normalizeRaceNoKey(raceNo);

  const overlaps = (a: SpeedMapRunner, b: SpeedMapRunner) => renderedRunnersOverlap(a, b);

  const moveAboveUntilClear = (
    runner: SpeedMapRunner | undefined,
    blockers: Array<SpeedMapRunner | undefined>,
  ) => {
    if (!runner) return;
    const blockerList = blockers.filter((b): b is SpeedMapRunner => Boolean(b));
    let safety = 0;
    while (blockerList.some((b) => overlaps(runner, b)) && safety < 20) {
      const nextY = Math.max(minY, runner.y - laneStep);
      if (nextY === runner.y) break;
      syncPositionedRunnerY(runner, nextY, maxLane);
      safety += 1;
    }
  };

  if (raceKey === "2") {
    const r1 = findPositionedByNumber(positioned, 1);
    const r17 = findPositionedByNumber(positioned, 17);
    if (r1 && r17) {
      if (r17.y >= r1.y - laneStep) {
        syncPositionedRunnerY(r17, r1.y - laneStep, maxLane);
      }
      moveAboveUntilClear(r17, [r1]);
    }
  }

  if (raceKey === "7") {
    const r4 = findPositionedByNumber(positioned, 4);
    const r13 = findPositionedByNumber(positioned, 13);
    const r5 = findPositionedByNumber(positioned, 5);
    const r7 = findPositionedByNumber(positioned, 7);
    const r11 = findPositionedByNumber(positioned, 11);

    if (r4 && r13 && r5) {
      const insideY = Math.max(r4.y, r13.y);
      syncPositionedRunnerY(r4, insideY, maxLane);
      syncPositionedRunnerY(r13, insideY - laneStep, maxLane);
      syncPositionedRunnerY(r5, r13.y - laneStep, maxLane);
    }

    if (r7 && r5) {
      const minGap = tileHeight + 6 / tile.boardHeightPx;
      if (Math.abs(r7.y - r5.y) < minGap) {
        syncPositionedRunnerY(r7, r5.y - minGap, maxLane);
      }
    }

    if (r13 && r11) {
      syncPositionedRunnerY(r11, r13.y, maxLane);
      moveAboveUntilClear(r11, [r13, r5]);
    }

    const insideLine = findPositionedByNumber(positioned, 19);
    if (r7 && insideLine) {
      r7.x = insideLine.x;
      r7.modelX = r7.x;
      const yNudge = laneStep * 0.35;
      let safety = 0;
      while (overlaps(r7, insideLine) && safety < 20) {
        const nextY = Math.max(minY, r7.y - yNudge);
        if (nextY === r7.y) break;
        syncPositionedRunnerY(r7, nextY, maxLane);
        safety += 1;
      }
    }
  }

  if (raceKey === "2") {
    applyRace2Runner17TacticalRefinement(positioned, maxLane);
  }
}

function columnKeyFromXNorm(xNorm: number) {
  const tile = getSpeedMapTile();
  const xPx = xNorm * tile.boardWidthPx;
  return Math.round(xPx / columnKeyDivisorPx());
}

function columnsAreNeighbours(colA: number, colB: number) {
  return Math.abs(colA - colB) <= 1;
}

/** True if tile boxes overlap at (x, y) against an already-resolved runner. */
function overlapsTileAt(
  xNorm: number,
  yNorm: number,
  other: PlacedTile,
): boolean {
  const probe = tileRectNormFromPlacement(xNorm, yNorm);
  return rectsOverlap2D(probe, other.rect);
}

function tilesHorizontallyOverlapOrNear(a: TileRectNorm, b: TileRectNorm) {
  const pad = gapHalfNormX() * 2;
  return a.left < b.right + pad && a.right + pad > b.left;
}

/**
 * During collision: same tactical line, |Δx| < tile width, similar w_ir, same depth —
 * higher barrier may not sit inside a lower barrier without a legal cross in front.
 */
function localBarrierBlocksCollisionY(
  mover: PlacedTile,
  candidateY: number,
  other: PlacedTile,
  maxLane: number,
): boolean {
  if (other.runnerId === mover.runnerId) return false;
  if (tacticalLaneIndex(mover, maxLane) !== tacticalLaneIndex(other, maxLane)) return false;
  if (Math.abs(mover.x - other.x) >= tileWidthNorm()) return false;
  if (Math.abs(mover.wIr - other.wIr) < CROSS_INSIDE_WIR_MARGIN) {
    if (mover.barrier <= other.barrier) return false;
    const moverInside = candidateY > other.y + CROSSING_Y_TOL_NORM;
    const sameDepth = Math.abs(candidateY - other.y) <= CROSSING_Y_TOL_NORM;
    return moverInside || sameDepth;
  }

  const probeRect = tileRectNormFromPlacement(mover.x, candidateY);
  if (!tilesHorizontallyOverlapOrNear(probeRect, other.rect)) return false;

  const moverInside = candidateY > other.y + CROSSING_Y_TOL_NORM;
  const sameDepth = Math.abs(candidateY - other.y) <= CROSSING_Y_TOL_NORM;
  if (!moverInside && !sameDepth) return false;
  if (mover.barrier <= other.barrier) return false;

  return !insideMovePermittedAtY(mover.wIr, other.wIr, candidateY, other.y);
}

function localBarrierBlocksCollisionWithResolved(
  mover: PlacedTile,
  candidateY: number,
  resolved: PlacedTile[],
  maxLane: number,
) {
  for (const other of resolved) {
    if (localBarrierBlocksCollisionY(mover, candidateY, other, maxLane)) return true;
  }
  return false;
}

function minPlacementYNorm() {
  const { minTileTop } = boardTileTopLimitsPx();
  return yNormFromAnchorPx(minTileTop + getSpeedMapTile().ANCHOR_OFFSET_Y);
}

function maxInsidePlacementYNorm() {
  const { maxTileTop } = boardTileTopLimitsPx();
  return yNormFromAnchorPx(anchorPxFromTileTopPx(maxTileTop));
}

function tacticalLaneIndex(tile: PlacedTile, maxLane: number) {
  return yToLane(tile.tacticalY, maxLane);
}

/** Same tactical column (w_ir lane ownership) — rail / line / 3-wide / 4-wide are not interchangeable. */
function sameTacticalColumn(a: PlacedTile, b: PlacedTile) {
  return columnKeyFromXNorm(a.x) === columnKeyFromXNorm(b.x);
}

function overlapsAnyInColumnAt(
  tile: PlacedTile,
  candidateY: number,
  others: PlacedTile[],
  excludeRunnerId: string,
) {
  const probe = tileRectNormFromPlacement(tile.x, candidateY);
  for (const other of others) {
    if (other.runnerId === excludeRunnerId) continue;
    if (!sameTacticalColumn(tile, other)) continue;
    if (rectsOverlap2D(probe, other.rect)) return true;
  }
  return false;
}

/** Small y/x nudges only — never reassign tactical lane for packing. */
function resolveVisualOverlapInColumn(tile: PlacedTile, others: PlacedTile[], maxLane: number) {
  const metrics = getSpeedMapTile();
  const stepNorm = 1 / metrics.boardHeightPx;
  const minY = minPlacementYNorm();
  const maxInsideY = maxInsidePlacementYNorm();
  const anchor0 = tile.y * metrics.boardHeightPx;

  const tryAt = (candidateY: number, candidateX = tile.x) => {
    if (candidateY < minY - CROSSING_Y_TOL_NORM || candidateY > maxInsideY + CROSSING_Y_TOL_NORM) {
      return false;
    }
    if (!satisfiesRailClearance(candidateY)) return false;
    if (localBarrierBlocksCollisionWithResolved({ ...tile, x: candidateX }, candidateY, others, maxLane)) {
      return false;
    }
    if (overlapsAnyInColumnAt({ ...tile, x: candidateX }, candidateY, others, tile.runnerId)) {
      return false;
    }
    tile.x = candidateX;
    tile.y = candidateY;
    syncPlacedTileGeometry(tile);
    syncPlacedTileLane(tile, maxLane);
    return true;
  };

  if (!overlapsAnyInColumnAt(tile, tile.y, others, tile.runnerId)) return;

  for (let px = 1; px <= VISUAL_NUDGE_MAX_PX; px += 1) {
    const d = px * stepNorm;
    if (Math.abs(tile.y * metrics.boardHeightPx - anchor0) > VISUAL_NUDGE_MAX_PX + 0.5) break;
    if (tryAt(tile.y - d)) return;
    if (tryAt(tile.y + d)) return;
  }

  const xStep = metrics.WIDTH * 0.04 / metrics.boardWidthPx;
  const maxLeft = (metrics.boardWidthPx - metrics.WIDTH) / metrics.boardWidthPx;
  for (let px = 1; px <= 6; px += 1) {
    const dx = px * xStep;
    for (const sign of [-1, 1] as const) {
      const x = Math.max(0, Math.min(maxLeft, tile.x + sign * dx));
      if (tryAt(tile.y, x)) return;
      if (tryAt(tile.y - px * stepNorm, x)) return;
      if (tryAt(tile.y + px * stepNorm, x)) return;
    }
  }
}

/** Same tactical line, |Δx| < tile width, vertically stacked — barrier tie-break only. */
function localPairQualifiesForBarrierLaneOrder(a: PlacedTile, b: PlacedTile, maxLane: number) {
  if (tacticalLaneIndex(a, maxLane) !== tacticalLaneIndex(b, maxLane)) return false;
  if (Math.abs(a.x - b.x) >= tileWidthNorm()) return false;
  const laneSep = laneSeparationYNorm();
  return a.rect.top < b.rect.bottom + laneSep && a.rect.bottom + laneSep > b.rect.top;
}

function localBarrierPairOutOfOrder(low: PlacedTile, high: PlacedTile) {
  if (crossingPermitsHigherInsideLower(high, low)) return false;
  const highInside = high.y >= low.y - CROSSING_Y_TOL_NORM;
  const lowTooWide = low.y < high.y - CROSSING_Y_TOL_NORM;
  return highInside || lowTooWide;
}

/** One-lane nudge for overlapping pairs on the same tactical line; inside = higher y. */
function applyLocalBarrierPairwiseOrder(placed: PlacedTile[], maxLane: number) {
  const laneSep = laneSeparationYNorm();
  const minY = minPlacementYNorm();
  const maxInsideY = maxInsidePlacementYNorm();
  const maxPasses = Math.max(8, placed.length * 2);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i]!;
        const b = placed[j]!;
        if (!localPairQualifiesForBarrierLaneOrder(a, b, maxLane)) continue;

        const low = a.barrier < b.barrier ? a : b;
        const high = a.barrier < b.barrier ? b : a;
        if (!localBarrierPairOutOfOrder(low, high)) continue;

        if (high.y >= low.y - CROSSING_Y_TOL_NORM) {
          const widerY = Math.max(minY, low.y - laneSep);
          if (high.y > widerY + CROSSING_Y_TOL_NORM) {
            high.y = widerY;
            syncPlacedTileGeometry(high);
            syncPlacedTileLane(high, maxLane);
            changed = true;
          }
        } else if (low.y < high.y - CROSSING_Y_TOL_NORM) {
          const insideY = Math.min(maxInsideY, high.y + laneSep);
          if (low.y < insideY - CROSSING_Y_TOL_NORM && satisfiesRailClearance(insideY)) {
            low.y = insideY;
            syncPlacedTileGeometry(low);
            syncPlacedTileLane(low, maxLane);
            changed = true;
          }
        }
      }
    }

    if (!changed) break;
  }
}

function tilesShareLocalColumn(a: PlacedTile, b: PlacedTile) {
  return Math.abs(a.x - b.x) < tileWidthNorm() || tilesHorizontallyOverlap(a.rect, b.rect);
}

function countPlacementIntersections(placed: PlacedTile[]) {
  let count = 0;
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      if (rectsOverlap2D(placed[i]!.rect, placed[j]!.rect)) count += 1;
    }
  }
  return count;
}

function anyPlacementTileOverlaps(placed: PlacedTile[]) {
  return countPlacementIntersections(placed) > 0;
}

function isClearAtY(tile: PlacedTile, candidateY: number, placed: PlacedTile[]) {
  if (!satisfiesRailClearance(candidateY)) return false;
  const probe = tileRectNormFromPlacement(tile.x, candidateY);
  for (const other of placed) {
    if (other.runnerId === tile.runnerId) continue;
    if (rectsOverlap2D(probe, other.rect)) return false;
  }
  return true;
}

function tileOverlapsAnyOther(tile: PlacedTile, placed: PlacedTile[]) {
  for (const other of placed) {
    if (other.runnerId === tile.runnerId) continue;
    if (rectsOverlap2D(tile.rect, other.rect)) return true;
  }
  return false;
}

/**
 * Nearest clear y from original: originalY → toward rail (higher y) → toward outside (lower y).
 * Lane 0 = inside/rail; higher lane index = wider / top of map.
 */
function nearestClearYFromOriginal(tile: PlacedTile, placed: PlacedTile[], maxLane: number) {
  const minY = minPlacementYNorm();
  const maxInsideY = maxInsidePlacementYNorm();
  const originalY = Math.max(minY, Math.min(maxInsideY, tile.originalY));

  if (isClearAtY(tile, originalY, placed)) return originalY;

  const baseLane = yToLane(originalY, maxLane);
  const searchDepth = maxLane + 8;

  for (let k = 1; k <= searchDepth; k += 1) {
    const railLane = baseLane - k;
    if (railLane < 0) break;
    const railY = laneToYNorm(railLane);
    if (railY >= minY - CROSSING_Y_TOL_NORM && isClearAtY(tile, railY, placed)) {
      return Math.max(minY, Math.min(maxInsideY, railY));
    }
  }

  for (let k = 1; k <= searchDepth; k += 1) {
    const wideLane = baseLane + k;
    const wideY = laneToYNorm(wideLane);
    if (wideY <= maxInsideY + CROSSING_Y_TOL_NORM && isClearAtY(tile, wideY, placed)) {
      return Math.max(minY, Math.min(maxInsideY, wideY));
    }
  }

  return tile.y;
}

function overlapOnlyBlockedAtY(tile: PlacedTile, candidateY: number, placed: PlacedTile[]) {
  if (!satisfiesRailClearance(candidateY)) return true;
  return !isClearAtY(tile, candidateY, placed);
}

function tryMoveTowardRailPx(tile: PlacedTile, deltaPx: number, placed: PlacedTile[]) {
  return tryMovePlacedTileDownPx(tile, deltaPx, placed, overlapOnlyBlockedAtY);
}

function tryMoveTowardOutsidePx(tile: PlacedTile, deltaPx: number, placed: PlacedTile[]) {
  const metrics = getSpeedMapTile();
  const { minTileTop } = boardTileTopLimitsPx();
  const minAnchorPx = minTileTop + metrics.ANCHOR_OFFSET_Y;
  const nextAnchorPx = tile.y * metrics.boardHeightPx - deltaPx;
  const candidateY = nextAnchorPx / metrics.boardHeightPx;
  if (nextAnchorPx < minAnchorPx) return false;
  if (overlapOnlyBlockedAtY(tile, candidateY, placed)) return false;
  tile.y = yNormFromAnchorPx(nextAnchorPx);
  syncPlacedTileGeometry(tile);
  return true;
}

function tilesStillOverlap(a: PlacedTile, b: PlacedTile) {
  return rectsOverlap2D(a.rect, b.rect);
}

function resolveOverlappingPair(a: PlacedTile, b: PlacedTile, placed: PlacedTile[], maxLane: number) {
  if (!sameTacticalColumn(a, b)) return false;

  const movers = [a, b].sort(
    (left, right) =>
      Math.abs(right.y - right.originalY) - Math.abs(left.y - left.originalY) ||
      right.originalY - left.originalY,
  );

  for (const tile of movers) {
    const beforeY = tile.y;
    const beforeX = tile.x;
    resolveVisualOverlapInColumn(tile, placed, maxLane);
    if (tile.y !== beforeY || tile.x !== beforeX) {
      syncPlacedTileGeometry(tile);
      syncPlacedTileLane(tile, maxLane);
      if (!tilesStillOverlap(a, b)) return true;
    }
  }

  return false;
}

/**
 * Phase 2 — resolve every intersecting pair; do not exit until remainingIntersections is 0.
 */
function applyPhase2OverlapResolution(placed: PlacedTile[], maxLane: number) {
  const maxIter = Math.max(placed.length * placed.length * 24, 256);

  for (let iter = 0; iter < maxIter; iter += 1) {
    const remainingIntersections = countPlacementIntersections(placed);
    if (remainingIntersections === 0) {
      if (process.env.NODE_ENV === "development") {
        console.log("[SpeedMap] remainingIntersections", 0);
      }
      return;
    }

    let changed = false;
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i]!;
        const b = placed[j]!;
        if (!tilesStillOverlap(a, b)) continue;
        if (resolveOverlappingPair(a, b, placed, maxLane)) changed = true;
      }
    }

    if (!changed) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[SpeedMap] remainingIntersections", remainingIntersections, "stuck after iter", iter);
      }
      break;
    }
  }
}

/**
 * Phase 3 — from current y, find the furthest legal position toward the rail (highest y).
 */
function lowestClearRailY(tile: PlacedTile, placed: PlacedTile[], maxLane: number) {
  const minY = minPlacementYNorm();
  const maxInsideY = maxInsidePlacementYNorm();
  const startLane = yToLane(tile.y, maxLane);
  const searchDepth = maxLane + 8;

  let furthestRailY = Math.max(minY, Math.min(maxInsideY, tile.y));
  if (!isClearAtY(tile, furthestRailY, placed)) return tile.y;

  for (let k = 0; k <= searchDepth; k += 1) {
    const railLane = startLane - k;
    if (railLane < 0) break;
    const railY = laneToYNorm(railLane);
    if (railY < minY - CROSSING_Y_TOL_NORM || railY > maxInsideY + CROSSING_Y_TOL_NORM) break;
    if (!isClearAtY(tile, railY, placed)) break;
    furthestRailY = railY;
  }

  return furthestRailY;
}

function applyPhase3DownwardCompression(placed: PlacedTile[], maxLane: number) {
  const order = [...placed].sort((a, b) => b.originalY - a.originalY || a.barrier - b.barrier);

  for (const tile of order) {
    const targetY = lowestClearRailY(tile, placed, maxLane);
    if (Math.abs(targetY - tile.y) <= CROSSING_Y_TOL_NORM) continue;
    tile.y = targetY;
    syncPlacedTileGeometry(tile);
    syncPlacedTileLane(tile, maxLane);
  }
}

const FINAL_RENDERED_BBOX_PASS_MAX_ITER = 50;
const FINAL_RENDERED_BBOX_GAP_PX = 6;

function runnerBoundingBoxPx(runner: SpeedMapRunner) {
  return tileBoundingBoxPxFromPlacement(runner.x, runner.y);
}

function countRenderedBBoxOverlaps(runners: SpeedMapRunner[]) {
  let count = 0;
  for (let i = 0; i < runners.length; i += 1) {
    for (let j = i + 1; j < runners.length; j += 1) {
      const boxA = runnerBoundingBoxPx(runners[i]!);
      const boxB = runnerBoundingBoxPx(runners[j]!);
      if (tileBoxesViolateVisualClearance(boxA, boxB, FINAL_RENDERED_BBOX_GAP_PX)) count += 1;
    }
  }
  return count;
}

function runnerClearAtYNorm(runner: SpeedMapRunner, candidateY: number, runners: SpeedMapRunner[]) {
  if (!satisfiesRailClearance(candidateY)) return false;
  const box = tileBoundingBoxPxFromPlacement(runner.x, candidateY);
  for (const other of runners) {
    if (other.id === runner.id) continue;
    if (tileBoxesViolateVisualClearance(box, runnerBoundingBoxPx(other), FINAL_RENDERED_BBOX_GAP_PX)) {
      return false;
    }
  }
  return true;
}

function findFirstRenderedCardOverlap(runners: SpeedMapRunner[]) {
  for (let i = 0; i < runners.length; i += 1) {
    for (let j = i + 1; j < runners.length; j += 1) {
      const a = runners[i]!;
      const b = runners[j]!;
      const boxA = runnerBoundingBoxPx(a);
      const boxB = runnerBoundingBoxPx(b);
      if (!tileBoxesViolateVisualClearance(boxA, boxB, FINAL_RENDERED_BBOX_GAP_PX)) continue;
      const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
      const overlapY = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);
      return { a, b, overlapX, overlapY };
    }
  }
  return null;
}

/** Smallest vertical move clearing pair — visual only, no barrier/lane reordering. */
function resolveRunnerYForScreenOverlap(
  mover: SpeedMapRunner,
  other: SpeedMapRunner,
  runners: SpeedMapRunner[],
): number | null {
  const tile = getSpeedMapTile();
  const minY = minPlacementYNorm();
  const maxInsideY = maxInsidePlacementYNorm();
  const moverBox = runnerBoundingBoxPx(mover);
  const otherBox = runnerBoundingBoxPx(other);
  const stepNorm = 1 / tile.boardHeightPx;
  const maxStepPx = Math.ceil(tile.boardHeightPx * 2);

  const tryY = (yNorm: number) => {
    const clamped = Math.max(minY, Math.min(maxInsideY, yNorm));
    return runnerClearAtYNorm(mover, clamped, runners) ? clamped : null;
  };

  const deltaPx = minVerticalDeltaPxToClearPair(moverBox, otherBox, FINAL_RENDERED_BBOX_GAP_PX);
  if (deltaPx !== null) {
    const direct = tryY(mover.y + deltaPx / tile.boardHeightPx);
    if (direct !== null) return direct;
  }

  for (let stepPx = 1; stepPx <= maxStepPx; stepPx += 1) {
    for (const dir of [-1, 1]) {
      const yNorm = mover.y + dir * stepPx * stepNorm;
      const resolved = tryY(yNorm);
      if (resolved !== null) return resolved;
    }
  }

  return null;
}

/**
 * Mandatory last pass on final rendered card positions (CSS bbox). Runs after all barrier/gravity
 * adjustments; overlap clearance is the only goal (y-only, x unchanged).
 */
function applyFinalScreenOverlapPass(runners: SpeedMapRunner[]) {
  if (runners.length < 2) {
    console.log("remainingOverlapsAfterFinalPass", 0);
    return;
  }

  for (let iter = 0; iter < FINAL_RENDERED_BBOX_PASS_MAX_ITER; iter += 1) {
    const hit = findFirstRenderedCardOverlap(runners);
    if (!hit) break;

    const { a, b } = hit;
    const mover = a.y >= b.y ? a : b;
    const other = mover === a ? b : a;
    let pairResolved = false;

    for (let subPass = 0; subPass < FINAL_RENDERED_BBOX_PASS_MAX_ITER; subPass += 1) {
      const moverBox = runnerBoundingBoxPx(mover);
      const otherBox = runnerBoundingBoxPx(other);
      if (!tileBoxesViolateVisualClearance(moverBox, otherBox, FINAL_RENDERED_BBOX_GAP_PX)) {
        pairResolved = true;
        break;
      }

      const newY = resolveRunnerYForScreenOverlap(mover, other, runners);
      if (newY === null || Math.abs(newY - mover.y) <= CROSSING_Y_TOL_NORM) break;

      mover.y = newY;
      mover.modelY = newY;
    }

    if (!pairResolved) break;
  }

  console.log("remainingOverlapsAfterFinalPass", countRenderedBBoxOverlaps(runners));
}

const VISUAL_CLEANUP_GAP_PX = 4;
const VISUAL_CLEANUP_STEP_PX = 4;
const VISUAL_CLEANUP_X_STAGGER_PX = 6;

/**
 * Last pass after tactical placement: separate overlapping tile bboxes only.
 * Protects rail-side tiles (higher y); nudges wider/outside tiles up (lower y), never toward rail.
 */
function applyFinalVisualCollisionCleanup(runners: SpeedMapRunner[]) {
  if (runners.length < 2) return;

  const tile = getSpeedMapTile();
  const stepNorm = VISUAL_CLEANUP_STEP_PX / tile.boardHeightPx;
  const maxUpPx = tile.HEIGHT + 8;
  const xStaggerNorm = VISUAL_CLEANUP_X_STAGGER_PX / tile.boardWidthPx;
  const minY = minPlacementYNorm();
  const maxLeft = (tile.boardWidthPx - tile.WIDTH) / tile.boardWidthPx;
  const maxPasses = Math.max(16, runners.length * 3);

  const pairOverlaps = (a: SpeedMapRunner, b: SpeedMapRunner) =>
    tileBoxesViolateVisualClearance(
      runnerBoundingBoxPx(a),
      runnerBoundingBoxPx(b),
      VISUAL_CLEANUP_GAP_PX,
    );

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    const sorted = [...runners].sort((a, b) => b.y - a.y || a.x - b.x || a.no - b.no);

    for (let i = 0; i < sorted.length; i += 1) {
      const protectedRunner = sorted[i]!;
      for (let j = i + 1; j < sorted.length; j += 1) {
        const mover = sorted[j]!;
        if (!pairOverlaps(protectedRunner, mover)) continue;

        let movedUpPx = 0;
        while (pairOverlaps(protectedRunner, mover) && movedUpPx < maxUpPx) {
          const nextY = mover.y - stepNorm;
          if (nextY < minY - CROSSING_Y_TOL_NORM) break;
          if (nextY >= mover.y - CROSSING_Y_TOL_NORM) break;
          if (!satisfiesRailClearance(nextY)) break;
          mover.y = nextY;
          mover.modelY = nextY;
          movedUpPx += VISUAL_CLEANUP_STEP_PX;
          changed = true;
        }

        if (pairOverlaps(protectedRunner, mover)) {
          const nextX = Math.min(maxLeft, mover.x + xStaggerNorm);
          if (nextX > mover.x + 1e-9) {
            mover.x = nextX;
            mover.modelX = nextX;
            changed = true;
          }
        }
      }
    }

    if (!changed) break;
  }
}

const GAP_COMPRESSION_STEP_PX = 4;
const GAP_COMPRESSION_MIN_GAP_PX = 4;

function gapCompressionBlockerAtY(
  mover: SpeedMapRunner,
  candidateY: number,
  runners: SpeedMapRunner[],
): SpeedMapRunner | null {
  const box = tileBoundingBoxPxFromPlacement(mover.x, candidateY);
  for (const other of runners) {
    if (other.id === mover.id) continue;
    if (
      tileBoxesViolateVisualClearance(box, runnerBoundingBoxPx(other), GAP_COMPRESSION_MIN_GAP_PX)
    ) {
      return other;
    }
  }
  return null;
}

/**
 * After overlap cleanup: slide tiles toward the rail in 4px steps to remove vertical air.
 * Rail-side tiles are processed first and stay protected; wider tiles compress down until blocked.
 */
function applyGapCompressionPass(runners: SpeedMapRunner[], raceNo?: string) {
  if (runners.length === 0) return;

  const tile = getSpeedMapTile();
  const stepNorm = GAP_COMPRESSION_STEP_PX / tile.boardHeightPx;
  const maxInsideY = maxInsidePlacementYNorm();
  const debugR2 = normalizeRaceNoKey(raceNo) === "2";

  const sorted = [...runners].sort((a, b) => b.y - a.y || a.x - b.x || a.no - b.no);

  for (const mover of sorted) {
    if (mover.manuallyPlaced) continue;
    const oldY = mover.y;
    let targetY = oldY;
    let blockedBy: SpeedMapRunner | null = null;

    while (targetY + stepNorm <= maxInsideY + CROSSING_Y_TOL_NORM) {
      const candidateY = targetY + stepNorm;
      if (!satisfiesRailClearance(candidateY)) break;

      const blocker = gapCompressionBlockerAtY(mover, candidateY, runners);
      if (blocker) {
        blockedBy = blocker;
        break;
      }

      targetY = candidateY;
    }

    if (Math.abs(targetY - oldY) > CROSSING_Y_TOL_NORM) {
      mover.y = targetY;
      mover.modelY = targetY;
    }

    if (debugR2) {
      const movedDownPx = Math.round((targetY - oldY) * tile.boardHeightPx);
      console.log("[SpeedMap] gapCompression R2", {
        horse: mover.horse,
        oldY,
        newY: targetY,
        movedDownBy: movedDownPx,
        blockedBy: blockedBy?.horse ?? null,
      });
    }
  }
}

function findFirstManualRunnerOverlap(runners: SpeedMapRunner[], manualIds: Set<string>) {
  for (let i = 0; i < runners.length; i += 1) {
    for (let j = i + 1; j < runners.length; j += 1) {
      const a = runners[i]!;
      const b = runners[j]!;
      if (!manualIds.has(a.id) && !manualIds.has(b.id)) continue;
      const boxA = runnerBoundingBoxPx(a);
      const boxB = runnerBoundingBoxPx(b);
      if (!tileBoxesViolateVisualClearance(boxA, boxB, FINAL_RENDERED_BBOX_GAP_PX)) continue;
      return { a, b };
    }
  }
  return null;
}

/**
 * Manual override: resolve rendered overlaps involving a user-placed tile only.
 * Prefer moving the manual tile; touch another tile only when the manual tile cannot clear alone.
 */
function applyManualVisualCollisionPass(runners: SpeedMapRunner[]) {
  const manualIds = new Set(runners.filter((r) => r.manuallyPlaced).map((r) => r.id));
  if (!manualIds.size) return;

  for (let iter = 0; iter < FINAL_RENDERED_BBOX_PASS_MAX_ITER; iter += 1) {
    const hit = findFirstManualRunnerOverlap(runners, manualIds);
    if (!hit) break;

    const { a, b } = hit;
    const aManual = manualIds.has(a.id);
    const bManual = manualIds.has(b.id);

    let mover = a;
    let other = b;
    if (aManual && !bManual) {
      mover = a;
      other = b;
    } else if (bManual && !aManual) {
      mover = b;
      other = a;
    } else {
      mover = a.y >= b.y ? a : b;
      other = mover === a ? b : a;
    }

    let newY = resolveRunnerYForScreenOverlap(mover, other, runners);
    if (
      (newY === null || Math.abs(newY - mover.y) <= CROSSING_Y_TOL_NORM) &&
      manualIds.has(mover.id) &&
      !manualIds.has(other.id)
    ) {
      const fallbackMover = other;
      const fallbackOther = mover;
      newY = resolveRunnerYForScreenOverlap(fallbackMover, fallbackOther, runners);
      if (newY !== null && Math.abs(newY - fallbackMover.y) > CROSSING_Y_TOL_NORM) {
        fallbackMover.y = newY;
        fallbackMover.modelY = newY;
        continue;
      }
      break;
    }

    if (newY === null || Math.abs(newY - mover.y) <= CROSSING_Y_TOL_NORM) break;

    mover.y = newY;
    mover.modelY = newY;
  }
}

function finalizeManualRunnerPositions(runners: SpeedMapRunner[]): SpeedMapRunner[] {
  if (!runners.some((r) => r.manuallyPlaced)) return runners;
  const positioned = runners.map((r) => ({
    ...hydrateRunnerSpeedFields(r),
    flags: { ...r.flags },
  }));
  applyManualVisualCollisionPass(positioned);
  return positioned;
}

function raceHasManualOverrides(runners: SpeedMapRunner[]) {
  return runners.some((r) => r.manuallyPlaced);
}

function withManualRunnerPosition(runner: SpeedMapRunner, x: number, y: number): SpeedMapRunner {
  return {
    ...runner,
    x,
    y,
    modelX: x,
    modelY: y,
    manuallyPlaced: true,
    lane: undefined,
  };
}

function runnersInRunningLineGroup(a: SpeedMapRunner, b: SpeedMapRunner) {
  const tile = getSpeedMapTile();
  return Math.abs(a.x - b.x) <= tile.WIDTH / tile.boardWidthPx + 0.0001;
}

function runnersShareRunningLineStack(a: SpeedMapRunner, b: SpeedMapRunner) {
  if (!runnersInRunningLineGroup(a, b)) return false;
  const tile = getSpeedMapTile();
  const boxA = runnerBoundingBoxPx(a);
  const boxB = runnerBoundingBoxPx(b);
  const verticalSpan = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);
  const maxSpan = tile.HEIGHT * 3 + FINAL_RENDERED_BBOX_GAP_PX;
  return verticalSpan > -maxSpan;
}

function runnerPairBarrierOrderOk(
  low: SpeedMapRunner,
  high: SpeedMapRunner,
  lowY: number,
  highY: number,
) {
  const wLow = effectiveWirForPlacement(low);
  const wHigh = effectiveWirForPlacement(high);

  if (lowY < highY - CROSSING_Y_TOL_NORM) return false;

  if (speedsWithinCrossingPack(wLow, wHigh)) return true;

  if (highY > lowY + CROSSING_Y_TOL_NORM) {
    return crossingPermitsInsideMove(wHigh, wLow);
  }

  return true;
}

function runnerLaneChangeOk(runner: SpeedMapRunner, yNorm: number, runners: SpeedMapRunner[]) {
  for (const other of runners) {
    if (other.id === runner.id) continue;
    if (!runnersShareRunningLineStack(runner, other)) continue;

    if (!pairInsideMovePermittedAtY(
      effectiveWirForPlacement(runner),
      yNorm,
      effectiveWirForPlacement(other),
      other.y,
    )) {
      return false;
    }

    const low = barrierSortKey(runner.barrier) < barrierSortKey(other.barrier) ? runner : other;
    const high = low === runner ? other : runner;
    const lowY = low === runner ? yNorm : other.y;
    const highY = high === runner ? yNorm : other.y;
    if (!runnerPairBarrierOrderOk(low, high, lowY, highY)) return false;
  }
  return true;
}

function runnerCrossingPermitsInsideException(runner: SpeedMapRunner, insideRunner: SpeedMapRunner) {
  const wRunner = effectiveWirForPlacement(runner);
  const wInside = effectiveWirForPlacement(insideRunner);
  if (speedsWithinCrossingPack(wRunner, wInside)) return false;
  return crossingPermitsInsideMove(wRunner, wInside);
}

/** Hard constraint: lower barrier must not sit wider (lower y) than higher barrier in the same x band. */
function runnerBarrierHardConstraintOk(
  runner: SpeedMapRunner,
  yNorm: number,
  runners: SpeedMapRunner[],
) {
  return runnerLaneChangeOk(runner, yNorm, runners);
}

function trySetRunnerYIfClear(runner: SpeedMapRunner, targetY: number, runners: SpeedMapRunner[]) {
  const minY = minPlacementYNorm();
  const maxInsideY = maxInsidePlacementYNorm();
  const tile = getSpeedMapTile();
  const stepNorm = 1 / tile.boardHeightPx;
  const clamped = Math.max(minY, Math.min(maxInsideY, targetY));

  if (runnerClearAtYNorm(runner, clamped, runners) && runnerLaneChangeOk(runner, clamped, runners)) {
    runner.y = clamped;
    runner.modelY = clamped;
    return true;
  }

  const dir = Math.sign(clamped - runner.y);
  if (dir === 0) return false;
  const maxSteps = Math.ceil(Math.abs(clamped - runner.y) / stepNorm);
  for (let step = 1; step <= maxSteps; step += 1) {
    const y = runner.y + dir * step * stepNorm;
    const next = dir > 0 ? Math.min(clamped, y) : Math.max(clamped, y);
    if (runnerClearAtYNorm(runner, next, runners) && runnerLaneChangeOk(runner, next, runners)) {
      runner.y = next;
      runner.modelY = next;
      return true;
    }
  }
  return false;
}

function applyHardBarrierVerticalOrder(runners: SpeedMapRunner[]) {
  const laneSep = laneSeparationYNorm();
  const minY = minPlacementYNorm();
  const maxInsideY = maxInsidePlacementYNorm();
  const maxPasses = Math.max(12, runners.length * 3);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;

    for (let i = 0; i < runners.length; i += 1) {
      for (let j = i + 1; j < runners.length; j += 1) {
        const a = runners[i]!;
        const b = runners[j]!;
        if (!runnersShareRunningLineStack(a, b)) continue;

        const low = barrierSortKey(a.barrier) < barrierSortKey(b.barrier) ? a : b;
        const high = low === a ? b : a;
        if (runnerCrossingPermitsInsideException(high, low)) continue;
        if (low.y >= high.y - CROSSING_Y_TOL_NORM) continue;

        if (high.y > low.y - laneSep + CROSSING_Y_TOL_NORM) {
          const widerY = Math.max(minY, low.y - laneSep);
          if (trySetRunnerYIfClear(high, widerY, runners)) changed = true;
        } else if (low.y < high.y + laneSep - CROSSING_Y_TOL_NORM) {
          const insideY = Math.min(maxInsideY, high.y + laneSep);
          if (trySetRunnerYIfClear(low, insideY, runners)) changed = true;
        }
      }
    }

    if (!changed) break;
  }
}

function yNormFromTileTopPx(topPx: number) {
  return yNormFromAnchorPx(topPx + getSpeedMapTile().ANCHOR_OFFSET_Y);
}

function runnersInSameRunningLineCluster(a: SpeedMapRunner, b: SpeedMapRunner) {
  if (runnersInRunningLineGroup(a, b)) return true;
  const boxA = runnerBoundingBoxPx(a);
  const boxB = runnerBoundingBoxPx(b);
  const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
  return overlapX > 0;
}

function buildRunningLineGroups(runners: SpeedMapRunner[]) {
  const n = runners.length;
  if (n < 2) return [] as SpeedMapRunner[][];
  const parent = Array.from({ length: n }, (_, i) => i);

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    let cursor = i;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor]!;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };

  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (runnersInSameRunningLineCluster(runners[i]!, runners[j]!)) union(i, j);
    }
  }

  const grouped = new Map<number, SpeedMapRunner[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root)!.push(runners[i]!);
  }

  return [...grouped.values()].filter((group) => group.length >= 2);
}

/** Same running line — shared x column (tile width), for barrier stacks and compression. */
function buildTightRunningLineGroups(runners: SpeedMapRunner[]) {
  const n = runners.length;
  if (n < 2) return [] as SpeedMapRunner[][];
  const parent = Array.from({ length: n }, (_, i) => i);

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    let cursor = i;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor]!;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };

  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (runnersInRunningLineGroup(runners[i]!, runners[j]!)) union(i, j);
    }
  }

  const grouped = new Map<number, SpeedMapRunner[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root)!.push(runners[i]!);
  }

  return [...grouped.values()].filter((group) => group.length >= 2);
}

function resolveCompressedStackY(
  runner: SpeedMapRunner,
  targetY: number,
  runners: SpeedMapRunner[],
  lineMembers: SpeedMapRunner[],
) {
  const tile = getSpeedMapTile();
  const maxInsideY = maxInsidePlacementYNorm();
  const stepNorm = 1 / tile.boardHeightPx;
  const clampedTarget = Math.max(minPlacementYNorm(), Math.min(maxInsideY, targetY));

  const isLegal = (y: number) =>
    runnerClearAtYNormWithGap(runner, y, runners, FINAL_RENDERED_BBOX_GAP_PX) &&
    finalYLegalForRailOwnership(runner, y, runners, lineMembers);

  if (isLegal(clampedTarget)) return clampedTarget;

  for (let y = clampedTarget - stepNorm; y >= minPlacementYNorm() - CROSSING_Y_TOL_NORM; y -= stepNorm) {
    if (isLegal(y)) return y;
  }

  return null;
}

/** Compact a running-line stack: barrier-ordered anchor at rail, stack outward with 6px card gap. */
function compressRunningLineGroup(group: SpeedMapRunner[], runners: SpeedMapRunner[]) {
  const ordered = orderLineByBarrierWithCrossings(group);
  if (ordered.length < 2) return false;

  let changed = false;

  for (let i = 1; i < ordered.length; i += 1) {
    const inside = ordered[i - 1]!;
    const outside = ordered[i]!;
    const insideBox = runnerBoundingBoxPx(inside);
    const targetTopPx = insideBox.bottom + FINAL_RENDERED_BBOX_GAP_PX;
    const targetY = yNormFromTileTopPx(targetTopPx);
    const resolvedY = resolveCompressedStackY(outside, targetY, runners, group);
    if (resolvedY === null || Math.abs(resolvedY - outside.y) <= CROSSING_Y_TOL_NORM) continue;

    outside.y = resolvedY;
    outside.modelY = resolvedY;
    changed = true;
  }

  return changed;
}

/**
 * After overlap-free placement, tighten vertical stacks within each running line (same x band).
 */
function applyRunningLineStackCompression(runners: SpeedMapRunner[]) {
  if (runners.length < 2) return;

  const maxPasses = Math.max(4, runners.length);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const group of buildRunningLineGroups(runners)) {
      if (compressRunningLineGroup(group, runners)) changed = true;
    }
    if (!changed) break;
  }
}

function applyFinalRenderedPostPasses(_runners: SpeedMapRunner[], _raceNo?: string) {
  // Visual overlap + compression run in finalizeRenderedBoard after rail/barrier passes.
}

function logPlacementPhaseDebug(placed: PlacedTile[], runners: SpeedMapRunner[]) {
  if (process.env.NODE_ENV !== "development") return;
  const runnerById = new Map(runners.map((r) => [r.id, r]));
  const remainingIntersections = countPlacementIntersections(placed);
  console.log("[SpeedMap] remainingIntersections", remainingIntersections);

  const rows = placed
    .map((t) => {
      const runner = runnerById.get(t.runnerId);
      const deltaY = t.y - t.originalY;
      return {
        horse: runner?.horse ?? t.runnerId,
        originalY: t.originalY,
        finalY: t.y,
        deltaY,
        absDeltaY: Math.abs(deltaY),
      };
    })
    .sort((a, b) => b.absDeltaY - a.absDeltaY);
  console.table(rows);
}

function overlapsAnyNeighbourColumn(
  xNorm: number,
  yNorm: number,
  columnKey: number,
  resolved: PlacedTile[],
  excludeRunnerId: string,
) {
  for (const other of resolved) {
    if (other.runnerId === excludeRunnerId) continue;
    if (!columnsAreNeighbours(columnKey, columnKeyFromXNorm(other.x))) continue;
    if (overlapsTileAt(xNorm, yNorm, other)) return true;
  }
  return false;
}

/**
 * Tactical layer: rail-most continuous y respecting 1.1 w_ir crossing vs placed runners.
 * No lane grid, no pairwise overlap checks — collision layer handles overlap.
 */
function computeTacticalIdealY(item: LaneRunner, placed: PlacedTile[]): number {
  const { maxTileTop, minTileTop } = boardTileTopLimitsPx();
  const metrics = getSpeedMapTile();
  let anchorPx = anchorPxFromTileTopPx(maxTileTop);
  const minAnchorPx = minTileTop + metrics.ANCHOR_OFFSET_Y;

  for (let pass = 0; pass < placed.length + 1; pass += 1) {
    let changed = false;
    const probeRect = tileRectNormFromPlacement(item.x, anchorPx / metrics.boardHeightPx, metrics);
    for (const other of placed) {
      if (!tilesHorizontallyOverlap(probeRect, other.rect)) continue;
      const otherAnchorPx = other.y * metrics.boardHeightPx;
      if (anchorPx > otherAnchorPx + crossingTolPx() && !canSettleInsideNeighbour(item.wEff, other.wIr)) {
        const next = Math.min(anchorPx, otherAnchorPx - crossingTolPx());
        if (next < anchorPx - 0.01) {
          anchorPx = next;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  anchorPx = Math.max(minAnchorPx, anchorPx);
  return yNormFromAnchorPx(anchorPx);
}

function placeRunnerTacticalIdeal(item: LaneRunner, placed: PlacedTile[]): PlacedTile {
  const y = computeTacticalIdealY(item, placed);
  return {
    runnerId: item.runner.id,
    x: item.x,
    y,
    tacticalY: y,
    originalY: y,
    rect: tileRectNormFromPlacement(item.x, y),
    barrier: item.barrier,
    wIr: item.wEff,
    lane: 0,
    no: item.runner.no,
  };
}

function captureOriginalY(placed: PlacedTile[]) {
  for (const tile of placed) {
    tile.originalY = tile.y;
  }
}

/**
 * Visual overlap only within the same tactical column — small y/x nudges, no lane reassignment.
 */
function applyCollisionResolution(placed: PlacedTile[], maxLane: number) {
  const resolved: PlacedTile[] = [];

  for (const tile of placed) {
    tile.lane = yToLane(tile.y, maxLane);
    syncPlacedTileGeometry(tile);
    resolveVisualOverlapInColumn(tile, resolved, maxLane);
    resolved.push(tile);
  }
}

const bandSortKey = (a: LaneRunner, b: LaneRunner) =>
  a.barrier - b.barrier || a.wEff - b.wEff || a.runner.no - b.runner.no;

/**
 * Layer 1 — Tactical: x = w_ir, ideal y = bands + crossing + rail compression.
 * Layer 2 — Collision: lane occupancy nudges upward only; x never changes.
 */
export function applyActiveBoardRacePlacement(runners: SpeedMapRunner[], raceNo?: string): SpeedMapRunner[] {
  if (!runners.length) return [];

  const items: LaneRunner[] = runners.map((runner) => {
    const wEff = effectiveWirForPlacement(runner);
    return {
      runner,
      x: xNormFromEffectiveWir(wEff),
      wEff,
      barrier: barrierSortKey(runner.barrier),
      band: wirBandIndex(wEff),
    };
  });

  const byBand = new Map<number, LaneRunner[]>();
  for (const item of items) {
    if (!byBand.has(item.band)) byBand.set(item.band, []);
    byBand.get(item.band)!.push(item);
  }

  const placed: PlacedTile[] = [];
  const placedById = new Map<string, SpeedMapRunner>();
  const maxLane = maxLaneOnBoard();

  for (const band of WIR_BAND_PLACEMENT_ORDER) {
    const members = byBand.get(band) ?? [];
    members.sort(bandSortKey);
    for (const item of members) {
      placed.push(placeRunnerTacticalIdeal(item, placed));
    }
  }

  // Phase 1 — natural race shape (frozen at originalY before overlap repair).
  applyRailPriorityCompression(placed);
  applyVisualSafetyPadding(placed);
  applyFinalRailReclaim(placed, maxLane);
  applyLocalBarrierPairwiseOrder(placed, maxLane);
  captureOriginalY(placed);

  applyCollisionResolution(placed, maxLane);

  // Phase 2 — same-column visual overlap only.
  applyPhase2OverlapResolution(placed, maxLane);

  // Phase 3 — downward compression to lowest legal rail position.
  applyPhase3DownwardCompression(placed, maxLane);

  for (const p of placed) {
    const runner = runners.find((r) => r.id === p.runnerId);
    if (!runner) continue;
    const x = runner.hasSpeedData ? p.x : clampRunnerXNormToBoard(p.x);
    placedById.set(p.runnerId, {
      ...runner,
      lane: p.lane,
      x,
      y: p.y,
      modelX: x,
      modelY: p.y,
      manuallyPlaced: false,
      ...(!runner.hasSpeedData ? { wIr: 12 } : {}),
    });
  }

  const positioned = runners.map((r) => placedById.get(r.id) ?? r);
  applyFinalRenderedRaceFixes(positioned, raceNo, maxLane);
  applyFinalRenderedPostPasses(positioned, raceNo);
  finalizeRenderedBoard(positioned, maxLane, raceNo);
  logPlacementPhaseDebug(placed, runners);

  if (raceNo) {
    lastPlacementCountsByRace.set(raceNo, { input: runners.length, output: positioned.length });
  }

  return positioned;
}

const lastPlacementCountsByRace = new Map<string, { input: number; output: number }>();

/** multiset difference: names still unmatched after pairing each runner to one CSV name */
function multisetHorseDiff(csvNames: string[], runners: SpeedMapRunner[]): string[] {
  const need = new Map<string, number>();
  for (const n of csvNames) need.set(n, (need.get(n) ?? 0) + 1);
  for (const r of runners) {
    const c = need.get(r.horse);
    if (c !== undefined && c > 0) need.set(r.horse, c - 1);
  }
  const out: string[] = [];
  for (const [n, c] of need) for (let i = 0; i < c; i++) out.push(n);
  return out;
}

function runnerRefLabel(runner: Pick<SpeedMapRunner, "no" | "horse">): string {
  const no = runner.no > 0 ? `#${runner.no}` : "";
  const name = runner.horse?.trim() ?? "";
  return [no, name].filter(Boolean).join(" ") || "unknown";
}

function missingRunnerLabelsFromImport(
  dbg: SpeedMapImportDebug | undefined,
  runners: SpeedMapRunner[],
): string[] {
  if (!dbg) return [];
  return multisetHorseDiff(dbg.parsedHorseNames, runners);
}

function missingRunnerLabelsActiveVsRendered(
  active: SpeedMapRunner[],
  rendered: SpeedMapRunner[],
): string[] {
  const renderedIds = new Set(rendered.map((r) => r.id));
  return active.filter((r) => !renderedIds.has(r.id)).map(runnerRefLabel);
}

function collectSpeedMapRunnerCountMissing(
  dbg: SpeedMapImportDebug | undefined,
  activeRunners: SpeedMapRunner[],
  rendered: SpeedMapRunner[],
): string[] {
  const missing = [
    ...missingRunnerLabelsFromImport(dbg, activeRunners),
    ...missingRunnerLabelsActiveVsRendered(activeRunners, rendered),
  ];
  return [...new Set(missing)];
}

function logSpeedMapRunnerCountDiagnostics(params: {
  raceNo: string;
  imported: number | null;
  activeRace: number;
  placementInput: number | null;
  placementOutput: number | null;
  rendered: number;
  missing: string[];
}) {
  console.log("[SpeedMap Runner Count]", {
    raceNo: params.raceNo,
    imported: params.imported,
    activeRace: params.activeRace,
    placementInput: params.placementInput,
    placementOutput: params.placementOutput,
    rendered: params.rendered,
    missing: params.missing.length ? params.missing : undefined,
  });
}

type ActiveRaceRunnerDiagRow = {
  runnerNo: number;
  runnerName: string;
  scratched: boolean;
  isActive: boolean;
  isVisible: boolean;
};

function buildActiveRaceRunnerDiagRows(
  runners: SpeedMapRunner[],
  renderedIds: Set<string>,
  mounted: boolean,
): ActiveRaceRunnerDiagRow[] {
  return [...runners]
    .sort((a, b) => a.no - b.no || a.horse.localeCompare(b.horse))
    .map((runner) => {
      const scratched = false;
      return {
        runnerNo: runner.no,
        runnerName: runner.horse,
        scratched,
        isActive: !scratched,
        isVisible: mounted && renderedIds.has(runner.id),
      };
    });
}

function logActiveRaceRunnersDiagnostics(
  raceNo: string,
  raceName: string,
  runners: SpeedMapRunner[],
  renderedIds: Set<string>,
  mounted: boolean,
) {
  const rows = buildActiveRaceRunnerDiagRows(runners, renderedIds, mounted);
  const lines = [
    "[Active Race Runners]",
    `raceNo: ${raceNo}`,
    `raceName: ${raceName}`,
    `activeRace.runners.length: ${runners.length}`,
    "",
    ...rows.map((r) => `#${r.runnerNo} ${r.runnerName}`),
  ].join("\n");
  console.log(lines);
  console.table(rows);
}

export default function SpeedMapBoard() {
  const boardRef = useRef<HTMLDivElement>(null);
  const {
    meetingTrack,
    meetingGoing,
    meetingRail,
    raceMap,
    raceOrder,
    activeRaceNo,
    selectedRunnerIds,
    focusMode,
    pressureOverlay,
    setMeetingTrack,
    setMeetingGoing,
    setMeetingRail,
    setRaceMap,
    setRaceOrder,
    setActiveRaceNo,
    setSelectedRunnerIds,
    setFocusMode,
    setPressureOverlay,
    persistNow,
    loadFromStorage,
    resetMeeting,
    applySession,
    hydrated,
  } = useSpeedMapSession();
  const [mounted, setMounted] = useState(false);
  const [recordingMode, setRecordingMode] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [tileLayoutVersion, setTileLayoutVersion] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dragStateRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const tileProbeRef = useRef<HTMLButtonElement>(null);
  const activeRace = activeRaceNo ? raceMap[activeRaceNo] : undefined;
  const runners = activeRace?.runners ?? [];
  const renderedRunners = useMemo(() => {
    if (!mounted) return [];
    if (!runners.length) return [];
    if (activeRace) {
      console.log(
        "RENDER RUNNERS",
        activeRace.runners.map((r) => {
          const hydrated = hydrateRunnerSpeedFields(r);
          return {
            no: hydrated.no,
            number: hydrated.no,
            name: hydrated.horse,
            w_ir: hydrated.wIr,
            hasSpeedData: hydrated.hasSpeedData,
            hasData:
              hydrated.wIr !== null &&
              hydrated.wIr !== undefined &&
              !Number.isNaN(Number(hydrated.wIr)) &&
              hydrated.hasSpeedData,
          };
        }),
      );
    }
    const positioned = runners.map((r) => ({
      ...hydrateRunnerSpeedFields(r),
      flags: { ...r.flags },
    }));

    if (raceHasManualOverrides(positioned)) {
      return positioned;
    }

    const raceKey = normalizeRaceNoKey(activeRaceNo);
    const maxLane = maxLaneOnBoard();
    applyFinalRenderedRaceFixes(positioned, activeRaceNo, maxLane);
    if (raceKey === "2") {
      applyRace2Runner17TacticalRefinement(positioned, maxLane);
    }
    applyFinalRenderedPostPasses(positioned, activeRaceNo);
    finalizeRenderedBoard(positioned, maxLane, activeRaceNo);
    if (!recordingMode && raceKey === "2") {
      const tile = getSpeedMapTile();
      const r15 = findRenderedRunner(positioned, 15, "spenzalot");
      const r17 = findRenderedRunner(positioned, 17, "favour");
      console.log(
        "FINAL R2",
        positioned.filter((r) => [1, 15, 17].includes(runnerNumber(r))).map((r) => ({
          number: runnerNumber(r),
          horse: r.horse,
          y: r.y,
          x: r.x,
        })),
        r15 && r17
          ? {
              gapPx: tileTopPxFromYNorm(r15.y, tile) - tileBottomPxFromYNorm(r17.y, tile),
            }
          : null,
      );
    }
    if (!recordingMode && raceKey === "7") {
      console.log(
        "FINAL R7",
        positioned.filter((r) => [11, 13, 5].includes(runnerNumber(r))).map((r) => ({
          number: runnerNumber(r),
          y: r.y,
          x: r.x,
        })),
      );
    }
    return positioned;
  }, [mounted, runners, activeRaceNo, recordingMode, tileLayoutVersion]);
  const keyIdea = activeRace?.notes ?? "";

  const headerDisplayMeta = useMemo((): RaceMeta => {
    const selectedRace = activeRace;
    return {
      track: selectedRace?.track?.trim() || meetingTrack.trim() || "",
      race: activeRaceNo || "",
      distance: selectedRace?.distance?.trim() ?? "",
      grade: selectedRace?.grade?.trim() ?? "",
      going: selectedRace?.going?.trim() ?? "",
      rail: selectedRace?.rail?.trim() ?? "",
    };
  }, [activeRace, activeRaceNo, meetingTrack]);

  const handleMetaChange = (patch: Partial<RaceMeta>) => {
    if (patch.track !== undefined) setMeetingTrack(patch.track);
    if (!activeRaceNo) return;
    setRaceMap((prev) => {
      const current = prev[activeRaceNo];
      if (!current) return prev;
      return {
        ...prev,
        [activeRaceNo]: {
          ...current,
          ...(patch.track !== undefined ? { track: patch.track } : {}),
          ...(patch.distance !== undefined ? { distance: patch.distance } : {}),
          ...(patch.grade !== undefined ? { grade: patch.grade } : {}),
          ...(patch.going !== undefined ? { going: patch.going } : {}),
          ...(patch.rail !== undefined ? { rail: patch.rail } : {}),
        },
      };
    });
  };

  const pressure = useMemo(() => pressureFromRunners(renderedRunners), [renderedRunners]);

  useEffect(() => {
    if (!mounted || !activeRaceNo || !raceMap[activeRaceNo]) return;
    const race = raceMap[activeRaceNo];
    const dbg = race.importDebug;
    const placementCounts = lastPlacementCountsByRace.get(activeRaceNo);
    logSpeedMapRunnerCountDiagnostics({
      raceNo: activeRaceNo,
      imported: dbg?.nonScratchedRunnerCount ?? null,
      activeRace: race.runners.length,
      placementInput: placementCounts?.input ?? null,
      placementOutput: placementCounts?.output ?? null,
      rendered: renderedRunners.length,
      missing: collectSpeedMapRunnerCountMissing(dbg, race.runners, renderedRunners),
    });
    logActiveRaceRunnersDiagnostics(
      activeRaceNo,
      race.raceName,
      race.runners,
      new Set(renderedRunners.map((r) => r.id)),
      mounted,
    );
  }, [mounted, activeRaceNo, raceMap, renderedRunners]);

  const updateActiveRace = (
    updater: (race: RaceMapEntry) => RaceMapEntry,
  ) => {
    if (!activeRaceNo) return;
    setRaceMap((prev) => {
      const current = prev[activeRaceNo];
      if (!current) return prev;
      return { ...prev, [activeRaceNo]: updater(current) };
    });
  };

  useLayoutEffect(() => {
    if (!mounted) return;
    const board = boardRef.current;
    const probe = tileProbeRef.current;
    if (!board || !probe) return;

    const measure = () => {
      const boardRect = board.getBoundingClientRect();
      const tileRect = probe.getBoundingClientRect();
      if (tileRect.width < 1 || tileRect.height < 1) return;
      const measured = measureSpeedMapTileFromDom(boardRect, tileRect, 0.5);
      const changed = applySpeedMapTileMetrics(measured);
      if (changed) setTileLayoutVersion((v) => v + 1);
      if (!changed || !activeRaceNo) return;
      setRaceMap((prev) => {
        const current = prev[activeRaceNo];
        if (!current?.runners.length) return prev;
        if (current.runners.some((r) => r.manuallyPlaced)) return prev;
        return {
          ...prev,
          [activeRaceNo]: {
            ...current,
            runners: applyActiveBoardRacePlacement(
              structuredClone(current.runners).map((r) =>
                hydrateRunnerSpeedFields({ ...r, manuallyPlaced: false }),
              ),
              activeRaceNo,
            ).map(hydrateRunnerSpeedFields),
          },
        };
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, [activeRaceNo, mounted]);

  const onTilePointerDown = (id: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!boardRef.current) return;
    boardRef.current.focus();
    const boardRect = boardRef.current.getBoundingClientRect();
    const runner = runners.find((r) => r.id === id);
    if (!runner) return;

    dragStateRef.current = {
      id,
      offsetX: event.clientX - (boardRect.left + runner.x * boardRect.width),
      offsetY: event.clientY - (boardRect.top + runner.y * boardRect.height),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onBoardPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!boardRef.current || !dragStateRef.current) return;
    const boardRect = boardRef.current.getBoundingClientRect();
    const { id, offsetX, offsetY } = dragStateRef.current;
    const x = Math.max(0, Math.min(1 - tileWidthNorm(), (event.clientX - offsetX - boardRect.left) / boardRect.width));
    const y = Math.max(TILE_HALF_HEIGHT, Math.min(MAX_TILE_CENTER_Y, (event.clientY - offsetY - boardRect.top) / boardRect.height));
    updateActiveRace((race) => ({
      ...race,
      runners: race.runners.map((runner) =>
        runner.id === id ? withManualRunnerPosition(runner, x, y) : runner,
      ),
    }));
  };

  const onBoardPointerUp = () => {
    if (dragStateRef.current) {
      updateActiveRace((race) => ({
        ...race,
        runners: finalizeManualRunnerPositions(race.runners),
      }));
    }
    dragStateRef.current = null;
  };

  const onTileClick = (id: string) => {
    setSelectedRunnerIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const onBoardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedRunnerIds.length) return;
    const step = event.shiftKey ? 0.015 : 0.005;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    if (event.key === "ArrowRight") dx = step;
    if (event.key === "ArrowUp") dy = -step;
    if (event.key === "ArrowDown") dy = step;
    if (dx === 0 && dy === 0) return;

    event.preventDefault();
    updateActiveRace((race) => {
      const nudged = {
        ...race,
        runners: race.runners.map((runner) =>
          selectedRunnerIds.includes(runner.id)
            ? withManualRunnerPosition(
                runner,
                Math.max(0, Math.min(1 - tileWidthNorm(), runner.x + dx)),
                Math.max(TILE_HALF_HEIGHT, Math.min(MAX_TILE_CENTER_Y, runner.y + dy)),
              )
            : runner,
        ),
      };
      return { ...nudged, runners: finalizeManualRunnerPositions(nudged.runners) };
    });
  };

  const flagsForHighlightChoice = (choice: string): RunnerFlags => {
    switch (choice) {
      case "favourite":
        return { favourite: true, target: false, mapAdvantage: false, risk: false };
      case "target":
        return { favourite: false, target: true, mapAdvantage: false, risk: false };
      case "mapAdvantage":
        return { favourite: false, target: false, mapAdvantage: true, risk: false };
      case "risk":
        return { favourite: false, target: false, mapAdvantage: false, risk: true };
      default:
        return EMPTY_RUNNER_FLAGS;
    }
  };

  const applyHighlightToSelected = (choice: string) => {
    if (!selectedRunnerIds.length) return;
    const flags = flagsForHighlightChoice(choice);
    updateActiveRace((race) => ({
      ...race,
      runners: race.runners.map((runner) =>
        selectedRunnerIds.includes(runner.id) ? { ...runner, flags } : runner,
      ),
    }));
  };

  const persistState = (
    nextMeetingTrack: string,
    nextMeetingGoing: string,
    nextMeetingRail: string,
    nextRaceMap: Record<string, RaceMapEntry>,
    nextActiveRaceNo: string,
    statusMessage?: string,
  ) => {
    applySession({
      meetingTrack: nextMeetingTrack,
      meetingGoing: nextMeetingGoing,
      meetingRail: nextMeetingRail,
      raceMap: nextRaceMap,
      raceOrder,
      activeRaceNo: nextActiveRaceNo,
      selectedRunnerIds,
      focusMode,
      pressureOverlay,
    });
    persistNow();
    if (statusMessage) setSaveStatus(statusMessage);
  };

  const saveMap = () => {
    persistNow();
    setSaveStatus("Map state saved.");
  };

  const loadMap = () => {
    const loaded = loadFromStorage();
    if (!loaded) {
      setSaveStatus("No saved state found.");
      return;
    }
    setSelectedRunnerIds([]);
    setSaveStatus("Saved map loaded.");
  };

  const exportAsPng = async () => {
    if (!boardRef.current) return;
    const dataUrl = await toPng(boardRef.current, { pixelRatio: 2, backgroundColor: "#020617" });
    const anchor = document.createElement("a");
    anchor.download = "speed-map-board.png";
    anchor.href = dataUrl;
    anchor.click();
  };

  const handleHardStorageReset = async () => {
    try {
      await hardResetAppStorage();
      resetMeeting();
      setImportError(null);
      setSaveStatus("All saved storage cleared. Reloading…");
      window.location.reload();
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Storage reset failed.");
    }
  };

  const activeRaceIndex = activeRaceNo ? raceOrder.indexOf(activeRaceNo) : -1;
  const canPrevRace = activeRaceIndex > 0;
  const canNextRace = activeRaceIndex >= 0 && activeRaceIndex < raceOrder.length - 1;

  if (!mounted) {
    return (
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/80 p-4 text-slate-400">
        Loading speed map...
      </div>
    );
  }

  if (!recordingMode) {
    console.log("HEADER SOURCE selectedRace", activeRace);
    console.log("HEADER SOURCE first runner", activeRace?.runners?.[0]);
  }

  return (
    <div className="min-h-screen bg-slate-950 p-2 text-slate-100 md:p-3">
      <div className="mx-auto max-w-[1600px] space-y-2.5">
        {!hydrated && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
            Loading saved speed map state...
          </div>
        )}
        {!recordingMode && (
          <RaceMetaBar
            key={activeRaceNo || "no-race"}
            meta={headerDisplayMeta}
            onChange={handleMetaChange}
            readOnly={recordingMode}
          />
        )}
        {!recordingMode && activeRace && <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">{activeRace.raceName}</p>}
        {!recordingMode && raceOrder.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/90 p-2">
            <button
              type="button"
              disabled={!canPrevRace}
              onClick={() => {
                if (!canPrevRace) return;
                setActiveRaceNo(raceOrder[activeRaceIndex - 1]!);
                setSelectedRunnerIds([]);
              }}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-100 disabled:opacity-40"
            >
              Previous Race
            </button>
            <select
              value={activeRaceNo}
              onChange={(event) => {
                setActiveRaceNo(event.target.value);
                setSelectedRunnerIds([]);
              }}
              className="min-w-44 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
            >
              {raceOrder.map((raceNo) => (
                <option key={raceNo} value={raceNo}>
                  Race {raceNo}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!canNextRace}
              onClick={() => {
                if (!canNextRace) return;
                setActiveRaceNo(raceOrder[activeRaceIndex + 1]!);
                setSelectedRunnerIds([]);
              }}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-100 disabled:opacity-40"
            >
              Next Race
            </button>
          </div>
        )}

        <div className="space-y-2.5">
          <div
            ref={boardRef}
            className="relative h-[760px] overflow-visible rounded-2xl border border-slate-800/70 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
            tabIndex={0}
            onKeyDown={onBoardKeyDown}
            onPointerMove={onBoardPointerMove}
            onPointerUp={onBoardPointerUp}
            onPointerCancel={onBoardPointerUp}
          >
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: WIR_TRACK_TEMPLATE }}>
                {Array.from({ length: VISUAL_COLUMNS }).map((_, idx) => (
                  <div key={idx} className="border-r border-slate-300/15 last:border-r-0" />
                ))}
              </div>
              <div
                className="absolute left-0 right-0 border-t border-slate-200/65 shadow-[0_2px_7px_rgba(0,0,0,0.35),0_0_10px_rgba(226,232,240,0.12)]"
                style={{ top: `${RAIL_TOP * 100}%` }}
              />
              <div
                className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-100/70 to-transparent"
                style={{ top: `calc(${RAIL_TOP * 100}% - 1px)` }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 grid gap-0 border-t border-slate-700/40 bg-slate-950/78 text-[10px] font-semibold uppercase tracking-wide text-slate-300"
                style={{ gridTemplateColumns: WIR_TRACK_TEMPLATE }}
              >
                <div className="px-1 py-2 text-center" style={{ gridColumn: "1 / span 2" }}>
                  Backmarker
                </div>
                <div className="px-1 py-2 text-center" style={{ gridColumn: "3 / span 2" }}>
                  Midfield/Backmarker
                </div>
                <div className="px-1 py-2 text-center" style={{ gridColumn: "5 / span 2" }}>
                  Midfield
                </div>
                <div className="px-1 py-2 text-center" style={{ gridColumn: "7 / span 2" }}>
                  On Pace/Midfield
                </div>
                <div className="px-1 py-2 text-center" style={{ gridColumn: "9 / span 2" }}>
                  On Pace
                </div>
                <div className="px-1 py-2 text-center" style={{ gridColumn: "11 / span 1" }}>
                  Leader
                </div>
              </div>

              {pressureOverlay && (
                <div
                  className={cn(
                    "absolute inset-y-0 right-0",
                    pressure.label === "Low" && "bg-sky-500/5",
                    pressure.label === "Moderate" && "bg-amber-400/8",
                    pressure.label === "High" && "bg-gradient-to-l from-orange-500/20 to-amber-400/8",
                    pressure.label === "Extreme" && "bg-gradient-to-l from-red-700/35 to-red-500/15",
                  )}
                  style={{ width: "50%" }}
                />
              )}
            </div>

            <button
              ref={tileProbeRef}
              type="button"
              tabIndex={-1}
              aria-hidden
              className={cn(HORSE_TILE_SURFACE_CLASS, "pointer-events-none opacity-0")}
              style={horseTileStyleFromMetrics(0, 0.5)}
            />
            {renderedRunners.map((runner) => (
              <HorseTile
                key={runner.id}
                runner={runner}
                onPointerDown={onTilePointerDown}
                onClick={onTileClick}
                spotlighted={selectedRunnerIds.includes(runner.id)}
                dimmed={focusMode && selectedRunnerIds.length > 0 && !selectedRunnerIds.includes(runner.id)}
              />
            ))}

            {!renderedRunners.length && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                Import the meeting CSV from Mounting Yard to populate runners.
              </div>
            )}
          </div>

          {!recordingMode && (
            <div className="space-y-2">
              <PressureMeter score={pressure.score} label={pressure.label} />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-3">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  Highlight selected runner
                  <select
                    defaultValue=""
                    disabled={!selectedRunnerIds.length}
                    className="mt-1 min-h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm font-medium text-slate-100 focus:border-cyan-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    onChange={(event) => {
                      applyHighlightToSelected(event.target.value);
                      event.currentTarget.value = "";
                    }}
                  >
                    <option value="">None / Clear</option>
                    <option value="favourite">Favourite (Pink)</option>
                    <option value="target">Target</option>
                    <option value="mapAdvantage">Map Advantage</option>
                    <option value="risk">Risk / Vulnerable</option>
                  </select>
                </label>
              </div>
              <KeyIdeaBox
                value={keyIdea}
                onChange={(next) =>
                  updateActiveRace((race) => ({
                    ...race,
                    notes: next,
                  }))
                }
              />
              <p className="text-xs text-slate-400">Nudge selected tiles: Arrow keys (Shift for larger step).</p>
              <div className="mt-5">
                <ControlsPanel
                  recordingMode={recordingMode}
                  focusMode={focusMode}
                  pressureOverlay={pressureOverlay}
                  importError={importError}
                  saveStatus={saveStatus}
                  onToggleRecording={() => setRecordingMode((prev) => !prev)}
                  onToggleFocusMode={() => setFocusMode((prev) => !prev)}
                  onTogglePressureOverlay={() => setPressureOverlay((prev) => !prev)}
                  onReset={() => {
                    if (!activeRaceNo) return;
                    setRaceMap((prev) => {
                      const race = prev[activeRaceNo];
                      if (!race) return prev;
                      const nextRunners = applyActiveBoardRacePlacement(
                        structuredClone(race.runners).map((runner) =>
                          hydrateRunnerSpeedFields({ ...runner, manuallyPlaced: false }),
                        ),
                        activeRaceNo,
                      ).map(hydrateRunnerSpeedFields);
                      const nextRaceMap = {
                        ...prev,
                        [activeRaceNo]: {
                          ...race,
                          runners: nextRunners,
                          placementEngine: "active-board-v32",
                        },
                      };
                      persistState(
                        meetingTrack,
                        meetingGoing,
                        meetingRail,
                        nextRaceMap,
                        activeRaceNo,
                        "Race reset to algorithm layout.",
                      );
                      return nextRaceMap;
                    });
                  }}
                  onSave={saveMap}
                  onLoad={loadMap}
                  onExportPng={() => void exportAsPng()}
                  onHardStorageReset={() => void handleHardStorageReset()}
                />
              </div>
            </div>
          )}
        </div>

        {!recordingMode && (
          <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
            <p>Low pressure: likely control</p>
            <p>Moderate pressure: manageable contest</p>
            <p>High pressure: multiple runners contesting forward bands</p>
          </div>
        )}
      </div>
    </div>
  );
}
