/**
 * Validates Resulted SP export diagnostics for TAB vs blocked CSV meetings.
 * npx tsx scripts/test-ipad-yard-result-diagnostics.mts
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

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

const resultedCode = readFileSync(`${root}/public/resulted-sp-dom.js`, "utf8");
eval(`(function(){\n${resultedCode}\n})()`);

const ResultedSpDom = (globalThis as unknown as {
  ResultedSpDom: {
    getRaceImportState: (meetingId: string, raceNo: string) => {
      resultImportStatus: string;
      guardPassed: boolean;
      importedAt: string;
      guardMeta: {
        runnerOverlapCount: number;
        yardRunnerCount: number;
        tabRunnerCount: number;
        importedAt: string;
      } | null;
    } | null;
    getRunnerResult: (
      meetingId: string,
      raceNo: string,
      runnerNo: number,
      horse: string,
    ) => { finishPosition: number | string; sp: string } | null;
    clearMeetingResults: (meetingId: string) => void;
  };
}).ResultedSpDom;

function parseExportHeaders(ipadJs: string): string[] {
  const headerBlock = ipadJs.match(
    /buildExportCsvText:\s*function\s*\(\)\s*\{[\s\S]*?var headers = \[([\s\S]*?)\];/,
  );
  if (!headerBlock) throw new Error("Could not parse export headers");
  return [...headerBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function parseCsvRow(row: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') {
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

function col(headers: string[], row: string[], name: string) {
  const idx = headers.indexOf(name);
  return idx >= 0 ? row[idx] : "";
}

const ipadJs = readFileSync(`${root}/public/ipad-yard-dom.js`, "utf8");
const headers = parseExportHeaders(ipadJs);
const diagCols = [
  "result_import_status",
  "result_imported_at",
  "result_runner_overlap_count",
  "result_yard_runner_count",
  "result_tab_runner_count",
  "resulted_sp_guard_passed",
];
for (const h of diagCols) {
  if (!headers.includes(h)) throw new Error(`Missing export column: ${h}`);
}

// --- Scenario 1: TAB-loaded meeting with imported R1 ---
const tabMeetingId = "2026-07-01-randwick-kensington";
const importedAt = "2026-07-01T04:30:00.000Z";
localStorageShim.set(
  `resulted-sp:${tabMeetingId}`,
  JSON.stringify({
    meetingId: tabMeetingId,
    updatedAt: importedAt,
    races: {
      "1": {
        status: "imported",
        resultImportStatus: "imported",
        guardPassed: true,
        importedAt,
        guardMeta: {
          tabDate: "2026-07-01",
          tabVenue: "Randwick Kensington",
          importedAt,
          raceNo: "1",
          runnerOverlapCount: 9,
          yardRunnerCount: 9,
          tabRunnerCount: 9,
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
            importedAt,
            source: "tab",
          },
        ],
      },
    },
  }),
);

const tabState = ResultedSpDom.getRaceImportState(tabMeetingId, "1");
if (!tabState || tabState.resultImportStatus !== "imported" || !tabState.guardPassed) {
  throw new Error(`TAB import state invalid: ${JSON.stringify(tabState)}`);
}
const tabResult = ResultedSpDom.getRunnerResult(tabMeetingId, "1", 1, "Adeleke");
if (!tabResult || tabResult.finishPosition !== 1 || !tabResult.sp) {
  throw new Error(`TAB runner result missing: ${JSON.stringify(tabResult)}`);
}

// Simulate export row values for TAB meeting
const tabExportRow = [
  tabMeetingId,
  "2026-07-01",
  "Randwick Kensington",
  "tab",
  "RKE",
  "1",
  "R1",
  "Race 1",
  "1",
  "1",
  "Adeleke",
  "Adeleke",
  "1",
  "N/A",
  "0",
  "",
  "",
  "",
  tabResult.sp,
  "1",
  tabResult.sp,
  "",
  "true",
  tabState.resultImportStatus,
  tabState.importedAt,
  String(tabState.guardMeta?.runnerOverlapCount ?? ""),
  String(tabState.guardMeta?.yardRunnerCount ?? ""),
  String(tabState.guardMeta?.tabRunnerCount ?? ""),
];
const tabRowMap = Object.fromEntries(headers.map((h, i) => [h, tabExportRow[i] ?? ""]));
if (tabRowMap.result_import_status !== "imported") {
  throw new Error("TAB export should have result_import_status=imported");
}
if (tabRowMap.resulted_sp_guard_passed !== "true") {
  throw new Error("TAB export should have resulted_sp_guard_passed=true");
}
if (!tabRowMap.finish_position || !tabRowMap.sp) {
  throw new Error("TAB export should include finish_position and sp");
}

// --- Scenario 2: Old CSV meeting blocked by today's TAB card ---
const oldMeetingId = "2026-06-10-kensington";
localStorageShim.set(
  `resulted-sp:${oldMeetingId}`,
  JSON.stringify({
    meetingId: oldMeetingId,
    updatedAt: importedAt,
    races: {
      "1": {
        status: "failed",
        resultImportStatus: "blocked",
        guardPassed: false,
        lastError:
          "Resulted SP blocked: TAB card is for 2026-07-01 RKE Randwick Kensington, but loaded Yard meeting is 2026-06-10 Kensington.",
        guardMeta: {
          tabDate: "2026-07-01",
          tabVenue: "RKE Randwick Kensington",
          importedAt,
          raceNo: "1",
          runnerOverlapCount: 0,
          yardRunnerCount: 10,
          tabRunnerCount: 9,
        },
        runners: [],
      },
    },
  }),
);

const blockedState = ResultedSpDom.getRaceImportState(oldMeetingId, "1");
if (!blockedState || blockedState.resultImportStatus !== "blocked" || blockedState.guardPassed) {
  throw new Error(`Blocked state invalid: ${JSON.stringify(blockedState)}`);
}
const blockedResult = ResultedSpDom.getRunnerResult(oldMeetingId, "1", 1, "Royal Air Force");
if (blockedResult) {
  throw new Error("Blocked meeting should not expose runner results on export");
}

const blockedExportRow = headers.map((h) => {
  const map: Record<string, string> = {
    meetingId: oldMeetingId,
    date: "2026-06-10",
    venue: "Kensington",
    meeting_card_source: "csv",
    tab_venue_code: "",
    raceNo: "1",
    runner_no: "1",
    runnerName: "Royal Air Force",
    finish_position: "",
    sp: "",
    margin: "",
    official_sp: "",
    resulted_sp_guard_passed: "false",
    result_import_status: blockedState.resultImportStatus,
    result_imported_at: "",
    result_runner_overlap_count: String(blockedState.guardMeta?.runnerOverlapCount ?? ""),
    result_yard_runner_count: String(blockedState.guardMeta?.yardRunnerCount ?? ""),
    result_tab_runner_count: String(blockedState.guardMeta?.tabRunnerCount ?? ""),
  };
  return map[h] ?? "";
});

if (blockedExportRow[headers.indexOf("finish_position")]) {
  throw new Error("Blocked CSV meeting export should have blank finish_position");
}
if (blockedExportRow[headers.indexOf("sp")]) {
  throw new Error("Blocked CSV meeting export should have blank sp");
}
if (col(headers, blockedExportRow, "result_import_status") !== "blocked") {
  throw new Error("Blocked export should have result_import_status=blocked");
}
if (col(headers, blockedExportRow, "resulted_sp_guard_passed") !== "false") {
  throw new Error("Blocked export should have resulted_sp_guard_passed=false");
}
if (col(headers, blockedExportRow, "result_runner_overlap_count") !== "0") {
  throw new Error("Blocked export should include overlap diagnostic 0");
}

// --- Clear meeting results safety ---
ResultedSpDom.clearMeetingResults(tabMeetingId);
if (localStorageShim.has(`resulted-sp:${tabMeetingId}`)) {
  throw new Error("clearMeetingResults should remove resulted-sp storage key");
}
if (ResultedSpDom.getRaceImportState(tabMeetingId, "1")) {
  throw new Error("State should be empty after clear");
}

console.log("Result diagnostics test OK");
console.log({
  tab: {
    result_import_status: tabRowMap.result_import_status,
    guard: tabRowMap.resulted_sp_guard_passed,
    overlap: tabRowMap.result_runner_overlap_count,
    finish: tabRowMap.finish_position,
    sp: tabRowMap.sp,
  },
  blockedCsv: {
    result_import_status: col(headers, blockedExportRow, "result_import_status"),
    guard: col(headers, blockedExportRow, "resulted_sp_guard_passed"),
    overlap: col(headers, blockedExportRow, "result_runner_overlap_count"),
    finish: col(headers, blockedExportRow, "finish_position"),
    sp: col(headers, blockedExportRow, "sp"),
  },
});
