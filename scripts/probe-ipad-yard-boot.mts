/**
 * Probe /ipad-yard-dom boot — find first runtime error in init().
 */
import { readFileSync } from "node:fs";
import { buildIpadYardDomHtml } from "../src/lib/ipad-yard-dom-html.ts";

const html = buildIpadYardDomHtml();
if (!html.includes("/ipad-yard-dom.js")) {
  throw new Error("HTML missing ipad-yard-dom.js script tag");
}

const storage = new Map<string, string>();
const elMap = new Map<string, Record<string, unknown>>();

function ensureEl(id: string) {
  if (!elMap.has(id)) {
    elMap.set(id, { id, className: "", classList: { add: () => {}, remove: () => {}, contains: () => false }, textContent: "", innerHTML: "", value: "", checked: false });
  }
  return elMap.get(id)!;
}

(globalThis as unknown as { window: Record<string, unknown> }).window = globalThis as unknown as Record<string, unknown>;
(globalThis as unknown as { window: Record<string, unknown> }).window.addEventListener = () => {};
(globalThis as unknown as { window: Record<string, unknown> }).window.removeEventListener = () => {};
(globalThis as unknown as { window: Record<string, unknown> }).window.dispatchEvent = () => true;
(globalThis as unknown as { document: Record<string, unknown> }).document = {
  getElementById: (id: string) => ensureEl(id),
  createElement: () => ({
    style: {},
    setAttribute: () => {},
    click: () => {},
    remove: () => {},
  }),
  body: { appendChild: () => {} },
};
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true, userAgent: "iPad", platform: "iPad", maxTouchPoints: 5 },
  configurable: true,
});
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
(globalThis as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent = class extends Event {
  detail: unknown;
  constructor(type: string, init?: { detail?: unknown }) {
    super(type);
    this.detail = init?.detail;
  }
};
(globalThis as unknown as { indexedDB: undefined }).indexedDB = undefined;
(globalThis as unknown as { location: { hostname: string } }).location = { hostname: "localhost" };
(globalThis as unknown as { setInterval: typeof setInterval }).setInterval = ((fn: () => void) => {
  fn();
  return 1 as unknown as ReturnType<typeof setInterval>;
}) as typeof setInterval;
(globalThis as unknown as { clearInterval: () => void }).clearInterval = () => {};

// Hawkesbury-like persisted state
storage.set(
  "ipad-yard-meeting-store-v2",
  JSON.stringify({
    version: 2,
    activeMeetingId: "2026-07-02-hawkesbury",
    activeMeetingKey: "1|2|3|4|5|6|7|8",
    meetings: {
      "2026-07-02-hawkesbury": {
        meetingId: "2026-07-02-hawkesbury",
        meetingKey: "1|2|3|4|5|6|7|8",
        assessments: {},
        selectedRaceId: "R1",
        selectedRunnerNo: 1,
        meetingLabel: "Hawkesbury · 2026-07-02",
        loadedMeetingPath: "meetings/2026-07-02-hawkesbury",
        meetingCardSource: "library",
        races: [{ id: "R1", title: "R1", runners: [{ no: 1, horse: "Test", br: 1, trainer: "", jockey: "", odds: "" }] }],
      },
    },
  }),
);

const inline = html.match(/<script>\s*window\.IPAD_YARD[\s\S]*?<\/script>/)?.[0] ?? "";
eval(inline.replace(/<\/?script>/g, ""));

for (const file of [
  "yard-race-countdown-dom.js",
  "meeting-export-delivery-dom.js",
  "tab-yard-meeting-dom.js",
  "resulted-sp-dom.js",
  "ipad-yard-dom.js",
]) {
  const code = readFileSync(`public/${file}`, "utf8").replace(/\r\n/g, "\n");
  try {
    eval(`(function(){\n${code}\n})()`);
    console.log("loaded", file);
  } catch (e) {
    console.error("FAIL loading", file, e);
    process.exit(1);
  }
}

console.log("boot complete", {
  ipadYard: Boolean((globalThis as { ipadYard?: unknown }).ipadYard),
  view: (globalThis as { ipadYard?: { view?: string } }).ipadYard?.view,
});
