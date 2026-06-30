import { normalizeRaceNo } from "@/lib/meeting-coordination";
import type { MeetingManifest } from "@/lib/meeting-coordination";
import { fetchResultsHtml } from "@/lib/resulted-sp/fetch";
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

export async function importRaceFromSources(options: {
  manifest: MeetingManifest;
  raceNo: string;
}): Promise<ImportRaceFromSourcesResult> {
  const raceNo = normalizeRaceNo(options.raceNo);

  const tabResult = await fetchTabRaceResults({
    manifest: options.manifest,
    raceNo,
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

  const tabFailed =
    tabResult.status === "error" || tabResult.status === "meeting_not_found";
  if (!tabFailed) {
    return { imported: false, notReady: true };
  }

  let lastError = tabResult.status === "error" ? tabResult.message : "TAB meeting not found.";

  for (const fallback of fallbackHtmlSources(options.manifest)) {
    try {
      const html = await fetchResultsHtml(fallback.url);
      const parsedRaces = parseFullFieldResultsFromHtml(html, raceNo);
      const parsed = parsedRaces.find((r) => normalizeRaceNo(r.raceNo) === raceNo);
      if (parsed && isRaceOfficiallyResulted(parsed)) {
        return { imported: true, parsed, source: fallback.source };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return { imported: false, notReady: false, lastError };
}
