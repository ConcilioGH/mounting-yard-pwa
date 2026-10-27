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
import {
  buildPrimaryTabResultsUrl,
  buildRacingComResultsUrl,
  buildRacingNswResultsUrl,
  isVictorianMeeting,
} from "@/lib/resulted-sp/urls";
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
  RESULTED_SP_UPDATED_EVENT,
  type ResultedSpPollConfig,
  type ResultedSpRaceStatus,
  type ResultedSpMeetingState,
} from "@/lib/resulted-sp/types";

export type RaceScheduleEntry = {
  raceNo: string;
  raceLabel: string;
  title: string;
  startTime: Date | null;
};

function hasCompleteBiasPrices(
  runners: ReturnType<typeof toResultedSpRunners>,
  expectedRunnerCount = 4,
): boolean {
  const requiredPrices = Math.min(4, Math.max(1, expectedRunnerCount));
  const pricedFinishers = runners.filter(
    (runner) =>
      typeof runner.finishPosition === "number" &&
      runner.finishPosition >= 1 &&
      Number.parseFloat(runner.officialSP) > 0,
  );
  return pricedFinishers.length >= requiredPrices;
}

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
  if (!entry?.startTime) return "waiting";

  const eligibleAt = entry.startTime.getTime() + config.startDelayMs;
  if (now.getTime() < eligibleAt) return "waiting";

  const nextRace = schedule[index + 1];
  if (
    nextRace?.startTime &&
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
      .filter((r) => typeof r.finishPosition === "number" && r.finishPosition >= 1)
      .sort((a, b) => Number(a.finishPosition) - Number(b.finishPosition))
      .slice(0, 4)
      .map((r, index) => ({
        // Bias rows represent the first four horses home. With a dead heat the
        // official positions may be 1,2,2,4, so map them to grid slots 1–4.
        finishPosition: (index + 1) as 1 | 2 | 3 | 4,
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
  const race = options.races.find((candidate) => normalizeRaceNoFromId(candidate.id) === raceNo);
  if (
    existing?.status === "imported" &&
    existing.runners.length > 0 &&
    hasCompleteBiasPrices(existing.runners, race?.runners.length) &&
    !options.force
  ) {
    // A result can already be cached from an earlier page/session while the
    // Bias rows were not yet available. Re-apply that cached result on every
    // normal poll so an early race (most commonly R1) cannot remain blank
    // while later races, imported after Bias was opened, populate correctly.
    // applyResultsSpToBiasEntries keeps existing user-entered SP values intact.
    const source = existing.source || existing.runners[0]?.source || "cached";
    const biasReport = syncBiasFromImportedRace(meetingId, raceNo, existing.runners, source);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(RESULTED_SP_UPDATED_EVENT, { detail: { meetingId } }),
      );
    }
    logResultedSpImportAttempt({
      attemptId: createResultedSpAttemptId(),
      timestamp: new Date().toISOString(),
      meetingId,
      raceNo,
      source,
      resolvedUrl: state.resultsUrl || "",
      runnersParsed: existing.runners.length,
      spValuesParsed: existing.runners.filter((runner) => runner.officialSP.trim()).length,
      rowsWritten: 0,
      storageKey: getResultedSpStorageKey(meetingId),
      eventDispatched: true,
      outcome: "imported",
      detail: `cached result reused; ${biasReport}`,
    });
    return { ok: true, imported: false, state };
  }

  const tabUrl = buildPrimaryTabResultsUrl(options.manifest);
  const primaryResultsUrl = isVictorianMeeting(options.manifest)
    ? buildRacingComResultsUrl(options.manifest, raceNo) || tabUrl
    : buildRacingNswResultsUrl(options.manifest) || tabUrl;
  state = {
    ...state,
    resultsUrl: primaryResultsUrl,
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
      const resultsUrl = importResult.resultsUrl || tabUrl;
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

    const importedAt = new Date().toISOString();
    const source = importResult.source;
    const resultsUrl = importResult.resultsUrl || tabUrl;
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
    // The first resulted-SP event fires when the result rows are saved, before
    // Bias storage is updated. Notify once more after the SP copy so an open
    // Bias screen reloads the populated cells rather than retaining blanks.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(RESULTED_SP_UPDATED_EVENT, { detail: { meetingId } }),
      );
    }
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

  const syncCachedImportsToBias = () => {
    const cachedState = loadResultedSpStateForMeeting(options.meetingId);
    let foundCachedImport = false;
    for (const [raceNo, raceState] of Object.entries(cachedState.races)) {
      if (raceState.status !== "imported" || !raceState.runners.length) continue;
      foundCachedImport = true;
      const source = raceState.source || raceState.runners[0]?.source || "cached";
      syncBiasFromImportedRace(options.meetingId, raceNo, raceState.runners, source);
    }
    if (foundCachedImport && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(RESULTED_SP_UPDATED_EVENT, {
          detail: { meetingId: options.meetingId },
        }),
      );
    }
  };

  const shouldPollRace = (raceNo: string, now: Date): boolean => {
    const state = loadResultedSpStateForMeeting(options.meetingId);
    const raceState = state.races[raceNo];
    const race = options.races.find((candidate) => normalizeRaceNoFromId(candidate.id) === raceNo);
    if (
      raceState?.status === "imported" &&
      raceState.runners.length > 0 &&
      hasCompleteBiasPrices(raceState.runners, race?.runners.length)
    ) {
      return false;
    }
    if (raceState?.status === "failed") return false;

    const entry = schedule().find((r) => r.raceNo === raceNo);
    if (!entry?.startTime) return false;
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
      if (next?.startTime && now.getTime() >= next.startTime.getTime() && raceState?.status !== "failed") {
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

  const pollTick = async (onlyRaceNo?: string, force = false) => {
    if (stopped || (ticking && !force)) return;
    if (!force) ticking = true;
    const now = new Date();
    refreshLateStatuses(now);
    notify();

    const sched = schedule();
    const targets = onlyRaceNo
      ? [normalizeRaceNo(onlyRaceNo)]
      : sched.map((entry) => entry.raceNo).filter((raceNo) => {
          if (!force) return shouldPollRace(raceNo, now);
          const entry = sched.find((candidate) => candidate.raceNo === raceNo);
          const raceState = loadResultedSpStateForMeeting(options.meetingId).races[raceNo];
          if (!entry) return false;
          if (entry.startTime && now.getTime() < entry.startTime.getTime()) return false;
          const race = options.races.find(
            (candidate) => normalizeRaceNoFromId(candidate.id) === raceNo,
          );
          if (
            raceState?.status === "imported" &&
            raceState.runners.length > 0 &&
            hasCompleteBiasPrices(raceState.runners, race?.runners.length)
          ) {
            return false;
          }
          return raceState?.status !== "failed";
        });

    // Keep storage writes ordered. Each successful import reads and rewrites the
    // shared Bias state; concurrent races can otherwise overwrite one another.
    // Slow upstreams are bounded by the fetch proxy timeout, so ordered imports
    // no longer allow one request to hang the remainder of the meeting forever.
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
    if (!force) ticking = false;
  };

  const uiTimer = window.setInterval(() => {
    refreshLateStatuses(new Date());
    notify();
  }, 15_000);

  const pollTimer = window.setInterval(() => {
    void pollTick();
  }, config.pollIntervalMs);

  // Repair Bias from any results cached before this page/session was ready.
  // This runs once at startup; normal polling continues to skip imported races.
  syncCachedImportsToBias();
  notify();
  void pollTick();

  return {
    stop: () => {
      stopped = true;
      window.clearInterval(uiTimer);
      window.clearInterval(pollTimer);
    },
    checkNow: async (raceNo) => {
      await pollTick(raceNo, true);
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
