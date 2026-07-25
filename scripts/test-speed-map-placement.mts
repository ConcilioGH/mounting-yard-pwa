/**
 * Regression tests for Speed Map downward placement freeze.
 *
 * Run: npx tsx scripts/test-speed-map-placement.mts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  alwaysClearBlockedAtYForTest,
  applyActiveBoardRacePlacement,
  createPlacedTileForTest,
  tryMovePlacedTileDownPx,
} from "../src/components/speed-map/speed-map-board";
import { parseRunnersCsvByRace } from "../src/lib/speed-map";
import {
  applySpeedMapTileMetrics,
  DEFAULT_SPEED_MAP_BOARD_HEIGHT_PX,
  getSpeedMapTile,
} from "../src/lib/speed-map-tile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RANDWICK_CSV = path.join(
  ROOT,
  "meetings",
  "2026-07-25-randwick",
  "randwick_2026-07-25_master.csv",
);

const RACE_PLACEMENT_BUDGET_MS = 5_000;
const FULL_MEETING_BUDGET_MS = 30_000;

function maxAnchorYNorm() {
  const tile = getSpeedMapTile();
  // Match boardTileTopLimitsPx / yNormFromAnchorPx max: lane 0 tile top + anchor.
  const railY = 0.92 * tile.boardHeightPx;
  const maxTileTop = railY - tile.RAIL_CLEARANCE - tile.HEIGHT;
  return (maxTileTop + tile.ANCHOR_OFFSET_Y) / tile.boardHeightPx;
}

function testBottomBoundaryReturnsFalse() {
  const yMax = maxAnchorYNorm();
  const tile = createPlacedTileForTest({
    runnerId: "bottom",
    x: 0.2,
    y: yMax,
  });
  const before = tile.y;
  const moved = tryMovePlacedTileDownPx(tile, 1, [tile], alwaysClearBlockedAtYForTest);
  assert.equal(moved, false, "move at bottom boundary must return false");
  assert.equal(tile.y, before, "y must be unchanged at bottom boundary");
}

function testClampToCurrentPositionReturnsFalse() {
  const yMax = maxAnchorYNorm();
  const tile = createPlacedTileForTest({
    runnerId: "clamp",
    x: 0.3,
    y: yMax,
  });
  // Large delta still clamps to the same y.
  const moved = tryMovePlacedTileDownPx(tile, 500, [tile], alwaysClearBlockedAtYForTest);
  assert.equal(moved, false, "clamped no-op move must return false");
  assert.ok(Number.isFinite(tile.y));
}

function testNonFiniteCoordinatesReturnFalse() {
  const tile = createPlacedTileForTest({
    runnerId: "nan",
    x: 0.2,
    y: 0.5,
  });
  tile.y = Number.NaN;
  assert.equal(
    tryMovePlacedTileDownPx(tile, 1, [tile], alwaysClearBlockedAtYForTest),
    false,
    "NaN tile.y must return false",
  );

  const tile2 = createPlacedTileForTest({
    runnerId: "inf",
    x: 0.2,
    y: 0.5,
  });
  assert.equal(
    tryMovePlacedTileDownPx(tile2, Number.POSITIVE_INFINITY, [tile2], alwaysClearBlockedAtYForTest),
    false,
    "non-finite delta must return false",
  );

  applySpeedMapTileMetrics({ boardHeightPx: 0 });
  const tile3 = createPlacedTileForTest({
    runnerId: "bad-board",
    x: 0.2,
    y: 0.5,
  });
  assert.equal(
    tryMovePlacedTileDownPx(tile3, 1, [tile3], alwaysClearBlockedAtYForTest),
    false,
    "invalid board height must return false",
  );
  applySpeedMapTileMetrics({ boardHeightPx: DEFAULT_SPEED_MAP_BOARD_HEIGHT_PX });
}

function testMeaningfulMoveStillWorks() {
  applySpeedMapTileMetrics({ boardHeightPx: DEFAULT_SPEED_MAP_BOARD_HEIGHT_PX });
  const tile = createPlacedTileForTest({
    runnerId: "move",
    x: 0.25,
    y: 0.4,
  });
  const before = tile.y;
  const moved = tryMovePlacedTileDownPx(tile, 4, [tile], alwaysClearBlockedAtYForTest);
  assert.equal(moved, true, "clear interior move should succeed");
  assert.ok(tile.y > before, "y should increase toward rail");
  assert.ok(Number.isFinite(tile.y));
}

function withSilencedConsole<T>(fn: () => T): T {
  const log = console.log;
  const info = console.info;
  const table = console.table;
  const warn = console.warn;
  console.log = () => {};
  console.info = () => {};
  console.table = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.info = info;
    console.table = table;
    console.warn = warn;
  }
}

function testRandwickMeetingPlacementBounded() {
  assert.ok(fs.existsSync(RANDWICK_CSV), `missing fixture: ${RANDWICK_CSV}`);
  const text = fs.readFileSync(RANDWICK_CSV, "utf8");
  const parsed = parseRunnersCsvByRace(text);
  const totalImported = parsed.races.reduce((sum, race) => sum + race.runners.length, 0);
  assert.equal(parsed.races.length, 10, `expected 10 races, got ${parsed.races.length}`);
  assert.equal(totalImported, 111, `expected 111 runners, got ${totalImported}`);

  const meetingStart = performance.now();
  let placedTotal = 0;

  for (const race of parsed.races) {
    const inputCount = race.runners.length;
    process.stdout.write(`  placing race ${race.raceNo} (${inputCount} runners)... `);
    const raceStart = performance.now();
    const placed = withSilencedConsole(() =>
      applyActiveBoardRacePlacement(
        race.runners.map((r) => ({ ...r })),
        race.raceNo,
      ),
    );
    const elapsed = performance.now() - raceStart;
    console.log(`${elapsed.toFixed(1)}ms`);
    assert.ok(
      elapsed < RACE_PLACEMENT_BUDGET_MS,
      `race ${race.raceNo} placement took ${elapsed.toFixed(1)}ms (budget ${RACE_PLACEMENT_BUDGET_MS}ms)`,
    );
    assert.equal(
      placed.length,
      inputCount,
      `race ${race.raceNo} runner count changed ${inputCount} → ${placed.length}`,
    );
    for (const runner of placed) {
      assert.ok(Number.isFinite(runner.x), `race ${race.raceNo} ${runner.horse} x non-finite`);
      assert.ok(Number.isFinite(runner.y), `race ${race.raceNo} ${runner.horse} y non-finite`);
    }
    placedTotal += placed.length;
  }

  const meetingElapsed = performance.now() - meetingStart;
  assert.equal(placedTotal, 111);
  assert.ok(
    meetingElapsed < FULL_MEETING_BUDGET_MS,
    `full meeting placement took ${meetingElapsed.toFixed(1)}ms (budget ${FULL_MEETING_BUDGET_MS}ms)`,
  );
  console.log(
    `[ok] Randwick 10 races / 111 runners placed in ${meetingElapsed.toFixed(1)}ms`,
  );
}

function run() {
  applySpeedMapTileMetrics({
    boardWidthPx: 1280,
    boardHeightPx: DEFAULT_SPEED_MAP_BOARD_HEIGHT_PX,
  });

  const tests: Array<[string, () => void]> = [
    ["bottom boundary returns false", testBottomBoundaryReturnsFalse],
    ["clamp to current position returns false", testClampToCurrentPositionReturnsFalse],
    ["non-finite coordinates return false", testNonFiniteCoordinatesReturnFalse],
    ["meaningful interior move still works", testMeaningfulMoveStillWorks],
    ["Randwick meeting placement bounded + finite coords", testRandwickMeetingPlacementBounded],
  ];

  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      fn();
      console.log(`[pass] ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`[fail] ${name}`);
      console.error(error);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${tests.length} speed-map placement regression tests passed.`);
}

run();
