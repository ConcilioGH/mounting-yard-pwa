import type { Race, Runner } from "@/lib/types";

const IPAD_YARD_MEETING_STORE_KEY = "ipad-yard-meeting-store-v2";

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
    // Only the requested meeting may contribute races.
    const selectedMeetingId = store.meetings[meetingId] ? meetingId : "";
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
    // Unscoped legacy data cannot safely be attributed to this meeting.
    return [];
  } catch {
    return [];
  }
}

/** Reconcile only cards already scoped to the same meeting; never use array length as a race number. */
export function reconcileMeetingRaces(raceNos: string[], ...cards: Race[][]): Race[] {
  const byNo = new Map<string, Race>();
  const normalize = (id: string) => String(Number(id.replace(/^R/i, "")));
  for (const card of cards) {
    for (const race of card) {
      const no = normalize(race.id);
      if (/^[1-9]\d*$/.test(no) && !byNo.has(no)) byNo.set(no, race);
    }
  }
  for (const id of raceNos) {
    const no = normalize(id);
    if (/^[1-9]\d*$/.test(no) && !byNo.has(no)) {
      byNo.set(no, { id: `R${no}`, title: `Race ${no}`, runners: [] });
    }
  }
  return [...byNo.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
