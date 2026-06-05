import Papa from "papaparse";
import { computeRaceDayBiasAnalytics } from "@/lib/race-day-bias/analytics";
import { biasHeatTier, tracksideTagForTier } from "@/lib/race-day-bias/composite";
import { decodeBiasPositionCode, laneGroupFromDecoded } from "@/lib/race-day-bias/position";
import { LANE_GROUP_LABELS } from "@/lib/race-day-bias/lane";
import type { PositionField, RaceDayBiasState } from "@/lib/race-day-bias/types";

const FINISHER_SLOTS: Array<{ field: PositionField; position: 1 | 2 | 3 | 4 }> = [
  { field: "first", position: 1 },
  { field: "second", position: 2 },
  { field: "third", position: 3 },
  { field: "fourth", position: 4 },
];

function sharePercentOneDecimal(fraction: number): number {
  return Math.round(fraction * 1000) / 10;
}

export function formatRaceNoForExport(raceNo: string): string {
  const trimmed = String(raceNo ?? "").trim();
  if (/^R\d+/i.test(trimmed)) {
    return `R${trimmed.replace(/^R/i, "")}`;
  }
  return trimmed ? `R${trimmed}` : "";
}

/** Long-format bias rows (one row per entered finisher slot). */
export function buildBiasDetailCsv(state: RaceDayBiasState): string {
  const meeting = state.meetingLabel.trim();
  const rows: Array<Record<string, string | number>> = [];

  for (const race of state.races) {
    const raceNo = formatRaceNoForExport(race.raceNo);
    for (const { field, position } of FINISHER_SLOTS) {
      const slot = race[field];
      if (!slot.positionCode.trim() && !slot.sp.trim()) continue;
      const decoded = decodeBiasPositionCode(slot.positionCode);
      const laneGroup = decoded ? LANE_GROUP_LABELS[laneGroupFromDecoded(decoded)] : "";
      rows.push({
        meeting,
        race_no: raceNo,
        finisher_position: position,
        position_code: slot.positionCode,
        sp: slot.sp,
        lane_group: laneGroup,
      });
    }
  }

  return Papa.unparse(rows, {
    columns: ["meeting", "race_no", "finisher_position", "position_code", "sp", "lane_group"],
  });
}

/** SP-adjusted lane, positional, composite matrix, and bias conclusion for export. */
export function buildBiasSummaryCsv(
  state: RaceDayBiasState,
  fieldSizeByRaceNo: Record<string, number> = {},
): string {
  const meeting = state.meetingLabel.trim();
  const analytics = computeRaceDayBiasAnalytics(state.races, fieldSizeByRaceNo);

  const laneRows = analytics.spAdjusted.groups.map((group) => ({
    meeting,
    category: "lane",
    group: group.label,
    wins: group.rawWins,
    places: group.rawPlaces,
    avg_sp: group.avgSp != null ? group.avgSp.toFixed(2) : "",
    actual_share: sharePercentOneDecimal(group.actualShare),
    expected_share: sharePercentOneDecimal(group.expectedShare),
    bias_score: sharePercentOneDecimal(group.biasScore),
    finisher_count: group.finisherCount,
    heat_tier: "",
    trackside_tag: "",
    interpretation: "",
  }));

  const positionalRows = analytics.positional.groups.map((group) => ({
    meeting,
    category: "position",
    group: group.label,
    wins: group.rawWins,
    places: group.rawPlaces,
    avg_sp: group.avgSp != null ? group.avgSp.toFixed(2) : "",
    actual_share: sharePercentOneDecimal(group.actualShare),
    expected_share: sharePercentOneDecimal(group.expectedShare),
    bias_score: sharePercentOneDecimal(group.biasScore),
    finisher_count: group.finisherCount,
    heat_tier: "",
    trackside_tag: "",
    interpretation: "",
  }));

  const compositeRows = analytics.composite.cells.map((cell) => ({
    meeting,
    category: "composite",
    group: cell.label,
    wins: "",
    places: "",
    avg_sp: "",
    actual_share: sharePercentOneDecimal(cell.actualShare),
    expected_share: sharePercentOneDecimal(cell.expectedShare),
    bias_score: sharePercentOneDecimal(cell.biasScore),
    finisher_count: cell.finisherCount,
    heat_tier: biasHeatTier(cell.biasScore, cell.finisherCount),
    trackside_tag: "",
    interpretation: "",
  }));

  const { conclusion } = analytics;
  const conclusionRows: Array<Record<string, string | number>> = [];

  if (conclusion.sufficientSample && conclusion.primary) {
    conclusionRows.push({
      meeting,
      category: "conclusion",
      group: conclusion.primary.shortLabel,
      wins: "",
      places: "",
      avg_sp: "",
      actual_share: "",
      expected_share: "",
      bias_score: conclusion.primary.biasScorePp,
      finisher_count: conclusion.primary.finisherCount,
      heat_tier: conclusion.primary.heatTier,
      trackside_tag: conclusion.primary.tracksideTag,
      interpretation: conclusion.interpretationLines[0] ?? "",
    });
    if (conclusion.secondary) {
      conclusionRows.push({
        meeting,
        category: "conclusion",
        group: conclusion.secondary.shortLabel,
        wins: "",
        places: "",
        avg_sp: "",
        actual_share: "",
        expected_share: "",
        bias_score: conclusion.secondary.biasScorePp,
        finisher_count: conclusion.secondary.finisherCount,
        heat_tier: conclusion.secondary.heatTier,
        trackside_tag: conclusion.secondary.tracksideTag,
        interpretation: conclusion.interpretationLines[1] ?? "",
      });
    }
    if (conclusion.negative && conclusion.negative.biasScorePp < 0) {
      conclusionRows.push({
        meeting,
        category: "conclusion",
        group: conclusion.negative.shortLabel,
        wins: "",
        places: "",
        avg_sp: "",
        actual_share: "",
        expected_share: "",
        bias_score: conclusion.negative.biasScorePp,
        finisher_count: conclusion.negative.finisherCount,
        heat_tier: conclusion.negative.heatTier,
        trackside_tag: tracksideTagForTier(conclusion.negative.heatTier, "negative"),
        interpretation:
          conclusion.interpretationLines[conclusion.interpretationLines.length - 1] ?? "",
      });
    }
  } else {
    conclusionRows.push({
      meeting,
      category: "conclusion",
      group: "insufficient_sample",
      wins: "",
      places: "",
      avg_sp: "",
      actual_share: "",
      expected_share: "",
      bias_score: "",
      finisher_count: conclusion.racesWithSpSample,
      heat_tier: "",
      trackside_tag: "",
      interpretation: conclusion.interpretationLines[0] ?? "Insufficient sample size.",
    });
  }

  return Papa.unparse(
    [...laneRows, ...positionalRows, ...compositeRows, ...conclusionRows],
    {
      columns: [
        "meeting",
        "category",
        "group",
        "wins",
        "places",
        "avg_sp",
        "actual_share",
        "expected_share",
        "bias_score",
        "finisher_count",
        "heat_tier",
        "trackside_tag",
        "interpretation",
      ],
    },
  );
}
