import type { Race } from "@/lib/types";
import { parseMeetingCsv, type MeetingCsvParseResult } from "@/lib/csv";
import { saveRaces } from "@/lib/db";
import { syncSpeedMapOnMeetingImport } from "@/lib/meeting-speed-map-sync";
import {
  inferMeetingDateFromFileName,
  inferMeetingFolderPath,
  inferMeetingTrackFromFileName,
  parseMasterCsvFileName,
  parseMeetingFolderMeta,
  sanitizeMeetingSlug,
} from "@/lib/meeting-export";
import { saveMeetingDirectoryHandle } from "@/lib/meeting-folder-handle";
import {
  createEmptyBiasRaceEntry,
  createDefaultBiasState,
  deriveMeetingId,
  loadRaceDayBiasStateForMeeting,
  logBiasStorageDebug,
  removeLegacyBiasStorageKeys,
  saveRaceDayBiasStateForMeeting,
  setActiveBiasMeetingId,
} from "@/lib/race-day-bias/storage";
import type { RaceBiasEntry, RaceDayBiasState } from "@/lib/race-day-bias/types";

export const MEETING_MANIFEST_STORAGE_KEY = "mounting-yard-meeting-manifest-v1";

/** Fired after a meeting CSV import syncs all modules. */
export const MEETING_IMPORTED_EVENT = "mounting-yard-meeting-imported";

export type MeetingManifest = {
  /** Stable id for storage (e.g. 2026-05-28-canterbury). */
  meetingId: string;
  /** Ordered race numbers signature — import shape only, not meeting identity. */
  meetingKey: string;
  trackName: string;
  /** Slug for export filenames (e.g. canterbury). */
  trackSlug: string;
  date: string;
  /** Relative repo path e.g. meetings/2026-05-28-canterbury */
  meetingFolderPath: string;
  /** Ordered race numbers (normalized, no "R" prefix). */
  raceNos: string[];
  importedAt: string;
};

export type ImportedMeeting = {
  meetingId: string;
  trackName: string;
  date: string;
  races: Race[];
};

/** Normalize race id / race_no to the bias table key (e.g. "R3" → "3"). */
export function normalizeRaceNo(value: string): string {
  const trimmed = String(value ?? "").trim();
  const match = /^R?(\d+)$/i.exec(trimmed);
  if (match) return match[1]!;
  return trimmed;
}

export function buildMeetingKey(raceNos: string[]): string {
  return raceNos.map(normalizeRaceNo).filter(Boolean).join("|");
}

export function raceNosFromMountingYardRaces(races: Race[]): string[] {
  return [...races]
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((race) => normalizeRaceNo(race.id))
    .filter(Boolean);
}

export function raceNosFromSpeedMapOrder(raceNos: string[]): string[] {
  return raceNos.map(normalizeRaceNo).filter(Boolean);
}

export function loadMeetingManifest(): MeetingManifest | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(MEETING_MANIFEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MeetingManifest>;
    const raceNos = Array.isArray(parsed.raceNos)
      ? parsed.raceNos.map((n) => normalizeRaceNo(String(n))).filter(Boolean)
      : [];
    if (!raceNos.length) return null;
    const meetingKey = String(parsed.meetingKey ?? buildMeetingKey(raceNos));
    const trackSlug = String(parsed.trackSlug ?? "").trim();
    const trackName = String(
      parsed.trackName ?? (parsed as { meetingLabel?: string }).meetingLabel ?? "",
    ).trim();
    const date = String(parsed.date ?? "").trim();
    const meetingFolderPath = String(parsed.meetingFolderPath ?? "").trim();
    const resolvedSlug = trackSlug || sanitizeMeetingSlug(trackName);
    const meetingId =
      deriveMeetingId({ date, trackSlug: resolvedSlug, meetingFolderPath }) ||
      String(parsed.meetingId ?? "").trim() ||
      meetingKey;

    return {
      meetingId,
      meetingKey,
      trackName,
      trackSlug: resolvedSlug,
      date,
      meetingFolderPath,
      raceNos,
      importedAt: String(parsed.importedAt ?? ""),
    };
  } catch {
    return null;
  }
}

export function saveMeetingManifest(manifest: MeetingManifest): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MEETING_MANIFEST_STORAGE_KEY, JSON.stringify(manifest));
  setActiveBiasMeetingId(manifest.meetingId);
}

export type SyncRaceDayBiasOptions = {
  meetingLabel?: string;
  trackName?: string;
};

/**
 * After a meeting CSV import, load or create bias rows scoped to `meetingId` only.
 * Never reads bias data from another meeting.
 */
export function syncRaceDayBiasOnMeetingImport(
  meetingId: string,
  raceNos: string[],
  options?: SyncRaceDayBiasOptions,
): RaceDayBiasState {
  const id = meetingId.trim();
  const normalizedRaceNos = raceNos.map(normalizeRaceNo).filter(Boolean);

  if (!id || normalizedRaceNos.length === 0) {
    return createDefaultBiasState();
  }

  removeLegacyBiasStorageKeys();

  const { state: existing, loadedExisting, biasKey } = loadRaceDayBiasStateForMeeting(id);
  const byNo = new Map(
    existing.races.map((race) => [normalizeRaceNo(race.raceNo), race] as const),
  );

  const races: RaceBiasEntry[] = normalizedRaceNos.map(
    (raceNo) => byNo.get(raceNo) ?? createEmptyBiasRaceEntry(raceNo),
  );

  const labelFromImport = options?.meetingLabel?.trim() ?? options?.trackName?.trim() ?? "";
  const meetingLabel = labelFromImport || existing.meetingLabel;

  const next: RaceDayBiasState = {
    ...existing,
    meetingLabel,
    races,
    updatedAt: new Date().toISOString(),
  };

  saveRaceDayBiasStateForMeeting(id, next);
  setActiveBiasMeetingId(id);

  logBiasStorageDebug(id, biasKey, loadedExisting, races.length);

  return next;
}

export type ImportMeetingOptions = {
  fileName?: string;
  /** `webkitRelativePath` or logical path containing meeting folder. */
  importPath?: string;
  meetingFolderPath?: string;
  directoryHandle?: FileSystemDirectoryHandle;
  /** Clears mounting-yard assessments when importing a different meeting (default true). */
  clearAssessmentsOnNewMeeting?: boolean;
};

export type ImportMeetingResult = ImportedMeeting & {
  sameMeeting: boolean;
  parsed: MeetingCsvParseResult;
};

/**
 * Single entry point for meeting CSV import (Mounting Yard header).
 * Persists races, manifest, bias rows, and speed map session.
 */
export async function importMeetingFromCsv(
  text: string,
  options?: ImportMeetingOptions,
): Promise<ImportMeetingResult> {
  const parsed = parseMeetingCsv(text, options?.fileName);
  const raceNos = raceNosFromMountingYardRaces(parsed.races);
  const meetingKey = buildMeetingKey(raceNos);
  const existingManifest = loadMeetingManifest();

  const folderFromPath = options?.importPath
    ? parseMeetingFolderMeta(options.importPath)
    : options?.meetingFolderPath
      ? parseMeetingFolderMeta(options.meetingFolderPath)
      : null;
  const folderFromDir =
    options?.directoryHandle?.name
      ? parseMeetingFolderMeta(options.directoryHandle.name)
      : null;
  const fromMasterName = options?.fileName ? parseMasterCsvFileName(options.fileName) : null;

  const fileTrack = options?.fileName ? inferMeetingTrackFromFileName(options.fileName) : "";
  const fileDate = options?.fileName ? inferMeetingDateFromFileName(options.fileName) : "";

  const trackSlug =
    folderFromPath?.track ||
    folderFromDir?.track ||
    fromMasterName?.track ||
    sanitizeMeetingSlug(parsed.meta.trackName.trim() || fileTrack || existingManifest?.trackSlug || "") ||
    "meeting";

  const date =
    folderFromPath?.date ||
    folderFromDir?.date ||
    fromMasterName?.date ||
    parsed.meta.date.trim() ||
    fileDate ||
    existingManifest?.date ||
    new Date().toISOString().slice(0, 10);

  const trackName =
    parsed.meta.trackName.trim() ||
    fileTrack ||
    trackSlug ||
    existingManifest?.trackName ||
    "";

  const meetingFolderPath =
    options?.meetingFolderPath?.trim() ||
    folderFromPath?.meetingFolderPath ||
    folderFromDir?.meetingFolderPath ||
    inferMeetingFolderPath({
      importPath: options?.importPath,
      fileName: options?.fileName,
      track: trackSlug,
      date,
    }) ||
    existingManifest?.meetingFolderPath ||
    "";

  await saveRaces(parsed.races);

  const meetingId =
    deriveMeetingId({ date, trackSlug, meetingFolderPath }) || meetingKey;

  const sameMeeting = existingManifest?.meetingId === meetingId;

  const manifest: MeetingManifest = {
    meetingId,
    meetingKey,
    trackName,
    trackSlug,
    date,
    meetingFolderPath,
    raceNos,
    importedAt: new Date().toISOString(),
  };
  saveMeetingManifest(manifest);

  if (options?.directoryHandle) {
    await saveMeetingDirectoryHandle(meetingKey, options.directoryHandle);
  }

  syncRaceDayBiasOnMeetingImport(meetingId, raceNos, {
    trackName,
    meetingLabel: trackName,
  });
  syncSpeedMapOnMeetingImport(parsed, { sameMeeting, meetingKey });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MEETING_IMPORTED_EVENT));
  }

  return {
    meetingId,
    trackName,
    date,
    races: parsed.races,
    sameMeeting,
    parsed,
  };
}

export function formatMeetingDisplayLabel(manifest: MeetingManifest | null): string {
  if (!manifest) return "";
  const track = manifest.trackName.trim();
  const date = manifest.date.trim();
  if (track && date) return `${track} · ${date}`;
  return track || date || "";
}

export { sanitizeMeetingSlug };
