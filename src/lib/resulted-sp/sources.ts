import { normalizeRaceNo } from "@/lib/meeting-coordination";
import type { MeetingManifest } from "@/lib/meeting-coordination";
import {
  createResultedSpAttemptId,
  logResultedSpImportAttempt,
  type ResultedSpImportAttemptLog,
} from "@/lib/resulted-sp/diagnostics";
import { fetchResultsHtmlWithMeta } from "@/lib/resulted-sp/fetch";
import {
  isRaceOfficiallyResulted,
  parseFullFieldResultsFromHtml,
  type ParsedFullFieldRace,
} from "@/lib/resulted-sp/parse-full-field";
import { fetchTabRaceResults } from "@/lib/resulted-sp/tab-api";
import {
  buildRacenetResultsUrl,
  buildRacingNswResultsUrl,
  racingNswMeetingMatchesHtml,
  type ResultedSpSource,
} from "@/lib/resulted-sp/urls";

export type ImportRaceFromSourcesResult =
  | { imported: true; parsed: ParsedFullFieldRace; source: ResultedSpSource; resultsUrl?: string }
  | { imported: false; notReady: boolean; lastError?: string; resultsUrl?: string };

function logHtmlAttempt(
  base: Pick<ResultedSpImportAttemptLog, "meetingId" | "raceNo" | "source" | "resolvedUrl">,
  meta: { httpStatus: number; responseLength: number; redirectsFollowed: string[] },
  outcome: ResultedSpImportAttemptLog["outcome"],
  details: Partial<ResultedSpImportAttemptLog>,
): void {
  logResultedSpImportAttempt({
    attemptId: createResultedSpAttemptId(),
    timestamp: new Date().toISOString(),
    meetingId: base.meetingId,
    raceNo: base.raceNo,
    source: base.source,
    resolvedUrl: base.resolvedUrl,
    httpStatus: meta.httpStatus,
    redirectsFollowed: meta.redirectsFollowed,
    responseLength: meta.responseLength,
    outcome,
    ...details,
  });
}

export async function importRaceFromSources(options: {
  manifest: MeetingManifest;
  raceNo: string;
  meetingId?: string;
}): Promise<ImportRaceFromSourcesResult> {
  const raceNo = normalizeRaceNo(options.raceNo);
  const meetingId = options.meetingId?.trim() || options.manifest.meetingId?.trim() || "";
  let lastError = "";
  let sawNotReady = false;
  let lastResultsUrl = "";

  const tryHtmlSource = async (
    source: Exclude<ResultedSpSource, "tab">,
    url: string,
  ): Promise<ParsedFullFieldRace | null> => {
    if (!url) return null;
    lastResultsUrl = url;
    try {
      const { html, meta } = await fetchResultsHtmlWithMeta(url);
      const meetingMatched =
        source !== "racingnsw" || racingNswMeetingMatchesHtml(html, options.manifest);
      const parsedRaces = meetingMatched ? parseFullFieldResultsFromHtml(html, raceNo) : [];
      const parsed = parsedRaces.find((race) => normalizeRaceNo(race.raceNo) === raceNo);
      const raceMatched = Boolean(parsed);
      const runnersParsed = parsed?.runners.length ?? 0;
      const spValuesParsed = parsed?.runners.filter((runner) => runner.sp > 0).length ?? 0;

      if (parsed && isRaceOfficiallyResulted(parsed)) {
        logHtmlAttempt(
          { meetingId, raceNo, source, resolvedUrl: meta.resolvedUrl },
          meta,
          "imported",
          { meetingMatched, raceMatched, runnersParsed, spValuesParsed, detail: `${source} HTML parser` },
        );
        return parsed;
      }

      sawNotReady = true;
      logHtmlAttempt(
        { meetingId, raceNo, source, resolvedUrl: meta.resolvedUrl },
        meta,
        "not_ready",
        {
          meetingMatched,
          raceMatched,
          runnersParsed,
          spValuesParsed,
          parseFailure: !meetingMatched
            ? "meeting date or normalized track name did not match"
            : !parsed
              ? "race table not published yet"
              : "fewer than 1st, 2nd and 3rd confirmed with SP",
        },
      );
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logHtmlAttempt(
        { meetingId, raceNo, source, resolvedUrl: url },
        { httpStatus: 0, responseLength: 0, redirectsFollowed: [] },
        "error",
        { parseFailure: lastError },
      );
    }
    return null;
  };

  // Racing NSW is the primary source for the NSW meeting library.
  const racingNswUrl = buildRacingNswResultsUrl(options.manifest);
  const racingNswParsed = await tryHtmlSource("racingnsw", racingNswUrl);
  if (racingNswParsed) {
    return { imported: true, parsed: racingNswParsed, source: "racingnsw", resultsUrl: racingNswUrl };
  }

  const tabResult = await fetchTabRaceResults({
    manifest: options.manifest,
    raceNo,
    meetingId,
  });

  if (tabResult.status === "imported") {
    return {
      imported: true,
      parsed: tabResult.parsed,
      source: "tab",
      resultsUrl: tabResult.resultsPageUrl,
    };
  }
  if (tabResult.status === "not_ready") sawNotReady = true;
  if (tabResult.status === "error") lastError = tabResult.message;
  if (tabResult.status === "meeting_not_found") lastError = "TAB meeting not found.";
  if ("resultsPageUrl" in tabResult && tabResult.resultsPageUrl) {
    lastResultsUrl = tabResult.resultsPageUrl;
  }

  const racenetUrl = buildRacenetResultsUrl(options.manifest);
  const racenetParsed = await tryHtmlSource("racenet", racenetUrl);
  if (racenetParsed) {
    return { imported: true, parsed: racenetParsed, source: "racenet", resultsUrl: racenetUrl };
  }

  return {
    imported: false,
    notReady: sawNotReady,
    lastError: lastError || undefined,
    resultsUrl: lastResultsUrl || undefined,
  };
}
