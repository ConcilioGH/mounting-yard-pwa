import { normalizeRaceNo } from "@/lib/meeting-coordination";
import type { Race } from "@/lib/types";

/** Active runner count per race (key = normalized race number, e.g. "3"). */
export function buildRaceFieldSizeMap(races: Race[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const race of races) {
    const raceNo = normalizeRaceNo(race.id);
    if (!raceNo) continue;
    map[raceNo] = race.runners.length;
  }
  return map;
}
