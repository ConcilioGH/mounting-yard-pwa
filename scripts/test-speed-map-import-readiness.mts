import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseMeetingCsv } from "../src/lib/csv.ts";
import {
  reconcileSpeedMapActivePlacement,
  syncSpeedMapOnMeetingImport,
} from "../src/lib/meeting-speed-map-sync.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = path.join(
  root,
  "meetings",
  "2026-10-15-hawkesbury",
  "hawkesbury_2026-10-15_master.csv",
);

const parsed = parseMeetingCsv(fs.readFileSync(csvPath, "utf8"), path.basename(csvPath));
const beforeBoardLoads = syncSpeedMapOnMeetingImport(parsed, {
  sameMeeting: false,
  meetingKey: "1,2,3,4,5,6,7",
  meetingId: "2026-10-15-hawkesbury",
});

for (const race of Object.values(beforeBoardLoads.raceMap)) {
  assert.equal(
    race.placementEngine,
    undefined,
    "an unavailable board engine must not be recorded as completed placement",
  );
}

await import("../src/components/speed-map/speed-map-board.tsx");
const reconciled = reconcileSpeedMapActivePlacement(beforeBoardLoads);

assert.equal(reconciled.raceMap["2"]?.runners.length, 8);
for (const [raceNo, race] of Object.entries(reconciled.raceMap)) {
  assert.equal(race.placementEngine, "active-board-v33");
  assert.ok(race.runners.every((runner) => Number.isFinite(runner.x) && Number.isFinite(runner.y)));
  assert.equal(
    new Set(race.runners.map((runner) => `${runner.x.toFixed(6)},${runner.y.toFixed(6)}`)).size,
    race.runners.length,
    `race ${raceNo} must not leave runners stacked at the import origin`,
  );
}

console.log("[pass] deferred Speed Map placement reconciles all Hawkesbury races");
