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
import { fallbackHtmlSources, type ResultedSpSource } from "@/lib/resulted-sp/urls";

export type ImportRaceFromSourcesResult =
  | { imported: true; parsed: ParsedFullFieldRace; source: ResultedSpSource; tabResultsUrl?: string }
  | { imported: false; notReady: boolean; lastError?: string; tabResultsUrl?: string };

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
      tabResultsUrl: tabResult.resultsPageUrl,
    };
  }
  if (tabResult.status === "not_ready") {
    return { imported: false, notReady: true, tabResultsUrl: tabResult.resultsPageUrl };
  }

  const tabFailed = tabResult.status === "error" || tabResult.status === "meeting_not_found";
  if (!tabFailed) {
    return { imported: false, notReady: true };
  }

  let lastError = tabResult.status === "error" ? tabResult.message : "TAB meeting not found.";

  for (const fallback of fallbackHtmlSources(options.manifest)) {
    try {
      const { html, meta } = await fetchResultsHtmlWithMeta(fallback.url);
      const parsedRaces = parseFullFieldResultsFromHtml(html, raceNo);
      const parsed = parsedRaces.find((r) => normalizeRaceNo(r.raceNo) === raceNo);
      const meetingMatched = parsedRaces.length > 0;
      const raceMatched = Boolean(parsed);
      const runnersParsed = parsed?.runners.length ?? 0;
      const spValuesParsed = parsed?.runners.filter((r) => r.sp > 0).length ?? 0;

      if (parsed && isRaceOfficiallyResulted(parsed)) {
        logHtmlAttempt(
          { meetingId, raceNo, source: fallback.source, resolvedUrl: meta.resolvedUrl },
          meta,
          "imported",
          {
            meetingMatched,
            raceMatched,
            runnersParsed,
            spValuesParsed,
            detail: `${fallback.source} HTML parser`,
          },
        );
        return { imported: true, parsed, source: fallback.source };
      }

      logHtmlAttempt(
        { meetingId, raceNo, source: fallback.source, resolvedUrl: meta.resolvedUrl },
        meta,
        "not_ready",
        {
          meetingMatched,
          raceMatched,
          runnersParsed,
          spValuesParsed,
          parseFailure: !parsed
            ? "parseFullFieldResultsFromHtml: race table not found in HTML"
            : !isRaceOfficiallyResulted(parsed)
              ? "parseFullFieldResultsFromHtml: fewer than 3 placed runners with SP"
              : "unknown parse failure",
        },
      );
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logHtmlAttempt(
        { meetingId, raceNo, source: fallback.source, resolvedUrl: fallback.url },
        { httpStatus: 0, responseLength: 0, redirectsFollowed: [] },
        "error",
        { parseFailure: lastError },
      );
    }
  }

  return { imported: false, notReady: false, lastError };
}
