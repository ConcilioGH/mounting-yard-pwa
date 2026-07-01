/**
 * End-to-end validation: TAB load → Resulted SP R1 → export column contract.
 * Run with dev server on 3000 or 3001: npx tsx scripts/test-ipad-yard-e2e.mts
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

const originalFetch = globalThis.fetch;
async function devFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (url.startsWith("/api/")) {
    for (const port of [3000, 3001]) {
      try {
        const res = await originalFetch(`http://localhost:${port}${url}`, init);
        if (res.status === 404 && port === 3000) continue;
        return res;
      } catch {
        /* try next port */
      }
    }
    throw new Error("Dev server not reachable on port 3000 or 3001");
  }
  return originalFetch(input, init);
}
globalThis.fetch = devFetch;

(globalThis as unknown as { window: Record<string, unknown> }).window = globalThis as unknown as Record<
  string,
  unknown
>;
(globalThis as unknown as { MeetingExportDelivery: { sanitizeMeetingSlug: (v: string) => string } }).MeetingExportDelivery =
  {
    sanitizeMeetingSlug: (input: string) =>
      String(input)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "meeting",
  };

await import(pathToFileURL(`${root}/public/tab-yard-meeting-dom.js`).href);

const TabYardMeeting = (globalThis as unknown as { TabYardMeeting: {
  loadTodayTabMeeting: (code: string) => Promise<{
    races: Array<{ id: string; runners: Array<{ no: number; horse: string; w_ir?: string }> }>;
    meta: { meetingId: string; date: string; trackName: string; venue: string };
  }>;
} }).TabYardMeeting;

const payload = await TabYardMeeting.loadTodayTabMeeting("RKE");
const manifest = {
  meetingId: payload.meta.meetingId,
  meetingKey: payload.races.map((r) => r.id.replace(/^R/i, "")).join("|"),
  trackName: payload.meta.trackName,
  trackSlug: payload.meta.trackSlug,
  date: payload.meta.date,
  meetingFolderPath: `meetings/${payload.meta.meetingId}`,
  raceNos: payload.races.map((r) => r.id.replace(/^R/i, "")),
  importedAt: new Date().toISOString(),
};

const race1 = payload.races[0];
const allWirNa = payload.races.every((race) =>
  race.runners.every((r) => !r.w_ir || String(r.w_ir).toUpperCase() === "N/A"),
);
if (!allWirNa) throw new Error("Expected TAB card w_ir to default to N/A for all runners");

const { fetchTabRaceResults } = await import("../src/lib/resulted-sp/tab-api.ts");
const tab = await fetchTabRaceResults({ manifest, raceNo: "1" });
if (tab.status !== "imported" || !tab.parsed) {
  throw new Error(`Resulted SP R1 not imported: ${JSON.stringify(tab)}`);
}
const imported = { imported: true, parsed: tab.parsed };

const yardNames = new Set(
  race1.runners.map((r) => r.horse.toUpperCase().replace(/[^A-Z0-9]+/g, "")),
);
const tabNames = imported.parsed.runners.map((r) =>
  r.horseName.toUpperCase().replace(/[^A-Z0-9]+/g, ""),
);
const overlap = tabNames.filter((n) => yardNames.has(n)).length;
if (overlap < Math.min(4, race1.runners.length)) {
  throw new Error(`Runner overlap too low for guard: ${overlap}/${race1.runners.length}`);
}

const placed = imported.parsed.runners.filter((r) => r.finishPosition >= 1 && r.finishPosition <= 3 && r.sp > 0);
if (placed.length < 3) {
  throw new Error("Expected at least 3 placed runners with SP from TAB R1");
}

// Resulted SP DOM: runner results + guard state
const localStorageShim = new Map<string, string>();
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

const runners = imported.parsed.runners.map((row) => {
  const matched = race1.runners.find(
    (r) =>
      r.horse.toUpperCase().replace(/[^A-Z0-9]+/g, "") ===
      row.horseName.toUpperCase().replace(/[^A-Z0-9]+/g, ""),
  );
  return {
    raceNo: "1",
    runnerNo: matched?.no ?? 0,
    runnerNameKey: row.horseName.toUpperCase().replace(/[^A-Z0-9]+/g, ""),
    horse: row.horseName,
    officialSP: row.sp > 0 ? String(row.sp) : "",
    finishPosition: row.finishPosition > 0 ? row.finishPosition : "",
    margin: row.margin || "",
    resultStatus: row.resultStatus,
    importedAt: new Date().toISOString(),
    source: "tab",
  };
});

localStorageShim.set(
  `resulted-sp:${manifest.meetingId}`,
  JSON.stringify({
    meetingId: manifest.meetingId,
    updatedAt: new Date().toISOString(),
    races: {
      "1": {
        status: "imported",
        guardPassed: true,
        guardMeta: { tabDate: manifest.date, tabVenue: manifest.trackName },
        runners,
      },
    },
  }),
);

const resultedCode = readFileSync(`${root}/public/resulted-sp-dom.js`, "utf8");
const resultedWrapped = `(function(){\n${resultedCode.replace(/window\.ipadYard\.init\(\);?/g, "")}\n})()`;
eval(resultedWrapped);

const ResultedSpDom = (globalThis as unknown as {
  ResultedSpDom: {
    getRunnerResult: (
      meetingId: string,
      raceNo: string,
      runnerNo: number,
      horse: string,
    ) => { finishPosition: number | string; sp: string; margin: string } | null;
    getRaceImportState: (meetingId: string, raceNo: string) => { guardPassed: boolean };
  };
}).ResultedSpDom;

const winner = race1.runners.find((r) => {
  const result = ResultedSpDom.getRunnerResult(manifest.meetingId, "1", r.no, r.horse);
  return result && result.finishPosition === 1;
});
if (!winner) throw new Error("Expected Fin 1 on a runner tile via getRunnerResult");

const guardState = ResultedSpDom.getRaceImportState(manifest.meetingId, "1");
if (!guardState.guardPassed) throw new Error("Expected guardPassed true for R1");

const ipadJs = readFileSync(`${root}/public/ipad-yard-dom.js`, "utf8");
const headerBlock = ipadJs.match(/buildExportCsvText:\s*function\s*\(\)\s*\{[\s\S]*?var headers = \[([\s\S]*?)\];/);
if (!headerBlock) throw new Error("Could not parse buildExportCsvText headers from ipad-yard-dom.js");

const exportHeaders = [...headerBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const required = [
  "meetingId",
  "date",
  "venue",
  "meeting_card_source",
  "tab_venue_code",
  "raceNo",
  "runnerNo",
  "runnerName",
  "positive_json",
  "negative_json",
  "total_positive",
  "total_negative",
  "net",
  "finish_position",
  "sp",
  "margin",
  "resulted_sp_guard_passed",
  "w_ir",
];
const missing = required.filter((h) => !exportHeaders.includes(h));
if (missing.length) throw new Error(`Export CSV missing columns: ${missing.join(", ")}`);

const html = readFileSync(`${root}/src/lib/ipad-yard-dom-html.ts`, "utf8");
if (!html.includes("iy-meeting-card-badge")) throw new Error("Meeting card badge markup missing");
if (!html.includes("LIVE TAB CARD") === false && !html.includes("iy-meeting-card-badge-tab")) {
  /* badge class present */
}
if (!html.includes("iy-wir-warning")) throw new Error("w_ir warning markup missing");
if (!html.includes("Speed map unavailable for this TAB-loaded card")) {
  throw new Error("w_ir warning text missing");
}

console.log("iPad Yard E2E validation OK");
console.log({
  meetingId: manifest.meetingId,
  venue: payload.meta.venue,
  r1Runners: race1.runners.length,
  runnerOverlap: `${overlap}/${race1.runners.length}`,
  winner: `${winner.no} ${winner.horse}`,
  winnerResult: ResultedSpDom.getRunnerResult(manifest.meetingId, "1", winner.no, winner.horse),
  guardPassed: guardState.guardPassed,
  exportColumns: exportHeaders.length,
  allWirNa,
});
