import { normalizeRaceNo } from "@/lib/meeting-coordination";
import type { MeetingManifest } from "@/lib/meeting-coordination";
import { applyResultsSpToBiasEntries } from "@/lib/race-day-bias/apply-results-sp";
import {
  loadRaceDayBiasStateForMeeting,
  saveRaceDayBiasStateForMeeting,
} from "@/lib/race-day-bias/storage";
import type { ParsedRaceResults } from "@/lib/results-sp-parser";
import { deliverMeetingExport } from "@/lib/meeting-export-delivery";
import { parseStartTimeToDate } from "@/lib/yard-race-countdown";
import type { Race } from "@/lib/types";
import { buildResultedSpCsv } from "@/lib/resulted-sp/export";
import { toResultedSpRunners } from "@/lib/resulted-sp/match-runners";
import { importRaceFromSources } from "@/lib/resulted-sp/sources";
import { buildPrimaryTabResultsUrl, resolvePrimaryTabResultsUrl } from "@/lib/resulted-sp/urls";
import {
  loadResultedSpStateForMeeting,
  saveResultedSpStateForMeeting,
  getResultedSpStorageKey,
} from "@/lib/resulted-sp/storage";
import {
  createResultedSpAttemptId,
  logResultedSpImportAttempt,
} from "@/lib/resulted-sp/diagnostics";
import {
  DEFAULT_RESULTED_SP_POLL_CONFIG,
  type ResultedSpPollConfig,
  type ResultedSpRaceStatus,
  type ResultedSpMeetingState,
} from "@/lib/resulted-sp/types";

export type RaceScheduleEntry = {
  raceNo: string;
  raceLabel: string;
  title: string;
  startTime: Date;
};

function normalizeRaceNoFromId(id: string): string {
  const trimmed = String(id ?? "").trim();
  const match = /^R?(\d+)$/i.exec(trimmed);
  if (match) return match[1]!;
  return trimmed;
}

export function buildResultedSpSchedule(
  races: Race[],
  meetingDate: string | undefined,
  now: Date = new Date(),
): RaceScheduleEntry[] {
  return [...races]
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((race) => {
      const startTime = parseStartTimeToDate(race.title, meetingDate, now);
      if (!startTime) return null;
      const raceNo = normalizeRaceNoFromId(race.id);
      return {
        raceNo,
        raceLabel: /^R/i.test(race.id.trim()) ? race.id.trim().toUpperCase() : `R${raceNo}`,
        title: race.title,
        startTime,
      };
    })
    .filter((x): x is RaceScheduleEntry => x != null);
}

export function computeDisplayRaceStatus(
  state: ResultedSpMeetingState,
  raceNo: string,
  schedule: RaceScheduleEntry[],
  now: Date,
  config: ResultedSpPollConfig = DEFAULT_RESULTED_SP_POLL_CONFIG,
): ResultedSpRaceStatus {
  const raceState = state.races[raceNo];
  if (raceState?.status === "imported" && raceState.runners.length > 0) return "imported";
  if (raceState?.status === "failed") return "failed";
  if (raceState?.isChecking) return "checking";

  const index = schedule.findIndex((r) => r.raceNo === raceNo);
  const entry = schedule[index];
  if (!entry) return "waiting";

  const eligibleAt = entry.startTime.getTime() + config.startDelayMs;
  if (now.getTime() < eligibleAt) return "waiting";

  const nextRace = schedule[index + 1];
  if (
    nextRace &&
    now.getTime() >= nextRace.startTime.getTime() &&
    raceState?.status !== "imported"
  ) {
    return "late";
  }

  if (raceState?.lastCheckedAt) return raceState.status === "late" ? "late" : "checking";
  return "checking";
}

function syncBiasFromImportedRace(
  meetingId: string,
  raceNo: string,
  runners: ReturnType<typeof toResultedSpRunners>,
  parserSource: string,
): string {
  const biasLoad = loadRaceDayBiasStateForMeeting(meetingId);
  if (!biasLoad.state.races.length) {
    return "bias skipped: no bias rows for meeting";
  }

  const parsedRace: ParsedRaceResults = {
    raceNo: normalizeRaceNo(raceNo),
    results: runners
      .filter((r) => typeof r.finishPosition === "number" && r.finishPosition >= 1 && r.finishPosition <= 4)
      .map((r) => ({
        finishPosition: r.finishPosition as 1 | 2 | 3 | 4,
        horseName: r.horse,
        sp: Number(r.officialSP),
      })),
  };
  if (!parsedRace.results.length) {
    return "bias skipped: no top-4 finishers with SP";
  }

  const { entries, report } = applyResultsSpToBiasEntries([parsedRace], biasLoad.state.races, {
    overwriteExistingSp: false,
    parserUsed: `resulted-sp-poller:${parserSource}`,
  });
  if (!report.spPopulated) {
    return `bias skipped: spPopulated=0 unmatched=${report.unmatchedRaces.join(",")}`;
  }
  saveRaceDayBiasStateForMeeting(meetingId, {
    ...biasLoad.state,
    races: entries,
  });
  return `bias updated: ${report.spPopulated} SPs`;
}

async function exportResultedSpCsv(state: ResultedSpMeetingState, manifest: MeetingManifest): Promise<void> {
  const csv = buildResultedSpCsv(state);
  if (!csv.trim()) return;
  await deliverMeetingExport("resulted-sp", csv, { fallbackTrack: manifest.trackSlug });
}

export type ImportRaceResult = {
  ok: boolean;
  imported: boolean;
  error?: string;
  state: ResultedSpMeetingState;
};

export async function importResultedSpForRace(options: {
  meetingId: string;
  manifest: MeetingManifest;
  races: Race[];
  raceNo: string;
  force?: boolean;
}): Promise<ImportRaceResult> {
  const meetingId = options.meetingId.trim();
  const raceNo = normalizeRaceNo(options.raceNo);
  let state = loadResultedSpStateForMeeting(meetingId);
  const existing = state.races[raceNo];
  if (existing?.status === "imported" && existing.runners.length > 0 && !options.force) {
    return { ok: true, imported: false, state };
  }

  const tabUrl =
    (await resolvePrimaryTabResultsUrl(options.manifest, raceNo)) ??
    buildPrimaryTabResultsUrl(options.manifest);
  state = {
    ...state,
    resultsUrl: tabUrl,
    races: {
      ...state.races,
      [raceNo]: {
        ...(state.races[raceNo] ?? { status: "checking", runners: [] }),
        status: "checking",
        isChecking: true,
        lastError: undefined,
      },
    },
  };
  saveResultedSpStateForMeeting(state);

  try {
    const importResult = await importRaceFromSources({
      manifest: options.manifest,
      raceNo,
      meetingId,
    });

    if (!importResult.imported) {
      const nowIso = new Date().toISOString();
      const resultsUrl = importResult.tabResultsUrl || tabUrl;
      state = loadResultedSpStateForMeeting(meetingId);
      state = {
        ...state,
        resultsUrl,
        races: {
          ...state.races,
          [raceNo]: {
            ...(state.races[raceNo] ?? { runners: [] }),
            status: state.races[raceNo]?.status === "late" ? "late" : "checking",
            isChecking: false,
            lastCheckedAt: nowIso,
            lastError: importResult.notReady
              ? "Official results not available yet."
              : importResult.lastError || "Official results not available yet.",
            runners: state.races[raceNo]?.runners ?? [],
          },
        },
      };
      saveResultedSpStateForMeeting(state);
      logResultedSpImportAttempt({
        attemptId: createResultedSpAttemptId(),
        timestamp: nowIso,
        meetingId,
        raceNo,
        source: "poller",
        resolvedUrl: resultsUrl,
        rowsWritten: 0,
        storageKey: getResultedSpStorageKey(meetingId),
        eventDispatched: true,
        outcome: importResult.notReady ? "not_ready" : "error",
        detail: importResult.lastError || "Official results not available yet.",
      });
      return { ok: true, imported: false, state };
    }

    const race = options.races.find((r) => normalizeRaceNoFromId(r.id) === raceNo);
    const importedAt = new Date().toISOString();
    const source = importResult.source;
    const resultsUrl = importResult.tabResultsUrl || tabUrl;
    const runners = toResultedSpRunners(importResult.parsed, race, source, importedAt);
    state = loadResultedSpStateForMeeting(meetingId);
    state = {
      ...state,
      resultsUrl,
      races: {
        ...state.races,
        [raceNo]: {
          status: "imported",
          importedAt,
          lastCheckedAt: importedAt,
          source,
          isChecking: false,
          lastError: undefined,
          runners,
        },
      },
    };
    saveResultedSpStateForMeeting(state);
    const biasReport = syncBiasFromImportedRace(meetingId, raceNo, runners, source);
    await exportResultedSpCsv(state, options.manifest);
    logResultedSpImportAttempt({
      attemptId: createResultedSpAttemptId(),
      timestamp: importedAt,
      meetingId,
      raceNo,
      source,
      resolvedUrl: resultsUrl,
      runnersParsed: runners.length,
      spValuesParsed: runners.filter((r) => r.officialSP.trim()).length,
      rowsWritten: runners.length,
      storageKey: getResultedSpStorageKey(meetingId),
      eventDispatched: true,
      outcome: "imported",
      detail: biasReport,
    });
    return { ok: true, imported: true, state };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state = loadResultedSpStateForMeeting(meetingId);
    state = {
      ...state,
      races: {
        ...state.races,
        [raceNo]: {
          ...(state.races[raceNo] ?? { runners: [] }),
          status: state.races[raceNo]?.status === "late" ? "late" : "checking",
          isChecking: false,
          lastCheckedAt: new Date().toISOString(),
          lastError: message,
          runners: state.races[raceNo]?.runners ?? [],
        },
      },
    };
    saveResultedSpStateForMeeting(state);
    return { ok: false, imported: false, error: message, state };
  }
}

export function resetResultedSpRace(meetingId: string, raceNo: string): ResultedSpMeetingState {
  const id = meetingId.trim();
  const no = normalizeRaceNo(raceNo);
  const state = loadResultedSpStateForMeeting(id);
  const next = { ...state.races };
  delete next[no];
  const updated: ResultedSpMeetingState = { ...state, races: next };
  saveResultedSpStateForMeeting(updated);
  return updated;
}

export function markResultedSpRaceFailed(meetingId: string, raceNo: string): ResultedSpMeetingState {
  const no = normalizeRaceNo(raceNo);
  const state = loadResultedSpStateForMeeting(meetingId);
  const updated: ResultedSpMeetingState = {
    ...state,
    races: {
      ...state.races,
      [no]: {
        ...(state.races[no] ?? { runners: [] }),
        status: "failed",
        isChecking: false,
        lastError: state.races[no]?.lastError || "Import stopped.",
        runners: state.races[no]?.runners ?? [],
      },
    },
  };
  saveResultedSpStateForMeeting(updated);
  return updated;
}

export type ResultedSpPollerHandle = {
  stop: () => void;
  checkNow: (raceNo?: string) => Promise<void>;
  importRaceNow: (raceNo: string) => Promise<ImportRaceResult>;
  resetRace: (raceNo: string) => void;
};

export function startResultedSpPoller(options: {
  meetingId: string;
  manifest: MeetingManifest;
  races: Race[];
  config?: Partial<ResultedSpPollConfig>;
  onStateChange?: (state: ResultedSpMeetingState) => void;
}): ResultedSpPollerHandle {
  const config: ResultedSpPollConfig = {
    ...DEFAULT_RESULTED_SP_POLL_CONFIG,
    ...options.config,
  };
  let stopped = false;
  let ticking = false;
  const inFlight = new Set<string>();

  const notify = () => {
    options.onStateChange?.(loadResultedSpStateForMeeting(options.meetingId));
  };

  const schedule = () => buildResultedSpSchedule(options.races, options.manifest.date);

  const shouldPollRace = (raceNo: string, now: Date): boolean => {
    const state = loadResultedSpStateForMeeting(options.meetingId);
    const raceState = state.races[raceNo];
    if (raceState?.status === "imported" && raceState.runners.length > 0) return false;
    if (raceState?.status === "failed") return false;

    const entry = schedule().find((r) => r.raceNo === raceNo);
    if (!entry) return false;
    if (now.getTime() < entry.startTime.getTime()) return false;
    if (now.getTime() < entry.startTime.getTime() + config.startDelayMs) return false;

    const lastChecked = raceState?.lastCheckedAt ? Date.parse(raceState.lastCheckedAt) : 0;
    if (lastChecked && now.getTime() - lastChecked < config.pollIntervalMs) return false;
    return true;
  };

  const refreshLateStatuses = (now: Date) => {
    const state = loadResultedSpStateForMeeting(options.meetingId);
    const sched = schedule();
    let changed = false;
    const races = { ...state.races };
    for (let i = 0; i < sched.length; i++) {
      const raceNo = sched[i]!.raceNo;
      const raceState = races[raceNo];
      if (raceState?.status === "imported") continue;
      const next = sched[i + 1];
      if (next && now.getTime() >= next.startTime.getTime() && raceState?.status !== "failed") {
        if (raceState?.status !== "late") {
          races[raceNo] = {
            ...(raceState ?? { runners: [] }),
            status: "late",
            runners: raceState?.runners ?? [],
          };
          changed = true;
        }
      }
    }
    if (changed) {
      saveResultedSpStateForMeeting({ ...state, races });
    }
  };

  const pollTick = async (onlyRaceNo?: string) => {
    if (stopped || ticking) return;
    ticking = true;
    const now = new Date();
    refreshLateStatuses(now);
    notify();

    const sched = schedule();
    const targets = onlyRaceNo
      ? [normalizeRaceNo(onlyRaceNo)]
      : sched.map((r) => r.raceNo).filter((raceNo) => shouldPollRace(raceNo, now));

    for (const raceNo of targets) {
      if (inFlight.has(raceNo)) continue;
      inFlight.add(raceNo);
      try {
        await importResultedSpForRace({
          meetingId: options.meetingId,
          manifest: options.manifest,
          races: options.races,
          raceNo,
        });
      } finally {
        inFlight.delete(raceNo);
        notify();
      }
    }
    ticking = false;
  };

  const uiTimer = window.setInterval(() => {
    refreshLateStatuses(new Date());
    notify();
  }, 15_000);

  const pollTimer = window.setInterval(() => {
    void pollTick();
  }, config.pollIntervalMs);

  void pollTick();

  return {
    stop: () => {
      stopped = true;
      window.clearInterval(uiTimer);
      window.clearInterval(pollTimer);
    },
    checkNow: async (raceNo) => {
      await pollTick(raceNo);
    },
    importRaceNow: (raceNo) =>
      importResultedSpForRace({
        meetingId: options.meetingId,
        manifest: options.manifest,
        races: options.races,
        raceNo,
        force: true,
      }),
    resetRace: (raceNo) => {
      resetResultedSpRace(options.meetingId, raceNo);
      notify();
    },
  };
}
