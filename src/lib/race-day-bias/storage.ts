import { parseMeetingFolderMeta, sanitizeMeetingSlug } from "@/lib/meeting-export";
import { sanitizePositionCodeInput } from "@/lib/race-day-bias/lane";
import { sanitizeSpInput } from "@/lib/race-day-bias/sp";
import {
  emptyFinisherSlot,
  type FinisherSlot,
  type PositionField,
  type RaceBiasEntry,
  type RaceDayBiasState,
} from "@/lib/race-day-bias/types";
import { reportStartupFailure, traceSync } from "@/lib/startup-diagnostics";

/** Active meeting pointer — bias payloads live at `bias:{meetingId}`. */
export const BIAS_ACTIVE_MEETING_KEY = "bias:active-meeting-id";

const BIAS_KEY_PREFIX = "bias:";

/** Legacy keys removed on init (no longer read). */
const LEGACY_BIAS_KEYS = [
  "mounting-yard-race-day-bias-v1",
  "race-day-bias",
  "bias-data",
  "biasEntries",
] as const;

const POSITION_FIELDS: PositionField[] = ["first", "second", "third", "fourth"];

export type BiasLoadResult = {
  state: RaceDayBiasState;
  meetingId: string;
  biasKey: string;
  loadedExisting: boolean;
};

export const RACE_DAY_BIAS_UPDATED_EVENT = "mounting-yard-bias-updated";

export function deriveMeetingId(options: {
  date: string;
  trackSlug: string;
  meetingFolderPath?: string;
}): string {
  const folderPath = options.meetingFolderPath?.trim();
  if (folderPath) {
    const fromPath = parseMeetingFolderMeta(folderPath);
    const folderName = fromPath
      ? fromPath.meetingFolderPath.split("/").filter(Boolean).pop()
      : folderPath.split("/").filter(Boolean).pop();
    if (folderName && /^\d{4}-\d{2}-\d{2}-.+$/i.test(folderName)) {
      return folderName.toLowerCase();
    }
  }

  const date = options.date?.trim() ?? "";
  const track = sanitizeMeetingSlug(options.trackSlug);
  if (date && track && track !== "meeting") {
    return `${date}-${track}`;
  }

  return "";
}

export function getBiasStorageKey(meetingId: string): string {
  const id = meetingId.trim();
  if (!id) return "";
  return id.startsWith(BIAS_KEY_PREFIX) ? id : `${BIAS_KEY_PREFIX}${id}`;
}

export function getActiveBiasMeetingId(): string | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(BIAS_ACTIVE_MEETING_KEY);
  return raw?.trim() || null;
}

export function setActiveBiasMeetingId(meetingId: string): void {
  if (typeof localStorage === "undefined" || !meetingId.trim()) return;
  localStorage.setItem(BIAS_ACTIVE_MEETING_KEY, meetingId.trim());
}

export function isBiasStorageKey(key: string | null): boolean {
  if (!key) return false;
  return key === BIAS_ACTIVE_MEETING_KEY || key.startsWith(BIAS_KEY_PREFIX);
}

/** Remove deprecated global bias keys (one-time hygiene). */
export function removeLegacyBiasStorageKeys(): void {
  if (typeof localStorage === "undefined") return;
  for (const legacyKey of LEGACY_BIAS_KEYS) {
    localStorage.removeItem(legacyKey);
  }
}

function normalizeFinisherSlot(value: unknown): FinisherSlot {
  if (typeof value === "string") {
    return { positionCode: sanitizePositionCodeInput(value), sp: "" };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      positionCode: sanitizePositionCodeInput(String(record.positionCode ?? "")),
      sp: sanitizeSpInput(String(record.sp ?? "")),
    };
  }
  return emptyFinisherSlot();
}

function normalizeRaceEntry(race: unknown, index: number): RaceBiasEntry {
  const record = race && typeof race === "object" ? (race as Record<string, unknown>) : {};
  return {
    raceNo: String(record.raceNo ?? index + 1),
    first: normalizeFinisherSlot(record.first),
    second: normalizeFinisherSlot(record.second),
    third: normalizeFinisherSlot(record.third),
    fourth: normalizeFinisherSlot(record.fourth),
  };
}

export function createEmptyBiasRaceEntry(raceNo: string): RaceBiasEntry {
  return {
    raceNo,
    first: emptyFinisherSlot(),
    second: emptyFinisherSlot(),
    third: emptyFinisherSlot(),
    fourth: emptyFinisherSlot(),
  };
}

export function createDefaultBiasState(meetingLabel = ""): RaceDayBiasState {
  return {
    meetingLabel,
    races: [],
    updatedAt: new Date().toISOString(),
  };
}

function parseBiasStatePayload(raw: string): RaceDayBiasState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RaceDayBiasState>;
    const races = Array.isArray(parsed.races)
      ? parsed.races.map((race, index) => normalizeRaceEntry(race, index))
      : [];
    return {
      meetingLabel: String(parsed.meetingLabel ?? ""),
      races,
      updatedAt: String(parsed.updatedAt ?? new Date().toISOString()),
      sectionalBias: parsed.sectionalBias,
      laneInStraight: parsed.laneInStraight,
      trackPatternNotes: parsed.trackPatternNotes,
      weather: parsed.weather,
      railMovement: parsed.railMovement,
      paceProfile: parsed.paceProfile,
    };
  } catch {
    return null;
  }
}

/** Load bias for a specific meeting. Does not fall back to other meetings. */
export function loadRaceDayBiasStateForMeeting(meetingId: string): BiasLoadResult {
  const id = meetingId.trim();
  const biasKey = getBiasStorageKey(id);

  if (typeof localStorage === "undefined" || !id || !biasKey) {
    return {
      state: createDefaultBiasState(),
      meetingId: id,
      biasKey,
      loadedExisting: false,
    };
  }

  const raw = localStorage.getItem(biasKey);
  if (!raw) {
    return {
      state: createDefaultBiasState(),
      meetingId: id,
      biasKey,
      loadedExisting: false,
    };
  }

  const state = parseBiasStatePayload(raw);
  return {
    state: state ?? createDefaultBiasState(),
    meetingId: id,
    biasKey,
    loadedExisting: state != null,
  };
}

/**
 * Load bias for the active meeting (manifest / import pointer).
 * Returns empty state when no active meeting is set.
 */
export function loadRaceDayBiasState(): RaceDayBiasState {
  return traceSync("localStorage-bias-load", () => {
    try {
      removeLegacyBiasStorageKeys();
      const meetingId = getActiveBiasMeetingId();
      if (!meetingId) {
        return createDefaultBiasState();
      }
      return loadRaceDayBiasStateForMeeting(meetingId).state;
    } catch (error) {
      reportStartupFailure("localStorage-bias-load", error);
      return createDefaultBiasState();
    }
  });
}

export function logBiasStorageDebug(
  meetingId: string,
  biasKey: string,
  loadedExisting: boolean,
  rowCount: number,
): void {
  console.log(
    `[RaceDayBias] Meeting ID: ${meetingId}\n` +
      `Bias Key: ${biasKey}\n` +
      `Loaded Existing: ${loadedExisting}\n` +
      `Number of Rows: ${rowCount}`,
  );
}

/** Persist bias for a specific meeting only. */
export function saveRaceDayBiasStateForMeeting(meetingId: string, state: RaceDayBiasState): void {
  const id = meetingId.trim();
  const biasKey = getBiasStorageKey(id);
  if (typeof localStorage === "undefined" || !id || !biasKey) return;

  const races = state.races.map((race) => {
    const normalized: RaceBiasEntry = {
      raceNo: race.raceNo,
      first: emptyFinisherSlot(),
      second: emptyFinisherSlot(),
      third: emptyFinisherSlot(),
      fourth: emptyFinisherSlot(),
    };
    for (const field of POSITION_FIELDS) {
      normalized[field] = {
        positionCode: sanitizePositionCodeInput(race[field].positionCode),
        sp: sanitizeSpInput(race[field].sp),
      };
    }
    return normalized;
  });

  const payload: RaceDayBiasState = {
    ...state,
    races,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(biasKey, JSON.stringify(payload));
  setActiveBiasMeetingId(id);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(RACE_DAY_BIAS_UPDATED_EVENT, {
        detail: { meetingId: id },
      }),
    );
  }
}

/** Save to the currently active meeting (from manifest pointer). */
export function saveRaceDayBiasState(state: RaceDayBiasState): void {
  const meetingId = getActiveBiasMeetingId();
  if (!meetingId) return;
  saveRaceDayBiasStateForMeeting(meetingId, state);
}
