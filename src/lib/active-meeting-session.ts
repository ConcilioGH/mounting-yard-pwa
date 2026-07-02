import { loadAllRaces } from "@/lib/db";
import {
  formatMeetingDisplayLabel,
  importMeetingFromCsv,
  loadLastMeetingCsvImport,
  loadMeetingManifest,
  loadRacesMeetingId,
  saveRacesMeetingId,
  syncRaceDayBiasOnMeetingImport,
  type MeetingManifest,
} from "@/lib/meeting-coordination";
import { reconcileSpeedMapActivePlacement } from "@/lib/meeting-speed-map-sync";
import { normalizeErrorMessage } from "@/lib/startup-diagnostics";
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
  return Boolean(storedMeetingId && storedMeetingId === manifest.meetingId);
}

export function isStableMeetingId(meetingId: string): boolean {
  return /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/i.test(meetingId.trim());
}

export function syncMeetingPointersFromManifest(manifest: MeetingManifest): void {
  if (!isStableMeetingId(manifest.meetingId)) return;
  setActiveBiasMeetingId(manifest.meetingId);
  saveRacesMeetingId(manifest.meetingId);
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

export function safeReconcileSpeedMapSession(session: SpeedMapSessionState): SpeedMapSessionState {
  try {
    return reconcileSpeedMapActivePlacement(session);
  } catch (error) {
    console.warn("[speed-map] reconcile failed:", normalizeErrorMessage(error));
    return session;
  }
}

export function loadSpeedMapSessionForManifest(
  manifest: MeetingManifest | null,
): SpeedMapSessionState | null {
  try {
    if (!manifest) {
      const session = loadSpeedMapFromStorage();
      return session ? safeReconcileSpeedMapSession(session) : null;
    }

    const session = loadSpeedMapFromStorage();
    if (!speedMapMatchesManifest(session, manifest)) {
      return null;
    }

    return safeReconcileSpeedMapSession(session!);
  } catch (error) {
    console.warn("[speed-map] load session for manifest failed:", normalizeErrorMessage(error));
    return null;
  }
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
  try {
    const manifest = loadMeetingManifest();
    if (!manifest) return null;

    syncMeetingPointersFromManifest(manifest);

    const [races, speedSession] = await Promise.all([
      loadAllRaces(),
      Promise.resolve(loadSpeedMapFromStorage()),
    ]);

    const racesOk = racesMatchManifest(races, manifest);
    const speedOk = speedMapMatchesManifest(speedSession, manifest);
    const biasOk = biasMatchesManifest(manifest);

    if (racesOk && speedOk && biasOk) {
      try {
        reconcileBiasForManifest(manifest);
      } catch (error) {
        console.warn("[speed-map] bias reconcile failed:", normalizeErrorMessage(error));
      }
      return manifest;
    }

    const cached = loadLastMeetingCsvImport();
    if (cached?.text) {
      try {
        await importMeetingFromCsv(cached.text, {
          ...cached.options,
          meetingFolderPath: cached.options.meetingFolderPath || manifest.meetingFolderPath,
        });
        return loadMeetingManifest();
      } catch (error) {
        console.warn(
          "[speed-map] cached meeting CSV re-import failed:",
          normalizeErrorMessage(error),
        );
      }
    }

    if (!speedOk && speedSession) {
      clearSpeedMapLocalStorage();
    }
    if (!biasOk) {
      setActiveBiasMeetingId(manifest.meetingId);
    }
    try {
      reconcileBiasForManifest(manifest);
    } catch (error) {
      console.warn("[speed-map] bias reconcile failed:", normalizeErrorMessage(error));
    }

    return manifest;
  } catch (error) {
    console.warn("[speed-map] ensureActiveMeetingSynced failed:", normalizeErrorMessage(error));
    return loadMeetingManifest();
  }
}
