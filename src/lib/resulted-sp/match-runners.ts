import { normalizeHorseNameForMatch } from "@/lib/parse-risa-pdf";
import { normalizeRaceNo } from "@/lib/meeting-coordination";
import type { Race } from "@/lib/types";
import type { ParsedFullFieldRace } from "@/lib/resulted-sp/parse-full-field";
import type { ResultedSpRunner } from "@/lib/resulted-sp/types";

export function matchRunnerNoForHorse(race: Race | undefined, horseName: string): string {
  if (!race) return "";
  const key = normalizeHorseNameForMatch(horseName);
  if (!key) return "";
  const runner = race.runners.find((r) => normalizeHorseNameForMatch(r.horse) === key);
  return runner ? String(runner.no) : "";
}

export function toResultedSpRunners(
  parsed: ParsedFullFieldRace,
  race: Race | undefined,
  source: string,
  importedAt: string,
): ResultedSpRunner[] {
  const raceNo = normalizeRaceNo(parsed.raceNo);
  return parsed.runners.map((row) => ({
    raceNo,
    runnerNo: matchRunnerNoForHorse(race, row.horseName),
    horse: row.horseName,
    officialSP: row.resultStatus === "scratched" || row.sp <= 0 ? "" : String(row.sp),
    finishPosition: row.finishPosition > 0 ? row.finishPosition : "",
    margin: row.margin,
    resultStatus: row.resultStatus,
    importedAt,
    source,
  }));
}
