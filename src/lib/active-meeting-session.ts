import { loadAllRaces } from "@/lib/db";
import {
  buildMeetingKey,
  formatMeetingDisplayLabel,
  importMeetingFromCsv,
  loadLastMeetingCsvImport,
  loadMeetingManifest,
  loadRacesMeetingId,
  raceNosFromMountingYardRaces,
  syncRaceDayBiasOnMeetingImport,
  type MeetingManifest,
} from "@/lib/meeting-coordination";
import { reconcileSpeedMapActivePlacement } from "@/lib/meeting-speed-map-sync";
import {
  emptySpeedMapSession,
  loadSpeedMapFromStorage,
  type SpeedMapSessionState,
} from "@/lib/speed-map-persistence";
import { clearSpeedMapLocalStorage } from "@/lib/speed-map-storage";
import type { RaceDayBiasState } from "@/lib/race-day-bias/types";
import {
  getActiveBiasMeetingId,
  loadRaceDayBiasStateForMeeting,
  setActiveBiasMeetingId,
} from "@/lib/race-day-bias/storage";
import type { Race } from "@/lib/types";

export function racesMatchManifest(races: Race[], manifest: MeetingManifest): boolean {
  if (!races.length) return false;
  const storedMeetingId = loadRacesMeetingId();
  if (!storedMeetingId || storedMeetingId !== manifest.meetingId) return false;
  return buildMeetingKey(raceNosFromMountingYardRaces(races)) === manifest.meetingKey;
}

export function speedMapMatchesManifest(
  session: SpeedMapSessionState | null | undefined,
  manifest: MeetingManifest,
): boolean {
  if (!session?.meetingId?.trim()) return false;
  return session.meetingId.trim() === manifest.meetingId;
}

export function biasMatchesManifest(manifest: MeetingManifest): boolean {
  const activeId = getActiveBiasMeetingId();
  return Boolean(activeId && activeId === manifest.meetingId);
}

/** Ensure bias rows exist for the active manifest (idempotent). */
export function reconcileBiasForManifest(manifest: MeetingManifest): RaceDayBiasState {
  return syncRaceDayBiasOnMeetingImport(manifest.meetingId, manifest.raceNos, {
    trackName: manifest.trackName,
    meetingLabel: formatMeetingDisplayLabel(manifest),
  });
}

export function loadBiasStateForManifest(manifest: MeetingManifest | null): RaceDayBiasState {
  if (!manifest?.meetingId) {
    return { meetingLabel: "", races: [], updatedAt: new Date().toISOString() };
  }
  reconcileBiasForManifest(manifest);
  return loadRaceDayBiasStateForMeeting(manifest.meetingId).state;
}

export function loadSpeedMapSessionForManifest(
  manifest: MeetingManifest | null,
): SpeedMapSessionState | null {
  if (!manifest) {
    const session = loadSpeedMapFromStorage();
    return session ? reconcileSpeedMapActivePlacement(session) : null;
  }

  const session = loadSpeedMapFromStorage();
  if (!speedMapMatchesManifest(session, manifest)) {
    return null;
  }

  return reconcileSpeedMapActivePlacement(session!);
}

export function emptySpeedMapSessionForManifest(manifest: MeetingManifest): SpeedMapSessionState {
  return {
    ...emptySpeedMapSession(),
    meetingId: manifest.meetingId,
    meetingKey: manifest.meetingKey,
    meetingTrack: manifest.trackName,
  };
}

/**
 * Single desktop reconciliation entry point.
 * Keeps manifest, IndexedDB races, speed map, and bias aligned by meetingId.
 */
export async function ensureActiveMeetingSynced(): Promise<MeetingManifest | null> {
  const manifest = loadMeetingManifest();
  if (!manifest) return null;

  const [races, speedSession] = await Promise.all([
    loadAllRaces(),
    Promise.resolve(loadSpeedMapFromStorage()),
  ]);

  const racesOk = racesMatchManifest(races, manifest);
  const speedOk = speedMapMatchesManifest(speedSession, manifest);
  const biasOk = biasMatchesManifest(manifest);

  if (racesOk && speedOk && biasOk) {
    reconcileBiasForManifest(manifest);
    return manifest;
  }

  const cached = loadLastMeetingCsvImport();
  if (cached?.text) {
    await importMeetingFromCsv(cached.text, {
      ...cached.options,
      meetingFolderPath: cached.options.meetingFolderPath || manifest.meetingFolderPath,
    });
    return loadMeetingManifest();
  }

  if (!speedOk && speedSession) {
    clearSpeedMapLocalStorage();
  }
  if (!biasOk) {
    setActiveBiasMeetingId(manifest.meetingId);
  }
  reconcileBiasForManifest(manifest);

  return manifest;
}
