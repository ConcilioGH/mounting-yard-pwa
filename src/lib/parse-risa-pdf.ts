/** Types and helpers for RISA (Racing NSW / Racing Australia) acceptances PDF parsing. */

export type RisaPdfRunnerRow = {
  race_no: string;
  race_name: string;
  start_time: string;
  distance: string;
  track: string;
  grade: string;
  going: string;
  rail: string;
  no: string;
  horse: string;
  barrier: string;
  trainer: string;
  jockey: string;
  weight: string;
  probable_weight: string;
  hcp_rating: string;
  odds: string;
  scratched: string;
  emergency: string;
  source: "risa";
};

export type ParseWarning = {
  race_no: string;
  runner_no: string;
  horse: string;
  warning_type: string;
  detail: string;
};

/** Detect RISA acceptances PDF from extracted text. */
export function detectRisaPdfText(text: string): boolean {
  const upper = text.toUpperCase();
  if (!upper.includes("ACCEPTANCES")) return false;
  if (upper.includes("RACING NSW") || upper.includes("RACING AUSTRALIA")) return true;
  if (upper.includes("NSW RACES")) return true;
  return /Race\s+\d+\s+-\s+\d{1,2}:\d{2}[AP]M\s+.+\(\d+\s*METRES\)/i.test(text);
}

/** Normalize horse names for race_no + horse speedproxy matching. */
export function normalizeHorseNameForMatch(horse: string): string {
  return String(horse ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

export function horseMatchKey(raceNo: string, horse: string): string {
  const race = String(raceNo ?? "").trim();
  const name = normalizeHorseNameForMatch(horse);
  return `${race}::${name}`;
}

export function collectFieldParseWarnings(
  rows: Array<Record<string, string>>,
): ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const horsesByRace = new Map<string, Map<string, string[]>>();

  for (const row of rows) {
    const raceNo = String(row.race_no ?? "").trim();
    const runnerNo = String(row.no ?? "").trim();
    const horse = String(row.horse ?? "").trim();
    if (!raceNo || !horse) continue;

    if (!horsesByRace.has(raceNo)) horsesByRace.set(raceNo, new Map());
    const raceHorses = horsesByRace.get(raceNo)!;
    const key = normalizeHorseNameForMatch(horse);
    if (!raceHorses.has(key)) raceHorses.set(key, []);
    raceHorses.get(key)!.push(runnerNo);

    if (!String(row.barrier ?? "").trim()) {
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNo,
        horse,
        warning_type: "missing_barrier",
        detail: "Barrier is empty",
      });
    }
    if (!String(row.jockey ?? "").trim()) {
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNo,
        horse,
        warning_type: "missing_jockey",
        detail: "Jockey is empty",
      });
    }
    if (!String(row.trainer ?? "").trim()) {
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNo,
        horse,
        warning_type: "missing_trainer",
        detail: "Trainer is empty",
      });
    }
    if (String(row.scratched ?? "").toLowerCase() === "true") {
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNo,
        horse,
        warning_type: "scratched_runner",
        detail: "Runner marked scratched",
      });
    }
    if (String(row.emergency ?? "").toLowerCase() === "true") {
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNo,
        horse,
        warning_type: "emergency_runner",
        detail: "Emergency acceptor",
      });
    }
  }

  for (const [raceNo, horseMap] of horsesByRace) {
    for (const [horseKey, runnerNos] of horseMap) {
      if (runnerNos.length <= 1) continue;
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNos.join("/"),
        horse: horseKey,
        warning_type: "duplicate_horse_name",
        detail: `Duplicate horse in race ${raceNo}: runner_no ${runnerNos.join(", ")}`,
      });
    }
  }

  return warnings;
}
