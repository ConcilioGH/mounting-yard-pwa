import Papa from "papaparse";
import type { ResultedSpMeetingState } from "@/lib/resulted-sp/types";

export function buildResultedSpCsv(state: ResultedSpMeetingState): string {
  const rows: Array<Record<string, string | number>> = [];
  const raceNos = Object.keys(state.races).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const raceNo of raceNos) {
    const race = state.races[raceNo];
    if (!race) continue;
    for (const runner of race.runners) {
      rows.push({
        race_no: runner.raceNo,
        runner_no: runner.runnerNo,
        horse: runner.horse,
        official_sp: runner.officialSP,
        finish_position: runner.finishPosition === "" ? "" : runner.finishPosition,
        margin: runner.margin,
        result_status: runner.resultStatus,
        imported_at: runner.importedAt,
        source: runner.source,
      });
    }
  }

  return Papa.unparse(rows, {
    columns: [
      "race_no",
      "runner_no",
      "horse",
      "official_sp",
      "finish_position",
      "margin",
      "result_status",
      "imported_at",
      "source",
    ],
  });
}
