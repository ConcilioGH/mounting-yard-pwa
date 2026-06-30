import { normalizeRaceNo } from "@/lib/meeting-coordination";
import type { MeetingManifest } from "@/lib/meeting-coordination";
import { sanitizeMeetingSlug } from "@/lib/meeting-export";
import {
  inferTabJurisdiction,
  type TabJurisdiction,
} from "@/lib/resulted-sp/tab-jurisdiction";
import type { ParsedFullFieldRace, ParsedFullFieldRunner } from "@/lib/resulted-sp/parse-full-field";
import { fetchTabApiJson } from "@/lib/resulted-sp/fetch-tab-api";
import { buildTabMeetingRef, buildTabResultsMeetingUrl, type TabMeetingRef } from "@/lib/resulted-sp/tab-urls";

type TabMeetingSummary = {
  meetingName: string;
  venueMnemonic: string;
  raceType: string;
  meetingDate?: string;
  races?: TabRaceSummary[];
};

type TabRaceSummary = {
  raceNumber: number;
  raceName?: string;
  raceStatus?: string;
  results?: number[][];
  scratchings?: Array<{ runnerNumber: number; runnerName?: string; bettingStatus?: string }>;
};

type TabRaceDetail = TabRaceSummary & {
  runners?: TabRunner[];
  results?: number[][];
};

type TabRunner = {
  runnerName: string;
  runnerNumber: number;
  parimutuel?: {
    returnWin?: number;
    returnPlace?: number;
    bettingStatus?: string;
  };
  fixedOdds?: {
    bettingStatus?: string;
  };
};

const RESULTED_RACE_STATUSES = new Set(["Paying", "Closed", "Final", "Results", "Interim"]);

function normalizeTrackLabel(value: string): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function meetingMatchesManifest(meeting: TabMeetingSummary, manifest: MeetingManifest): boolean {
  const target = normalizeTrackLabel(manifest.trackName || manifest.trackSlug || "");
  const candidate = normalizeTrackLabel(meeting.meetingName || "");
  if (!target || !candidate) return false;
  if (candidate === target) return true;
  if (candidate.includes(target) || target.includes(candidate)) return true;
  const targetSlug = sanitizeMeetingSlug(manifest.trackSlug || manifest.trackName || "");
  const candidateSlug = sanitizeMeetingSlug(meeting.meetingName || "");
  return Boolean(targetSlug && candidateSlug && (candidateSlug.includes(targetSlug) || targetSlug.includes(candidateSlug)));
}

function buildFinishMap(results: number[][] | undefined): Map<number, number> {
  const map = new Map<number, number>();
  if (!Array.isArray(results)) return map;
  for (let i = 0; i < results.length; i++) {
    const selection = results[i];
    const runnerNo = Array.isArray(selection) ? selection[0] : undefined;
    if (typeof runnerNo === "number" && runnerNo > 0) {
      map.set(runnerNo, i + 1);
    }
  }
  return map;
}

function isRunnerScratched(
  runner: TabRunner,
  scratchings: TabRaceSummary["scratchings"],
): boolean {
  const pariStatus = String(runner.parimutuel?.bettingStatus ?? "").toLowerCase();
  const fixedStatus = String(runner.fixedOdds?.bettingStatus ?? "").toLowerCase();
  if (pariStatus.includes("scratch") || fixedStatus.includes("scratch")) return true;
  if (!scratchings?.length) return false;
  return scratchings.some((s) => s.runnerNumber === runner.runnerNumber);
}

export function isTabRaceOfficiallyResulted(race: TabRaceSummary | undefined): boolean {
  if (!race) return false;
  const status = String(race.raceStatus ?? "").trim();
  if (!RESULTED_RACE_STATUSES.has(status)) return false;
  const finishMap = buildFinishMap(race.results);
  return finishMap.has(1) && finishMap.has(2) && finishMap.has(3);
}

export function parseTabRaceDetail(
  detail: TabRaceDetail,
  raceNo: string,
): ParsedFullFieldRace | null {
  if (!isTabRaceOfficiallyResulted(detail)) return null;
  const finishMap = buildFinishMap(detail.results);
  const scratchings = detail.scratchings ?? [];
  const runners: ParsedFullFieldRunner[] = [];

  for (const runner of detail.runners ?? []) {
    const runnerNumber = runner.runnerNumber;
    const horseName = String(runner.runnerName ?? "").trim();
    if (!horseName) continue;
    const scratched = isRunnerScratched(runner, scratchings);
    const finishPosition = finishMap.get(runnerNumber) ?? 0;
    const sp = runner.parimutuel?.returnWin;

    if (scratched) {
      runners.push({
        finishPosition: 0,
        horseName,
        sp: 0,
        margin: "",
        resultStatus: "scratched",
      });
      continue;
    }

    if (sp == null || !Number.isFinite(sp) || sp <= 0) continue;

    runners.push({
      finishPosition,
      horseName,
      sp: Number(sp),
      margin: "",
      resultStatus: finishPosition > 0 ? "resulted" : "unplaced",
    });
  }

  const placed = runners.filter((r) => r.finishPosition >= 1 && r.finishPosition <= 3 && r.sp > 0);
  if (placed.length < 3) return null;

  return {
    raceNo: normalizeRaceNo(raceNo),
    runners,
  };
}

async function fetchMeetings(date: string, jurisdiction: TabJurisdiction): Promise<TabMeetingSummary[]> {
  const path = `racing/dates/${date}/meetings`;
  const data = await fetchTabApiJson<{ meetings?: TabMeetingSummary[] }>(path, jurisdiction);
  return data.meetings ?? [];
}

async function findThoroughbredMeeting(
  manifest: MeetingManifest,
  jurisdiction: TabJurisdiction,
): Promise<TabMeetingSummary | null> {
  const preferredDate = manifest.date?.trim() || "today";
  const datesToTry = preferredDate === "today" ? ["today"] : [preferredDate, "today"];
  const seen = new Set<string>();

  for (const date of datesToTry) {
    if (seen.has(date)) continue;
    seen.add(date);
    const meetings = await fetchMeetings(date, jurisdiction);
    const meeting = meetings.find(
      (m) => m.raceType === "R" && meetingMatchesManifest(m, manifest),
    );
    if (meeting) return meeting;
  }
  return null;
}

export async function resolveTabMeetingRef(manifest: MeetingManifest): Promise<TabMeetingRef | null> {
  const jurisdiction = inferTabJurisdiction(manifest);
  const meeting = await findThoroughbredMeeting(manifest, jurisdiction);
  if (!meeting) return null;
  return buildTabMeetingRef(meeting, manifest, jurisdiction);
}

function tabResultsPageUrl(
  meeting: TabMeetingSummary,
  manifest: MeetingManifest,
  jurisdiction: TabJurisdiction,
  raceNo?: string,
): string {
  const ref = buildTabMeetingRef(meeting, manifest, jurisdiction);
  return buildTabResultsMeetingUrl(ref, raceNo);
}

async function fetchRaceDetail(
  date: string,
  jurisdiction: TabJurisdiction,
  raceType: string,
  venueMnemonic: string,
  raceNo: string,
): Promise<TabRaceDetail> {
  const path = `racing/dates/${date}/meetings/${raceType}/${venueMnemonic}/races/${raceNo}`;
  return fetchTabApiJson<TabRaceDetail>(path, jurisdiction);
}

export type TabRaceImportResult =
  | { status: "imported"; parsed: ParsedFullFieldRace; meetingName: string; resultsPageUrl: string }
  | { status: "not_ready"; resultsPageUrl: string }
  | { status: "meeting_not_found" }
  | { status: "error"; message: string };

export async function fetchTabRaceResults(options: {
  manifest: MeetingManifest;
  raceNo: string;
}): Promise<TabRaceImportResult> {
  const raceNo = normalizeRaceNo(options.raceNo);
  const jurisdiction = inferTabJurisdiction(options.manifest);

  try {
    const meeting = await findThoroughbredMeeting(options.manifest, jurisdiction);
    if (!meeting) {
      return { status: "meeting_not_found" };
    }

    const resultsPageUrl = tabResultsPageUrl(meeting, options.manifest, jurisdiction, raceNo);

    const raceSummary = meeting.races?.find((r) => String(r.raceNumber) === raceNo);
    if (!raceSummary || !isTabRaceOfficiallyResulted(raceSummary)) {
      return { status: "not_ready", resultsPageUrl };
    }

    const meetingDate = meeting.meetingDate || options.manifest.date?.trim() || "today";
    const detail = await fetchRaceDetail(
      meetingDate,
      jurisdiction,
      meeting.raceType || "R",
      meeting.venueMnemonic,
      raceNo,
    );
    const parsed = parseTabRaceDetail(detail, raceNo);
    if (!parsed) return { status: "not_ready", resultsPageUrl };
    return { status: "imported", parsed, meetingName: meeting.meetingName, resultsPageUrl };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
