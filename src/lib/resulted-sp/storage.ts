import type { ResultedSpMeetingState, ResultedSpRaceState, ResultedSpRunner } from "@/lib/resulted-sp/types";

const STORAGE_PREFIX = "resulted-sp:";

export function getResultedSpStorageKey(meetingId: string): string {
  const id = meetingId.trim();
  if (!id) return "";
  return id.startsWith(STORAGE_PREFIX) ? id : `${STORAGE_PREFIX}${id}`;
}

export function createEmptyResultedSpMeetingState(meetingId: string): ResultedSpMeetingState {
  return {
    meetingId: meetingId.trim(),
    updatedAt: new Date().toISOString(),
    races: {},
  };
}

function normalizeRunner(raw: unknown): ResultedSpRunner | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const raceNo = String(r.raceNo ?? "").trim();
  const horse = String(r.horse ?? "").trim();
  if (!raceNo || !horse) return null;
  const finishRaw = r.finishPosition;
  const finishPosition =
    finishRaw === "" || finishRaw == null
      ? ""
      : Number.isFinite(Number(finishRaw))
        ? Number(finishRaw)
        : "";
  return {
    raceNo,
    runnerNo: String(r.runnerNo ?? "").trim(),
    horse,
    officialSP: String(r.officialSP ?? "").trim(),
    finishPosition,
    margin: String(r.margin ?? "").trim(),
    resultStatus: String(r.resultStatus ?? "resulted").trim() || "resulted",
    importedAt: String(r.importedAt ?? "").trim(),
    source: String(r.source ?? "").trim(),
  };
}

function normalizeRaceState(raw: unknown): ResultedSpRaceState {
  if (!raw || typeof raw !== "object") {
    return { status: "waiting", runners: [] };
  }
  const r = raw as Record<string, unknown>;
  const status = String(r.status ?? "waiting").trim() as ResultedSpRaceState["status"];
  const runners = Array.isArray(r.runners)
    ? r.runners.map(normalizeRunner).filter((x): x is ResultedSpRunner => x != null)
    : [];
  return {
    status: ["waiting", "checking", "imported", "late", "failed"].includes(status) ? status : "waiting",
    importedAt: r.importedAt ? String(r.importedAt) : undefined,
    lastCheckedAt: r.lastCheckedAt ? String(r.lastCheckedAt) : undefined,
    lastError: r.lastError ? String(r.lastError) : undefined,
    source: r.source ? String(r.source) : undefined,
    isChecking: Boolean(r.isChecking),
    runners,
  };
}

export function loadResultedSpStateForMeeting(meetingId: string): ResultedSpMeetingState {
  const id = meetingId.trim();
  const key = getResultedSpStorageKey(id);
  if (typeof localStorage === "undefined" || !id || !key) {
    return createEmptyResultedSpMeetingState(id);
  }
  const raw = localStorage.getItem(key);
  if (!raw) return createEmptyResultedSpMeetingState(id);
  try {
    const parsed = JSON.parse(raw) as Partial<ResultedSpMeetingState>;
    const races: Record<string, ResultedSpRaceState> = {};
    if (parsed.races && typeof parsed.races === "object") {
      for (const [raceNo, raceState] of Object.entries(parsed.races)) {
        races[raceNo] = normalizeRaceState(raceState);
      }
    }
    return {
      meetingId: id,
      resultsUrl: parsed.resultsUrl ? String(parsed.resultsUrl) : undefined,
      updatedAt: String(parsed.updatedAt ?? new Date().toISOString()),
      races,
    };
  } catch {
    return createEmptyResultedSpMeetingState(id);
  }
}

export function saveResultedSpStateForMeeting(state: ResultedSpMeetingState): void {
  const id = state.meetingId.trim();
  const key = getResultedSpStorageKey(id);
  if (typeof localStorage === "undefined" || !id || !key) return;
  const payload: ResultedSpMeetingState = {
    ...state,
    meetingId: id,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(key, JSON.stringify(payload));
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("mounting-yard-resulted-sp-updated", {
        detail: { meetingId: id },
      }),
    );
  }
}

export function getOfficialSpForRunner(
  state: ResultedSpMeetingState | null | undefined,
  raceNo: string,
  runnerNo: string | number,
): string {
  if (!state) return "";
  const race = state.races[String(raceNo).trim()];
  if (!race) return "";
  const no = String(runnerNo).trim();
  const runner = race.runners.find((r) => String(r.runnerNo).trim() === no);
  return runner?.officialSP ?? "";
}
