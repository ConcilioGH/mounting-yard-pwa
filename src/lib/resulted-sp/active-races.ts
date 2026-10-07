import type { Race, Runner } from "@/lib/types";

const IPAD_YARD_MEETING_STORE_KEY = "ipad-yard-meeting-store-v2";
const IPAD_YARD_RACES_KEY = "ipad-yard-races-v1";

function normalizeRunner(value: unknown): Runner | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const no = Number(raw.no);
  const horse = String(raw.horse ?? "").trim();
  if (!Number.isFinite(no) || !horse) return null;
  return {
    no,
    horse,
    br: Number(raw.br) || 0,
    trainer: String(raw.trainer ?? ""),
    jockey: String(raw.jockey ?? ""),
    odds: String(raw.odds ?? ""),
  };
}

function normalizeRace(value: unknown): Race | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = String(raw.id ?? "").trim();
  const title = String(raw.title ?? "").trim();
  if (!id || !title || !Array.isArray(raw.runners)) return null;
  return {
    id,
    title,
    runners: raw.runners.map(normalizeRunner).filter((runner): runner is Runner => runner != null),
  };
}

export function parseIpadYardMeetingStoreRaces(raw: string, meetingId: string): Race[] {
  if (!raw.trim() || !meetingId.trim()) return [];
  try {
    const store = JSON.parse(raw) as {
      version?: number;
      activeMeetingId?: string;
      meetings?: Record<string, { races?: unknown[] }>;
    };
    if (store.version !== 2 || !store.meetings) return [];
    // Older iPad imports sometimes generated a manifest id after the meeting store
    // had already chosen its key. Prefer an exact match, otherwise use the store's
    // explicitly active card; never select an arbitrary saved meeting.
    const selectedMeetingId = store.meetings[meetingId]
      ? meetingId
      : String(store.activeMeetingId ?? "").trim();
    if (!selectedMeetingId) return [];
    const races = store.meetings[selectedMeetingId]?.races;
    if (!Array.isArray(races)) return [];
    return races.map(normalizeRace).filter((race): race is Race => race != null);
  } catch {
    return [];
  }
}

export function parseIpadYardLegacyRaces(raw: string): Race[] {
  if (!raw.trim()) return [];
  try {
    const races = JSON.parse(raw) as unknown;
    if (!Array.isArray(races)) return [];
    return races.map(normalizeRace).filter((race): race is Race => race != null);
  } catch {
    return [];
  }
}

/** Read the active race card written by the plain-JS /ipad-yard-dom workflow. */
export function loadActiveIpadYardRaces(meetingId: string): Race[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const meetingRaces = parseIpadYardMeetingStoreRaces(
      localStorage.getItem(IPAD_YARD_MEETING_STORE_KEY) ?? "",
      meetingId,
    );
    if (meetingRaces.length > 0) return meetingRaces;
    return parseIpadYardLegacyRaces(localStorage.getItem(IPAD_YARD_RACES_KEY) ?? "");
  } catch {
    return [];
  }
}
