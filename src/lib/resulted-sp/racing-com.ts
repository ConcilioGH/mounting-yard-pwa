import { sanitizeMeetingSlug } from "@/lib/meeting-export";
import type { MeetingManifest } from "@/lib/meeting-coordination";
import { parseDecimalSp } from "@/lib/results-sp-parser";
import { isRaceOfficiallyResulted, type ParsedFullFieldRace } from "@/lib/resulted-sp/parse-full-field";

type RacingComEntry = {
  horseName?: string;
  scratched?: boolean;
  finish?: number | null;
  finishAbv?: string | null;
  startingPrice?: string | number | null;
  margin?: string | null;
};

export type RacingComRaceResult =
  | { status: "imported"; parsed: ParsedFullFieldRace }
  | { status: "not_ready" }
  | { status: "error"; message: string };

export function parseRacingComRace(raceNo: string, entries: RacingComEntry[]): ParsedFullFieldRace | null {
  const runners = entries.flatMap((entry) => {
    const horseName = String(entry.horseName ?? "").trim();
    if (!horseName || entry.scratched) return [];
    const finishPosition = Number(entry.finish);
    const sp = parseDecimalSp(String(entry.startingPrice ?? ""));
    if (!Number.isFinite(finishPosition) || finishPosition < 1 || sp == null) return [];
    return [{
      finishPosition,
      horseName,
      sp,
      margin: String(entry.margin ?? "").trim(),
      resultStatus: "resulted",
    }];
  });
  const parsed: ParsedFullFieldRace = { raceNo, runners };
  return isRaceOfficiallyResulted(parsed) ? parsed : null;
}

export async function fetchRacingComRaceResults(
  manifest: Pick<MeetingManifest, "trackName" | "trackSlug" | "date">,
  raceNo: string,
): Promise<RacingComRaceResult> {
  const track = sanitizeMeetingSlug(manifest.trackSlug || manifest.trackName || "");
  const params = new URLSearchParams({ track, date: manifest.date, raceNo });
  try {
    const response = await fetch(`/api/fetch-racing-com-results?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { status: "error", message: body?.error || `Racing.com failed (${response.status}).` };

    const parsed = parseRacingComRace(raceNo, body?.race?.formRaceEntries ?? []);
    return parsed ? { status: "imported", parsed } : { status: "not_ready" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
}
