import {
  hydrateRunnerSpeedFields,
  type RaceMapStateEntry,
  type SavedMapState,
} from "@/lib/speed-map";
import { SPEED_MAP_STORAGE_KEY } from "@/lib/speed-map-storage";

export type SpeedMapSessionState = {
  /** Links session to shared meeting manifest (`meetingKey`). */
  meetingKey?: string;
  meetingTrack: string;
  meetingGoing: string;
  meetingRail: string;
  raceMap: Record<string, RaceMapStateEntry>;
  raceOrder: string[];
  activeRaceNo: string;
  selectedRunnerIds: string[];
  focusMode: boolean;
  pressureOverlay: boolean;
};

export const emptySpeedMapSession = (): SpeedMapSessionState => ({
  meetingKey: "",
  meetingTrack: "",
  meetingGoing: "",
  meetingRail: "",
  raceMap: {},
  raceOrder: [],
  activeRaceNo: "",
  selectedRunnerIds: [],
  focusMode: false,
  pressureOverlay: true,
});

function hydrateRaceEntry(race: RaceMapStateEntry): RaceMapStateEntry {
  return {
    ...race,
    runners: (race.runners ?? []).map(hydrateRunnerSpeedFields),
    distance: race.distance?.trim() || "",
    track: race.track?.trim() || "",
    startTime: race.startTime?.trim() || "",
    grade: race.grade?.trim() || "",
    going: race.going?.trim() || "",
    rail: race.rail?.trim() || "",
    dist: race.dist?.trim() || "",
    raceDistance: race.raceDistance?.trim() || "",
    trackCondition: race.trackCondition?.trim() || "",
    condition: race.condition?.trim() || "",
    railPosition: race.railPosition?.trim() || "",
  };
}

export function loadSpeedMapFromStorage(): SpeedMapSessionState | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(SPEED_MAP_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedMapState & {
      raceOrder?: string[];
      selectedRunnerIds?: string[];
      focusMode?: boolean;
      pressureOverlay?: boolean;
    };
    const loadedRaces: Record<string, RaceMapStateEntry> = {};
    for (const [raceNo, race] of Object.entries(parsed.races ?? {})) {
      loadedRaces[raceNo] = hydrateRaceEntry(race);
    }
    const raceOrder =
      parsed.raceOrder?.length && parsed.raceOrder.every((n) => loadedRaces[n])
        ? parsed.raceOrder
        : Object.keys(loadedRaces).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const activeRaceNo = parsed.activeRaceNo || raceOrder[0] || "";
    return {
      meetingKey: String(parsed.meetingKey ?? "").trim(),
      meetingTrack: parsed.meetingTrack?.trim() ?? parsed.meta?.track?.trim() ?? "",
      meetingGoing: parsed.meetingGoing?.trim() ?? parsed.meta?.going?.trim() ?? "",
      meetingRail: parsed.meetingRail?.trim() ?? parsed.meta?.rail?.trim() ?? "",
      raceMap: loadedRaces,
      raceOrder,
      activeRaceNo,
      selectedRunnerIds: parsed.selectedRunnerIds ?? [],
      focusMode: parsed.focusMode ?? false,
      pressureOverlay: parsed.pressureOverlay ?? true,
    };
  } catch {
    return null;
  }
}

export function saveSpeedMapToStorage(session: SpeedMapSessionState): void {
  if (typeof localStorage === "undefined") return;
  const payload: SavedMapState & {
    meetingKey?: string;
    raceOrder: string[];
    selectedRunnerIds: string[];
    focusMode: boolean;
    pressureOverlay: boolean;
  } = {
    meetingKey: session.meetingKey,
    meetingTrack: session.meetingTrack,
    meetingGoing: session.meetingGoing,
    meetingRail: session.meetingRail,
    races: session.raceMap,
    activeRaceNo: session.activeRaceNo,
    raceOrder: session.raceOrder,
    selectedRunnerIds: session.selectedRunnerIds,
    focusMode: session.focusMode,
    pressureOverlay: session.pressureOverlay,
  };
  localStorage.setItem(SPEED_MAP_STORAGE_KEY, JSON.stringify(payload));
}
