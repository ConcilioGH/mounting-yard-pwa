/**
 * Smoke test: TAB today meeting → Yard format → Resulted SP guard compatibility.
 * Run with dev server: npx tsx scripts/test-tab-yard-meeting.mts
 */
const originalFetch = globalThis.fetch;
async function devFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (!url.startsWith("/api/fetch-tab-api")) {
    return originalFetch(input, init);
  }
  const ports = [3000, 3001];
  let lastError: Error | null = null;
  for (const port of ports) {
    try {
      const res = await originalFetch(`http://localhost:${port}${url}`, init);
      if (res.status === 404 && port === 3000) continue;
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new Error("Dev server not reachable on port 3000 or 3001");
}
globalThis.fetch = devFetch;

// Minimal DOM shims for tab-yard-meeting-dom.js
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

await import("../public/tab-yard-meeting-dom.js");

const TabYardMeeting = (globalThis as unknown as { TabYardMeeting: {
  loadTodayTabMeeting: (code: string, opts?: { jurisdiction?: string }) => Promise<{
    races: Array<{ id: string; runners: Array<{ horse: string; no: number }> }>;
    meta: { meetingId: string; date: string; trackName: string; trackSlug: string };
  }>;
} }).TabYardMeeting;

const payload = await TabYardMeeting.loadTodayTabMeeting("RKE", { jurisdiction: "NSW" });
console.log("meetingId:", payload.meta.meetingId);
console.log("date:", payload.meta.date, "track:", payload.meta.trackName);
console.log("races:", payload.races.length);
console.log(
  "R1 runners:",
  payload.races[0]?.runners.map((r) => `${r.no} ${r.horse}`).join(", "),
);

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

const { fetchTabRaceResults } = await import("../src/lib/resulted-sp/tab-api.ts");
const tab = await fetchTabRaceResults({ manifest, raceNo: "1" });
console.log("fetchTabRaceResults R1:", tab.status, tab.parsed ? tab.parsed.runners.length + " runners" : "");

if (tab.status === "imported" && tab.parsed) {
  const yardRace = payload.races[0];
  const yardNames = new Set(
    yardRace.runners.map((r) => r.horse.toUpperCase().replace(/[^A-Z0-9]+/g, "")),
  );
  const tabNames = tab.parsed.runners.map((r) =>
    r.horseName.toUpperCase().replace(/[^A-Z0-9]+/g, ""),
  );
  const overlap = tabNames.filter((n) => yardNames.has(n)).length;
  console.log("runner overlap R1:", overlap, "/", yardRace.runners.length);
  console.log("guard date match:", manifest.date === (tab.tabMeeting?.date || ""));
}
