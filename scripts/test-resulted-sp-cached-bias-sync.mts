import assert from "node:assert/strict";

const values = new Map<string, string>();
const events: Event[] = [];

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
});
Object.defineProperty(globalThis, "window", {
  value: { dispatchEvent: (event: Event) => (events.push(event), true) },
});
Object.defineProperty(globalThis, "CustomEvent", {
  value: class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) {
      super(type);
      this.detail = init?.detail as T;
    }
  },
});

const meetingId = "2026-10-21-warwick-farm";
const importedAt = "2026-10-21T04:30:00.000Z";

values.set(
  `bias:${meetingId}`,
  JSON.stringify({
    meetingLabel: "Warwick Farm 2026-10-21",
    updatedAt: importedAt,
    races: [
      {
        raceNo: "1",
        first: { positionCode: "1", sp: "" },
        second: { positionCode: "2", sp: "9.5" },
        third: { positionCode: "3", sp: "" },
        fourth: { positionCode: "4", sp: "" },
      },
    ],
  }),
);
values.set(
  `resulted-sp:${meetingId}`,
  JSON.stringify({
    meetingId,
    updatedAt: importedAt,
    races: {
      "1": {
        status: "imported",
        importedAt,
        source: "racingnsw",
        runners: [
          { raceNo: "1", runnerNo: "7", horse: "Zahav", officialSP: "5", finishPosition: 1, margin: "", resultStatus: "resulted", importedAt, source: "racingnsw" },
          { raceNo: "1", runnerNo: "1", horse: "Social Graces", officialSP: "3", finishPosition: 2, margin: "2.65", resultStatus: "resulted", importedAt, source: "racingnsw" },
          { raceNo: "1", runnerNo: "8", horse: "Belle Chanteuse", officialSP: "4.8", finishPosition: 3, margin: "4.52", resultStatus: "resulted", importedAt, source: "racingnsw" },
        ],
      },
    },
  }),
);

const { importResultedSpForRace } = await import("../src/lib/resulted-sp/poller.ts");
const result = await importResultedSpForRace({
  meetingId,
  manifest: {
    meetingId,
    date: "2026-10-21",
    trackName: "Warwick Farm",
    trackSlug: "warwick-farm",
    importedAt,
    sourceFileName: "warwick_farm_2026-10-21_master.csv",
    sourceKind: "csv",
  },
  // A complete three-runner field; a missing card requires four priced finishers.
  races: [{ id: "R1", title: "1:00 pm Race 1", runners: [
    { no: 7, horse: "Zahav", br: 1, trainer: "", jockey: "", odds: "" },
    { no: 1, horse: "Social Graces", br: 2, trainer: "", jockey: "", odds: "" },
    { no: 8, horse: "Belle Chanteuse", br: 3, trainer: "", jockey: "", odds: "" },
  ] }],
  raceNo: "1",
});

assert.equal(result.ok, true);
assert.equal(result.imported, false);
const saved = JSON.parse(values.get(`bias:${meetingId}`) ?? "{}") as {
  races: Array<{ first: { sp: string }; second: { sp: string }; third: { sp: string } }>;
};
assert.equal(saved.races[0]?.first.sp, "5");
assert.equal(saved.races[0]?.second.sp, "9.5", "existing SP must not be overwritten");
assert.equal(saved.races[0]?.third.sp, "4.8");
assert.ok(events.some((event) => event.type === "mounting-yard-resulted-sp-updated"));

console.log("Cached Resulted SP is re-applied to missing Bias prices.");
