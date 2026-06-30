import { parseTabRaceDetail, isTabRaceOfficiallyResulted } from "../src/lib/resulted-sp/tab-api.ts";

const manifest = {
  meetingId: "2026-06-30-taree",
  meetingKey: "R1-R8",
  trackName: "Taree",
  trackSlug: "taree",
  date: "2026-06-30",
  meetingFolderPath: "meetings/2026-06-30-taree",
  raceNos: ["1", "2", "3", "4", "5", "6", "7", "8"],
  importedAt: "",
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("/api/fetch-tab-api")) {
    return originalFetch(`http://localhost:3000${url}`, init);
  }
  return originalFetch(input, init);
};

const { fetchTabRaceResults } = await import("../src/lib/resulted-sp/tab-api.ts");
const { importRaceFromSources } = await import("../src/lib/resulted-sp/sources.ts");

const tab = await fetchTabRaceResults({ manifest, raceNo: "1" });
console.log("fetchTabRaceResults:", tab);

const imported = await importRaceFromSources({ manifest, raceNo: "1" });
console.log("importRaceFromSources:", {
  imported: imported.imported,
  notReady: "notReady" in imported ? imported.notReady : undefined,
  source: "source" in imported ? imported.source : undefined,
  runners: "parsed" in imported && imported.parsed ? imported.parsed.runners.length : 0,
  spCount:
    "parsed" in imported && imported.parsed
      ? imported.parsed.runners.filter((r) => r.sp > 0).length
      : 0,
  lastError: "lastError" in imported ? imported.lastError : undefined,
});

if (tab.status === "imported" || (tab.status === "not_ready" && "resultsPageUrl" in tab)) {
  const detailRes = await originalFetch(
    "https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2026-06-30/meetings/R/TRE/races/1?jurisdiction=NSW",
  );
  const detail = await detailRes.json();
  console.log("isTabRaceOfficiallyResulted(detail):", isTabRaceOfficiallyResulted(detail));
  console.log("parseTabRaceDetail:", parseTabRaceDetail(detail, "1"));
}
