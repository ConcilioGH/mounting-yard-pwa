const manifest = {
  meetingId: "2026-06-10-kensington",
  meetingKey: "1|2|3|4|5|6|7",
  trackName: "Kensington",
  trackSlug: "kensington",
  date: "2026-06-10",
  meetingFolderPath: "meetings/2026-06-10-kensington",
  raceNos: ["1", "2", "3", "4", "5", "6", "7"],
  importedAt: "",
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("/api/fetch-tab-api") || url.startsWith("/api/fetch-results-html")) {
    return originalFetch(`http://localhost:3000${url}`, init);
  }
  return originalFetch(input, init);
};

const { fetchTabRaceResults } = await import("../src/lib/resulted-sp/tab-api.ts");
const { importRaceFromSources } = await import("../src/lib/resulted-sp/sources.ts");

for (const raceNo of ["1", "2"]) {
  console.log(`\n=== Kensington R${raceNo} ===`);
  const tab = await fetchTabRaceResults({ manifest, raceNo });
  console.log("fetchTabRaceResults:", tab);

  const imported = await importRaceFromSources({ manifest, raceNo });
  console.log("importRaceFromSources:", {
    imported: imported.imported,
    notReady: "notReady" in imported ? imported.notReady : undefined,
    source: "source" in imported ? imported.source : undefined,
    runners:
      "parsed" in imported && imported.parsed
        ? imported.parsed.runners.map((r) => ({
            horse: r.horseName,
            finish: r.finishPosition,
            sp: r.sp,
          }))
        : [],
    lastError: "lastError" in imported ? imported.lastError : undefined,
  });
}
