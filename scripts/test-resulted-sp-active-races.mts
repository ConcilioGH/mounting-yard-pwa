import assert from "node:assert/strict";
import {
  parseIpadYardLegacyRaces,
  parseIpadYardMeetingStoreRaces,
} from "../src/lib/resulted-sp/active-races.ts";

const meetingId = "2026-08-01-rosehill-gardens";
const raw = JSON.stringify({
  version: 2,
  activeMeetingId: meetingId,
  meetings: {
    [meetingId]: {
      races: [
        {
          id: "R1",
          title: "11:25 am Midway Handicap",
          runners: [{ no: 9, horse: "Attractiveness (NZ)", br: 1, trainer: "", jockey: "", odds: "$3.20" }],
        },
      ],
    },
  },
});

const races = parseIpadYardMeetingStoreRaces(raw, meetingId);
assert.equal(races.length, 1);
assert.equal(races[0]?.title, "11:25 am Midway Handicap");
assert.equal(races[0]?.runners[0]?.horse, "Attractiveness (NZ)");
assert.equal(parseIpadYardMeetingStoreRaces(raw, "2026-08-02-other").length, 1);

const inactiveStore = JSON.stringify({ version: 2, activeMeetingId: "", meetings: {} });
assert.deepEqual(parseIpadYardMeetingStoreRaces(inactiveStore, meetingId), []);
assert.equal(
  parseIpadYardLegacyRaces(JSON.stringify(JSON.parse(raw).meetings[meetingId].races)).length,
  1,
);

console.log("Resulted SP active iPad race-card bridge passed.");
