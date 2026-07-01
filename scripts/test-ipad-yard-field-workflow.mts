/**
 * Field workflow smoke: TAB meeting → hide scratched → assess → results → backup → Race Review CSV.
 * npx tsx scripts/test-ipad-yard-field-workflow.mts
 */
import { readFileSync } from "node:fs";
import { racedayCompactGroups, SWEAT_POS_KEY } from "../src/lib/constants.ts";

const MEETING_ID = "2026-07-01-randwick-kensington";
const MEETING_MANIFEST_KEY = "mounting-yard-meeting-manifest-v1";
const MEETING_STORE_KEY = "ipad-yard-meeting-store-v2";
const RACES_KEY = "ipad-yard-races-v1";

const storage = new Map<string, string>();
(globalThis as unknown as {
  window: Record<string, unknown>;
  localStorage: Storage;
  sessionStorage: Storage;
  document: { getElementById: () => null };
}).window = globalThis as unknown as Record<string, unknown>;
(globalThis as unknown as { document: { getElementById: () => null } }).document = {
  getElementById: () => null,
};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => {
    storage.set(k, v);
  },
  removeItem: (k) => {
    storage.delete(k);
  },
  clear: () => storage.clear(),
  key: () => null,
  length: 0,
};
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
};

storage.set(
  MEETING_MANIFEST_KEY,
  JSON.stringify({
    meetingId: MEETING_ID,
    meetingKey: "1",
    trackName: "Randwick Kensington",
    trackSlug: "randwick-kensington",
    date: "2026-07-01",
    meetingFolderPath: `meetings/${MEETING_ID}`,
    raceNos: ["1"],
    importedAt: new Date().toISOString(),
  }),
);

eval(`(function(){\n${readFileSync("public/resulted-sp-dom.js", "utf8")}\n})()`);
eval(`(function(){\n${readFileSync("public/meeting-export-delivery-dom.js", "utf8")}\n})()`);

(globalThis as unknown as { IPAD_YARD_DEFAULT_RACES: unknown[] }).IPAD_YARD_DEFAULT_RACES = [];
(globalThis as unknown as { IPAD_YARD_FACTOR_GROUPS: unknown[] }).IPAD_YARD_FACTOR_GROUPS =
  racedayCompactGroups;
(globalThis as unknown as { IPAD_YARD_CONFIG: Record<string, unknown> }).IPAD_YARD_CONFIG = {
  build: "test",
  sweatPosKey: SWEAT_POS_KEY,
  assessmentsKey: "ipad-yard-assessments",
  meetingStoreKey: MEETING_STORE_KEY,
  racesKey: RACES_KEY,
  manifestKey: MEETING_MANIFEST_KEY,
  gearTiles: [],
  wetTile: { code: "WET", label: "Wet" },
  wetBodyTypes: [],
  wetFeet: [],
  gearLocations: [],
};

const ipadJs = readFileSync("public/ipad-yard-dom.js", "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\n\s*window\.ipadYard\.init\(\);\s*\n?/, "\n");
eval(`(function(){\n${ipadJs}\n})()`);

type Runner = { no: number; horse: string; scratched?: boolean; w_ir?: string };
type Race = { id: string; title: string; runners: Runner[] };

const yard = (globalThis as unknown as { ipadYard: Record<string, unknown> }).ipadYard as {
  races: Race[];
  state: {
    assessments: Record<string, unknown>;
    meetingCardSource: string;
    tabVenueCode: string;
    meetingDate: string;
    meetingVenue: string;
    meetingLabel: string;
    loadedMeetingPath: string;
    selectedRaceId: string | null;
    selectedRunnerNo: number | null;
    hideScratched: boolean;
  };
  activeMeetingId: string;
  setHideScratchedDefaultForSource: (source: string) => void;
  setMeetingCardMeta: (meta: Record<string, string>) => void;
  activateMeetingSession: (manifest: Record<string, unknown>, opts: Record<string, unknown>) => void;
  getVisibleRunners: (race: Race) => Runner[];
  getRaceCompleteness: (race: Race) => { assessed: number; total: number };
  getMeetingHealthSummary: () => {
    meetingId: string;
    cardSource: string;
    assessmentCount: number;
    resultedRacesCount: number;
    backupRecommended: boolean;
  };
  buildMeetingBackupPackage: () => { kind: string; meetingId: string };
  recordLastBackupAt: (id: string) => void;
  buildRaceReviewCsvText: () => string;
  noteResultImportForBackupReminder: (id: string) => void;
  resultedSpPoller?: { stop?: () => void };
};

yard.races = [
  {
    id: "R1",
    title: "R1 Test",
    runners: [
      { no: 1, horse: "Adeleke", w_ir: "N/A" },
      { no: 2, horse: "Castelbella", w_ir: "N/A" },
      { no: 3, horse: "Consulate", w_ir: "N/A", scratched: true },
      { no: 4, horse: "Dark Prince", w_ir: "N/A" },
    ],
  },
];
yard.activeMeetingId = MEETING_ID;
yard.setMeetingCardMeta({
  source: "tab",
  tabVenueCode: "RKE",
  meetingDate: "2026-07-01",
  meetingVenue: "Randwick Kensington",
});
yard.setHideScratchedDefaultForSource("tab");
yard.state.meetingLabel = "Randwick Kensington · 2026-07-01";
yard.state.loadedMeetingPath = `meetings/${MEETING_ID}`;
yard.state.selectedRaceId = "R1";
yard.state.selectedRunnerNo = 1;
yard.state.assessments = {
  "R1-1": { positive: { "Clean+": 2 }, negative: {}, gear: {}, wet: {}, notes: "hot" },
  "R1-2": { positive: { "Calm+": 1 }, negative: {}, gear: {}, wet: {}, notes: "ok" },
  "R1-4": { positive: { "Alert+": 1 }, negative: {}, gear: {}, wet: {}, notes: "late" },
};

if (!yard.state.hideScratched) {
  throw new Error("Expected hideScratched default ON for TAB meetings");
}

const visible = yard.getVisibleRunners(yard.races[0]);
if (visible.length !== 3) {
  throw new Error(`Expected 3 visible runners, got ${visible.length}`);
}
if (visible.some((r) => r.scratched)) {
  throw new Error("Scratched runner should be hidden from visible list");
}

const complete = yard.getRaceCompleteness(yard.races[0]);
if (complete.total !== 3 || complete.assessed !== 3) {
  throw new Error(`Expected completeness 3/3, got ${complete.assessed}/${complete.total}`);
}

storage.set(
  `resulted-sp:${MEETING_ID}`,
  JSON.stringify({
    meetingId: MEETING_ID,
    updatedAt: new Date().toISOString(),
    races: {
      "1": {
        status: "imported",
        resultImportStatus: "imported",
        guardPassed: true,
        importedAt: "2026-07-01T05:00:00.000Z",
        guardMeta: {
          importedAt: "2026-07-01T05:00:00.000Z",
          runnerOverlapCount: 4,
          yardRunnerCount: 4,
          tabRunnerCount: 4,
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
            officialSP: "",
            finishPosition: "",
            margin: "",
            resultStatus: "scratched",
            importedAt: "2026-07-01T05:00:00.000Z",
            source: "tab",
          },
          {
            raceNo: "1",
            runnerNo: 4,
            horse: "Dark Prince",
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

yard.noteResultImportForBackupReminder(MEETING_ID);

const backup = yard.buildMeetingBackupPackage();
if (backup.kind !== "ipad-yard-meeting-backup" || backup.meetingId !== MEETING_ID) {
  throw new Error("Invalid backup package");
}
yard.recordLastBackupAt(MEETING_ID);

const health = yard.getMeetingHealthSummary();
if (health.meetingId !== MEETING_ID) throw new Error("Health meetingId mismatch");
if (health.cardSource !== "tab") throw new Error("Health card source mismatch");
if (health.assessmentCount !== 3) {
  throw new Error(`Expected 3 assessed runners in health, got ${health.assessmentCount}`);
}
if (health.resultedRacesCount !== 1) {
  throw new Error(`Expected 1 resulted race, got ${health.resultedRacesCount}`);
}

const reviewCsv = yard.buildRaceReviewCsvText();
const lines = reviewCsv.split("\n").filter(Boolean);
if (lines.length !== 5) {
  throw new Error(`Expected 5 Race Review lines (header + 4 runners), got ${lines.length}`);
}

const scratchedRow = lines.find((line) => line.includes("Consulate"));
if (!scratchedRow) {
  throw new Error("Race Review CSV missing scratched runner row");
}
if (!scratchedRow.includes(",1,") && !scratchedRow.match(/,1,|,1$/)) {
  const cols = scratchedRow.split(",");
  const scratchedCol = cols[8];
  if (scratchedCol !== "1") {
    throw new Error(`Expected scratched=1 for Consulate, got ${scratchedCol}`);
  }
}

const activeRows = lines.slice(1).filter((line) => !line.includes("Consulate"));
if (activeRows.length !== 3) {
  throw new Error("Expected 3 active runner rows in Race Review CSV");
}
if (!reviewCsv.includes("hot") || !reviewCsv.includes("4.40") || !reviewCsv.includes("late")) {
  throw new Error("Race Review CSV missing assessment or result data");
}

console.log("Field workflow smoke OK");
console.log({
  meetingId: MEETING_ID,
  visibleRunners: visible.length,
  completeness: complete,
  health,
  reviewRows: lines.length - 1,
  scratchedInCsv: Boolean(scratchedRow),
});

if (yard.resultedSpPoller?.stop) yard.resultedSpPoller.stop();
process.exit(0);
