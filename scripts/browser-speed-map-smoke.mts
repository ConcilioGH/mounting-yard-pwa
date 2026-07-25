/**
 * Browser smoke for Speed Map freeze fix.
 * Flow: /ipad-yard-dom → load Randwick → /speed-map
 * Requires: npm run start -- -p 3456
 */
import { chromium, type Page } from "playwright";

const PORT = process.env.PORT || "3456";
const BASE = `http://127.0.0.1:${PORT}`;
const CSV_REL = "meetings/2026-07-25-randwick/randwick_2026-07-25_master.csv";

async function assertResponsive(page: Page, label: string) {
  const ping = await page.evaluate(async () => {
    const t0 = performance.now();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return performance.now() - t0;
  });
  console.log(`[responsive] ${label}: rAF ping ${ping.toFixed(1)}ms`);
  if (ping > 3000) {
    throw new Error(`${label} main thread unresponsive (rAF ${ping.toFixed(1)}ms)`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(120_000);

  console.log("1) /ipad-yard-dom");
  await page.goto(`${BASE}/ipad-yard-dom`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as { ipadYard?: unknown }).ipadYard), null, {
    timeout: 30_000,
  });
  await assertResponsive(page, "ipad-yard-dom");

  console.log("2) load Randwick meeting (includes speed-map sync/placement)");
  const loadStarted = Date.now();
  await page.evaluate(async (relativePath) => {
    const w = window as unknown as {
      ipadYard: {
        loadMeeting: (p: string, label?: string) => void;
        libraryMeetings?: Array<{ relativePath: string }>;
        races?: unknown[];
        setLibraryMsg?: (m: string) => void;
      };
    };
    // Ensure library list includes the meeting meta used by loadMeeting
    try {
      const res = await fetch("/api/meeting-library");
      const data = await res.json();
      w.ipadYard.libraryMeetings = data.meetings || [];
    } catch {
      /* ignore */
    }
    w.ipadYard.loadMeeting(relativePath, "Randwick 2026-07-25");
  }, CSV_REL);

  await page.waitForFunction(
    () => {
      const w = window as unknown as { ipadYard?: { races?: unknown[]; meetingLoadingPath?: string | null } };
      return Boolean(w.ipadYard?.races && w.ipadYard.races.length >= 10 && !w.ipadYard.meetingLoadingPath);
    },
    null,
    { timeout: 90_000 },
  );
  const loadElapsed = Date.now() - loadStarted;
  console.log(`   meeting load + sync finished in ${loadElapsed}ms`);
  if (loadElapsed > 60_000) {
    throw new Error(`meeting load took too long (${loadElapsed}ms) — possible freeze`);
  }
  await assertResponsive(page, "after-meeting-load");

  console.log("3) /speed-map");
  const speedMapStarted = Date.now();
  await page.goto(`${BASE}/speed-map`, { waitUntil: "domcontentloaded" });

  // Placement runs during hydrate/re-import — wait for a known Randwick runner.
  await page.waitForFunction(
    () => /Scintillation/i.test(document.body?.innerText || ""),
    null,
    { timeout: 60_000 },
  );
  const speedMapElapsed = Date.now() - speedMapStarted;
  console.log(`   Scintillation visible after ${speedMapElapsed}ms`);
  if (speedMapElapsed > 45_000) {
    throw new Error(`Speed Map hydrate/placement too slow (${speedMapElapsed}ms)`);
  }
  await assertResponsive(page, "speed-map-initial");

  const body2 = await page.locator("body").innerText();
  const runnerCount = await page.locator("[data-runner-id]").count();
  const ok =
    /Scintillation/i.test(body2) &&
    (/Letters Patent|Iron Man|Commodus|No Limits|Suasion/i.test(body2) || runnerCount > 0);

  console.log("4) speed-map body has runners/races:", ok, `(tiles=${runnerCount})`);
  if (!ok) {
    console.error("body snippet:", body2.slice(0, 800));
    throw new Error("Speed Map did not display imported Randwick runners");
  }
  await assertResponsive(page, "speed-map-with-runners");

  console.log("[browser-smoke] PASS");
  await browser.close();
}

main().catch((err) => {
  console.error("[browser-smoke] FAIL", err);
  process.exit(1);
});
