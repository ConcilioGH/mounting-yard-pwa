/**
 * Meeting backup round-trip: export → clear → restore → verify assessments + Fin/SP + Race Review.
 * npx tsx scripts/test-ipad-yard-meeting-backup.mts
 */
import { readFileSync } from "node:fs";
import { racedayCompactGroups, SWEAT_POS_KEY } from "../src/lib/constants.ts";

const MEETING_ID = "2026-07-01-randwick-kensington";
const MEETING_MANIFEST_KEY = "mounting-yard-meeting-manifest-v1";
const MEETING_STORE_KEY = "ipad-yard-meeting-store-v2";
const RACES_KEY = "ipad-yard-races-v1";

const storage = new Map<string, string>();
(globalThis as unknown as { window: Record<string, unknown>; localStorage: Storage; sessionStorage: Storage; document: { getElementById: () => null } }).window =
  globalThis as unknown as Record<string, unknown>;
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

const yard = (globalThis as unknown as { ipadYard: Record<string, unknown> }).ipadYard as {
  races: Array<{ id: string; runners: Array<{ no: number; horse: string; w_ir?: string }> }>;
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
    tapCount: number;
  };
  activeMeetingId: string;
  buildMeetingBackupPackage: () => { kind: string; meetingId: string };
  clearMeetingLocalData: (id: string, opts: { skipConfirm: boolean }) => void;
  restoreMeetingBackup: (pkg: unknown, opts: { skipConfirm: boolean }) => boolean;
  buildRaceReviewCsvText: () => string;
};

yard.races = [
  {
    id: "R1",
    runners: [
      { no: 1, horse: "Adeleke", w_ir: "N/A" },
      { no: 2, horse: "Castelbella", w_ir: "N/A" },
      { no: 3, horse: "Consulate", w_ir: "N/A" },
    ],
  },
];
yard.activeMeetingId = MEETING_ID;
yard.state.meetingCardSource = "tab";
yard.state.tabVenueCode = "RKE";
yard.state.meetingDate = "2026-07-01";
yard.state.meetingVenue = "Randwick Kensington";
yard.state.loadedMeetingPath = `meetings/${MEETING_ID}`;
yard.state.meetingLabel = "Randwick Kensington · 2026-07-01";
yard.state.selectedRaceId = "R1";
yard.state.selectedRunnerNo = 1;
yard.state.assessments = {
  "R1-1": { positive: { "Clean+": 2 }, negative: {}, gear: {}, wet: {}, notes: "hot" },
  "R1-2": { positive: { "Calm+": 1 }, negative: {}, gear: {}, wet: {}, notes: "ok" },
};

const backup = yard.buildMeetingBackupPackage();
if (backup.kind !== "ipad-yard-meeting-backup" || backup.meetingId !== MEETING_ID) {
  throw new Error("Invalid backup package");
}

yard.clearMeetingLocalData(MEETING_ID, { skipConfirm: true });
if (yard.activeMeetingId) throw new Error("Expected active meeting cleared");
if (storage.has(`resulted-sp:${MEETING_ID}`)) throw new Error("Expected resulted SP cleared");

const restored = yard.restoreMeetingBackup(backup, { skipConfirm: true });
if (!restored) throw new Error("Restore failed");

if (yard.activeMeetingId !== MEETING_ID) {
  throw new Error(`Expected activeMeetingId ${MEETING_ID}, got ${yard.activeMeetingId}`);
}
if (!yard.state.assessments["R1-1"] || !yard.state.assessments["R1-2"]) {
  throw new Error("Assessments not restored");
}

const ResultedSpDom = (globalThis as unknown as {
  ResultedSpDom: {
    getRunnerResult: (
      id: string,
      raceNo: string,
      runnerNo: number,
      horse: string,
    ) => { finishPosition: number | string; sp: string } | null;
  };
}).ResultedSpDom;

const fin = ResultedSpDom.getRunnerResult(MEETING_ID, "1", 1, "Adeleke");
if (!fin || fin.finishPosition !== 1 || !fin.sp) {
  throw new Error(`Fin/SP not restored: ${JSON.stringify(fin)}`);
}

const reviewCsv = yard.buildRaceReviewCsvText();
const lines = reviewCsv.split("\n").filter(Boolean);
if (lines.length !== 4) {
  throw new Error(`Expected 4 Race Review lines (header + 3 runners), got ${lines.length}`);
}
if (!reviewCsv.includes("hot") || !reviewCsv.includes("4.40")) {
  throw new Error("Race Review CSV missing assessment or SP data");
}

console.log("Meeting backup round-trip OK");
console.log({
  meetingId: MEETING_ID,
  assessments: Object.keys(yard.state.assessments).length,
  fin: fin,
  reviewRows: lines.length - 1,
});

if ((yard as { resultedSpPoller?: { stop?: () => void } }).resultedSpPoller?.stop) {
  (yard as { resultedSpPoller: { stop: () => void } }).resultedSpPoller.stop();
}
process.exit(0);
