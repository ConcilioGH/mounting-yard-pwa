import { normalizeRaceNo } from "@/lib/meeting-coordination";
import type { ParsedRaceResults } from "@/lib/results-sp-parser";
import { sanitizeSpInput } from "@/lib/race-day-bias/sp";
import type { PositionField, RaceBiasEntry } from "@/lib/race-day-bias/types";

const FIELD_BY_FINISH: Record<1 | 2 | 3 | 4, PositionField> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
};

export type ApplyResultsSpReport = {
  parserUsed: string;
  racesFound: number;
  spPopulated: number;
  unmatchedRaces: string[];
  missingSps: string[];
};

export type ApplyResultsSpOptions = {
  /** When false, skip slots that already have an SP. Default true. */
  overwriteExistingSp?: boolean;
  parserUsed?: string;
};

/**
 * Match parsed results to bias grid rows by race_no + finishing_position.
 * Updates SP only — never modifies positionCode.
 */
export function applyResultsSpToBiasEntries(
  results: ParsedRaceResults[],
  biasEntries: RaceBiasEntry[],
  options?: ApplyResultsSpOptions,
): { entries: RaceBiasEntry[]; report: ApplyResultsSpReport } {
  const overwriteExistingSp = options?.overwriteExistingSp ?? true;
  const parserUsed = options?.parserUsed ?? "unknown";
  const biasRaceNos = new Set(biasEntries.map((r) => normalizeRaceNo(r.raceNo)));
  const resultRaceNos = new Set(results.map((r) => normalizeRaceNo(r.raceNo)));
  const resultsByRace = new Map(results.map((r) => [normalizeRaceNo(r.raceNo), r] as const));

  const unmatchedRaces = [...resultRaceNos].filter((raceNo) => !biasRaceNos.has(raceNo)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  const entries = biasEntries.map((race) => ({
    ...race,
    first: { ...race.first },
    second: { ...race.second },
    third: { ...race.third },
    fourth: { ...race.fourth },
  }));

  const byRaceNo = new Map(entries.map((r) => [normalizeRaceNo(r.raceNo), r] as const));
  let spPopulated = 0;

  for (const parsedRace of results) {
    const raceNo = normalizeRaceNo(parsedRace.raceNo);
    const entry = byRaceNo.get(raceNo);
    if (!entry) continue;

    for (const pos of [1, 2, 3, 4] as const) {
      const parsed = parsedRace.results.find((r) => r.finishPosition === pos);
      const field = FIELD_BY_FINISH[pos];
      const slot = entry[field];
      if (!parsed) continue;
      if (!overwriteExistingSp && slot.sp.trim()) continue;

      entry[field] = {
        ...slot,
        sp: sanitizeSpInput(String(parsed.sp)),
      };
      spPopulated += 1;
    }
  }

  const missingSps: string[] = [];
  for (const entry of entries) {
    const raceNo = normalizeRaceNo(entry.raceNo);
    const parsed = resultsByRace.get(raceNo);
    if (!parsed) continue;
    for (const pos of [1, 2, 3, 4] as const) {
      const field = FIELD_BY_FINISH[pos];
      const hasParsed = parsed.results.some((r) => r.finishPosition === pos);
      if (!hasParsed || !entry[field].sp.trim()) {
        missingSps.push(`R${raceNo}-${pos}`);
      }
    }
  }

  return {
    entries,
    report: {
      parserUsed,
      racesFound: results.length,
      spPopulated,
      unmatchedRaces,
      missingSps,
    },
  };
}
