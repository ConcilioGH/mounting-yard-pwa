/**
 * Race Review CSV: one row per runner; unassessed runners included with blank Yard fields.
 * npx tsx scripts/test-race-review-export.mts
 */
import { readFileSync } from "node:fs";
import { racedayCompactGroups, SWEAT_POS_KEY } from "../src/lib/constants.ts";

const localStorageShim = new Map<string, string>();
(globalThis as unknown as { window: Record<string, unknown>; localStorage: Storage }).window =
  globalThis as unknown as Record<string, unknown>;
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k) => localStorageShim.get(k) ?? null,
  setItem: (k, v) => {
    localStorageShim.set(k, v);
  },
  removeItem: (k) => {
    localStorageShim.delete(k);
  },
  clear: () => localStorageShim.clear(),
  key: () => null,
  length: 0,
};

const MEETING_MANIFEST_KEY = "mounting-yard-meeting-manifest-v1";
const meetingId = "2026-07-01-randwick-kensington";
localStorageShim.set(
  MEETING_MANIFEST_KEY,
  JSON.stringify({
    meetingId,
    meetingKey: "1",
    trackName: "Randwick Kensington",
    trackSlug: "randwick-kensington",
    date: "2026-07-01",
    meetingFolderPath: `meetings/${meetingId}`,
    raceNos: ["1"],
    importedAt: new Date().toISOString(),
  }),
);

localStorageShim.set(
  `resulted-sp:${meetingId}`,
  JSON.stringify({
    meetingId,
    updatedAt: new Date().toISOString(),
    races: {
      "1": {
        status: "imported",
        resultImportStatus: "imported",
        guardPassed: true,
        importedAt: "2026-07-01T05:00:00.000Z",
        guardMeta: {
          importedAt: "2026-07-01T05:00:00.000Z",
          runnerOverlapCount: 3,
          yardRunnerCount: 3,
          tabRunnerCount: 3,
        },
        runners: [
          {
            raceNo: "1",
            runnerNo: 1,
            horse: "Adeleke",
            officialSP: "4.40",
            finishPosition: 1,
            margin: "",
            resultStatus: "resulted",
            importedAt: "2026-07-01T05:00:00.000Z",
            source: "tab",
          },
          {
            raceNo: "1",
            runnerNo: 2,
            horse: "Castelbella",
            officialSP: "3.20",
            finishPosition: 2,
            margin: "1.5L",
            resultStatus: "resulted",
            importedAt: "2026-07-01T05:00:00.000Z",
            source: "tab",
          },
          {
            raceNo: "1",
            runnerNo: 3,
            horse: "Consulate",
            officialSP: "8.00",
            finishPosition: 3,
            margin: "2L",
            resultStatus: "resulted",
            importedAt: "2026-07-01T05:00:00.000Z",
            source: "tab",
          },
        ],
      },
    },
  }),
);

const resultedCode = readFileSync("public/resulted-sp-dom.js", "utf8");
eval(`(function(){\n${resultedCode}\n})()`);

const root = process.cwd().replace(/\\/g, "/");
const ipadJs = readFileSync("public/ipad-yard-dom.js", "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\n\s*window\.ipadYard\.init\(\);\s*\n?/, "\n");
const meetingExportCode = readFileSync("public/meeting-export-delivery-dom.js", "utf8");

(globalThis as unknown as { IPAD_YARD_DEFAULT_RACES: unknown[] }).IPAD_YARD_DEFAULT_RACES = [];
(globalThis as unknown as { IPAD_YARD_FACTOR_GROUPS: unknown[] }).IPAD_YARD_FACTOR_GROUPS =
  racedayCompactGroups;
(globalThis as unknown as { IPAD_YARD_CONFIG: Record<string, unknown> }).IPAD_YARD_CONFIG = {
  build: "test",
  sweatPosKey: SWEAT_POS_KEY,
  assessmentsKey: "ipad-yard-assessments",
  meetingStoreKey: "ipad-yard-meeting-store-v2",
  racesKey: "ipad-yard-races-v1",
  manifestKey: MEETING_MANIFEST_KEY,
  gearTiles: [],
  wetTile: { code: "WET", label: "Wet" },
  wetBodyTypes: [],
  wetFeet: [],
  gearLocations: [],
};

eval(`(function(){\n${meetingExportCode}\n})()`);
eval(`(function(){\n${ipadJs}\n})()`);

const ipadYard = (globalThis as unknown as {
  ipadYard: {
    races: Array<{
      id: string;
      title: string;
      runners: Array<{ no: number; horse: string; scratched?: boolean; w_ir?: string }>;
    }>;
    state: {
      assessments: Record<string, unknown>;
      meetingCardSource: string;
      tabVenueCode: string;
      meetingDate: string;
      meetingVenue: string;
      meetingLabel: string;
      loadedMeetingPath: string;
      tapCount: number;
      selectedRaceId: string | null;
      selectedRunnerNo: number | null;
    };
    activeMeetingId: string;
    buildRaceReviewCsvText: () => string;
  };
}).ipadYard;

ipadYard.races = [
  {
    id: "R1",
    title: "Race 1",
    runners: [
      { no: 1, horse: "Adeleke", w_ir: "N/A" },
      { no: 2, horse: "Castelbella", w_ir: "N/A" },
      { no: 3, horse: "Consulate", w_ir: "N/A" },
    ],
  },
];
ipadYard.activeMeetingId = meetingId;
ipadYard.state.meetingCardSource = "tab";
ipadYard.state.tabVenueCode = "RKE";
ipadYard.state.meetingDate = "2026-07-01";
ipadYard.state.meetingVenue = "Randwick Kensington";
ipadYard.state.loadedMeetingPath = `meetings/${meetingId}`;
ipadYard.state.assessments = {
  "R1-1": {
    positive: { "Clean+": 2, "Dapple+": 1 },
    negative: { "BH-": -1 },
    gear: {},
    wet: {},
    notes: "assessed one",
  },
  "R1-2": {
    positive: { "Calm+": 1 },
    negative: {},
    gear: { FT: [1] },
    wet: {},
    notes: "assessed two",
  },
};

const csv = ipadYard.buildRaceReviewCsvText();
const lines = csv.split("\n").filter(Boolean);
const headers = lines[0].split(",");
const required = [
  "meetingId",
  "raceNo",
  "runnerNo",
  "runnerName",
  "finish_position",
  "sp",
  "result_import_status",
  "resulted_sp_guard_passed",
  "total_positive",
  "sweat_json",
  "physical_json",
  "gear_json",
  "notes",
];
for (const h of required) {
  if (!headers.includes(h)) throw new Error(`Missing column: ${h}`);
}

function parseRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function col(row: string[], name: string) {
  const idx = headers.indexOf(name);
  return idx >= 0 ? row[idx] : "";
}

const r1Rows = lines.slice(1).filter((line) => {
  const row = parseRow(line);
  return col(row, "raceNo") === "1";
});

if (r1Rows.length !== 3) {
  throw new Error(`Expected 3 R1 rows (all runners), got ${r1Rows.length}`);
}

const assessedRows = r1Rows.filter((line) => col(parseRow(line), "total_positive") !== "");
const unassessedRows = r1Rows.filter((line) => col(parseRow(line), "total_positive") === "");

if (assessedRows.length !== 2) {
  throw new Error(`Expected 2 assessed rows, got ${assessedRows.length}`);
}
if (unassessedRows.length !== 1) {
  throw new Error(`Expected 1 unassessed row, got ${unassessedRows.length}`);
}

const unassessed = parseRow(unassessedRows[0]);
if (col(unassessed, "runnerName") !== "Consulate") {
  throw new Error("Unassessed runner should be Consulate");
}
if (col(unassessed, "sweat_json") || col(unassessed, "notes")) {
  throw new Error("Unassessed runner should have blank Yard fields");
}
if (!col(unassessed, "finish_position") || !col(unassessed, "sp")) {
  throw new Error("Unassessed but imported runner should still have result fields");
}

const assessed1 = parseRow(assessedRows.find((l) => col(parseRow(l), "runnerNo") === "1")!);
if (col(assessed1, "result_import_status") !== "imported") {
  throw new Error("Expected result_import_status=imported");
}
if (col(assessed1, "resulted_sp_guard_passed") !== "true") {
  throw new Error("Expected resulted_sp_guard_passed=true");
}
if (!col(assessed1, "sweat_json")) {
  throw new Error("Assessed runner should have sweat_json");
}

console.log("Race Review export test OK");
console.log({
  r1_rows: r1Rows.length,
  assessed: assessedRows.length,
  unassessed_runner: col(unassessed, "runnerName"),
  sample_finish: col(assessed1, "finish_position"),
  sample_sp: col(assessed1, "sp"),
});
