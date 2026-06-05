import {
  hydrateRunnerSpeedFields,
  raceMapEntryFromBucket,
  type RaceBucket,
  type SpeedMapRunner,
} from "@/lib/speed-map";
import { applyActiveBoardRacePlacement } from "@/lib/speed-map-placement-bridge";
import { normalizeRaceNo } from "@/lib/meeting-coordination";
import type { MeetingCsvParseResult } from "@/lib/csv";
import {
  emptySpeedMapSession,
  loadSpeedMapFromStorage,
  saveSpeedMapToStorage,
  type SpeedMapSessionState,
} from "@/lib/speed-map-persistence";

const PLACEMENT_ENGINE = "active-board-v32";

function runnerId(raceNo: string, no: number, horse: string, index: number): string {
  const slug = horse.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${raceNo}-${no}-${slug}-${index}`;
}

function toWirNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const text = String(raw).trim();
  if (!text || /^n\/?a$/i.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Identity-only runner for placement input — no layout coordinates from import. */
function speedRunnerFromRow(
  raceNo: string,
  index: number,
  no: number,
  horse: string,
  barrier: number,
  wIrRaw: unknown,
): SpeedMapRunner {
  const parsedWir = toWirNumber(wIrRaw);
  const hasSpeedData = parsedWir !== null && parsedWir >= 0 && parsedWir <= 12;
  const wIr = hasSpeedData ? parsedWir! : 12;
  return hydrateRunnerSpeedFields({
    id: runnerId(raceNo, no, horse, index),
    no,
    horse,
    barrier: String(barrier),
    wIr,
    displayWir: hasSpeedData ? String(parsedWir) : "N/A",
    hasSpeedData,
    manuallyPlaced: false,
    x: 0,
    y: 0,
    modelX: 0,
    modelY: 0,
    flags: { favourite: false, target: false, mapAdvantage: false, risk: false },
  });
}

function cloneRunnersForPlacement(runners: SpeedMapRunner[]): SpeedMapRunner[] {
  return runners.map((r) =>
    hydrateRunnerSpeedFields(
      structuredClone({
        ...r,
        flags: { ...r.flags },
      }),
    ),
  );
}

function mergePreservedRunners(
  fresh: SpeedMapRunner[],
  previous: SpeedMapRunner[] | undefined,
): SpeedMapRunner[] {
  if (!previous?.length) return fresh;
  const prevById = new Map(previous.map((r) => [r.id, r]));
  return fresh.map((runner) => {
    const kept = prevById.get(runner.id);
    if (!kept?.manuallyPlaced) return runner;
    return hydrateRunnerSpeedFields(
      structuredClone({
        ...runner,
        x: kept.x,
        y: kept.y,
        modelX: kept.modelX,
        modelY: kept.modelY,
        lane: kept.lane,
        manuallyPlaced: true,
        wIr: kept.wIr,
        hasSpeedData: kept.hasSpeedData,
        displayWir: kept.displayWir,
        flags: { ...kept.flags },
      }),
    );
  });
}

/**
 * Run the active-board placement pipeline on isolated clones.
 * Manual tiles keep their coordinates; others use full tactical placement.
 */
export function placeRunnersWithActiveBoardEngine(
  runners: SpeedMapRunner[],
  raceNo: string,
): SpeedMapRunner[] {
  const cloned = cloneRunnersForPlacement(runners);
  const auto = cloned.filter((r) => !r.manuallyPlaced);

  if (!auto.length) return cloned;

  const placedAuto = applyActiveBoardRacePlacement(
    auto.map((r) => ({ ...r, manuallyPlaced: false })),
    raceNo,
  );
  const placedById = new Map(placedAuto.map((r) => [r.id, r]));

  return cloned.map((r) => {
    if (r.manuallyPlaced) return r;
    return placedById.get(r.id) ?? r;
  });
}

/** Re-apply active-board placement for sessions saved with legacy assignModelPositions. */
export function reconcileSpeedMapActivePlacement(
  session: SpeedMapSessionState,
): SpeedMapSessionState {
  const raceMap: SpeedMapSessionState["raceMap"] = {};

  for (const [raceNo, race] of Object.entries(session.raceMap)) {
    if (!race?.runners?.length) {
      raceMap[raceNo] = race;
      continue;
    }
    const needsPlacement = race.placementEngine !== PLACEMENT_ENGINE;

    if (!needsPlacement) {
      raceMap[raceNo] = race;
      continue;
    }

    raceMap[raceNo] = {
      ...race,
      placementEngine: PLACEMENT_ENGINE,
      runners: placeRunnersWithActiveBoardEngine(race.runners, raceNo),
    };
  }

  return { ...session, raceMap };
}

/**
 * Populate speed map local session from a shared meeting CSV import.
 * Same meeting: keep manually placed tiles; new meeting: full re-place.
 */
export function syncSpeedMapOnMeetingImport(
  parsed: MeetingCsvParseResult,
  options: { sameMeeting: boolean; meetingKey: string },
): SpeedMapSessionState {
  const existing = options.sameMeeting ? loadSpeedMapFromStorage() : null;
  const meetingMeta = {
    track: parsed.meta.trackName,
    going: parsed.meta.going,
    rail: parsed.meta.rail,
  };

  const map: SpeedMapSessionState["raceMap"] = {};
  const order: string[] = [];

  for (const race of parsed.speedMapRaces) {
    const raceNo = normalizeRaceNo(race.raceNo);
    if (!raceNo) continue;
    order.push(raceNo);

    const freshRunners = race.runners.map((row, index) =>
      speedRunnerFromRow(raceNo, index, row.no, row.horse, row.barrier, row.wIrRaw),
    );
    const merged = mergePreservedRunners(freshRunners, existing?.raceMap[raceNo]?.runners);
    const placed = placeRunnersWithActiveBoardEngine(merged, raceNo);

    const bucket: RaceBucket = {
      raceNo,
      raceName: race.raceName,
      distance: race.distance ?? "",
      grade: race.grade ?? "",
      going: race.going ?? parsed.meta.going,
      rail: race.rail ?? parsed.meta.rail,
      track: race.track ?? parsed.meta.trackName,
      dist: race.distance ?? "",
      raceDistance: race.distance ?? "",
      trackCondition: race.going ?? parsed.meta.going,
      condition: race.going ?? parsed.meta.going,
      railPosition: race.rail ?? parsed.meta.rail,
      runners: placed,
    };

    map[raceNo] = {
      ...raceMapEntryFromBucket(bucket, placed, meetingMeta),
      placementEngine: PLACEMENT_ENGINE,
      importDebug: {
        csvRowCountForRace: race.runners.length,
        scratchedCountForRace: 0,
        nonScratchedRunnerCount: freshRunners.length,
        parsedHorseNames: freshRunners.map((r) => r.horse),
      },
    };
  }

  order.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const prevActive = existing?.activeRaceNo;
  const activeRaceNo =
    prevActive && order.includes(prevActive) ? prevActive : order[0] ?? "";

  const session: SpeedMapSessionState = {
    meetingKey: options.meetingKey,
    meetingTrack: parsed.meta.trackName,
    meetingGoing: parsed.meta.going,
    meetingRail: parsed.meta.rail,
    raceMap: map,
    raceOrder: order,
    activeRaceNo,
    selectedRunnerIds: options.sameMeeting ? (existing?.selectedRunnerIds ?? []) : [],
    focusMode: existing?.focusMode ?? false,
    pressureOverlay: existing?.pressureOverlay ?? true,
  };

  const reconciled = reconcileSpeedMapActivePlacement(session);
  saveSpeedMapToStorage(reconciled);
  return reconciled;
}

export function hydrateSpeedMapMeetingKey(session: SpeedMapSessionState): SpeedMapSessionState {
  if (session.meetingKey) return session;
  return { ...session, meetingKey: "" };
}

export function emptySpeedMapSessionWithMeetingKey(): SpeedMapSessionState {
  return { ...emptySpeedMapSession(), meetingKey: "" };
}
