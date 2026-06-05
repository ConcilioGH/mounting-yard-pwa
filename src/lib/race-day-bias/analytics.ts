import { LANE_GROUP_LABELS } from "@/lib/race-day-bias/lane";
import {
  classifyPositionGroup,
  decodeBiasPositionCode,
  laneGroupFromDecoded,
  POSITION_GROUP_LABELS,
  POSITION_GROUP_ORDER,
} from "@/lib/race-day-bias/position";
import { computeCompositeMatrix } from "@/lib/race-day-bias/composite";
import { impliedProbabilityFromSp, parseSp } from "@/lib/race-day-bias/sp";
import type {
  LaneGroup,
  LaneGroupSpStats,
  PositionField,
  PositionGroup,
  PositionGroupSpStats,
  RaceBiasEntry,
  RaceDayBiasAnalytics,
} from "@/lib/race-day-bias/types";

const LANE_GROUP_ORDER: LaneGroup[] = ["rail", "runningLine", "threeWide", "fourWidePlus"];

const POSITION_SLOTS: Array<{ field: PositionField; finish: 1 | 2 | 3 | 4 }> = [
  { field: "first", finish: 1 },
  { field: "second", finish: 2 },
  { field: "third", finish: 3 },
  { field: "fourth", finish: 4 },
];

const FINISH_WEIGHT: Record<1 | 2 | 3 | 4, number> = {
  1: 1.0,
  2: 0.6,
  3: 0.35,
  4: 0.2,
};

const MIN_RACES_FOR_SP_SIGNAL = 3;
const MIN_FINISHERS_PER_GROUP = 3;
const MIN_BIAS_SCORE_PP = 0.1;

type SpAccumulator = {
  rawWins: number;
  rawPlaces: number;
  spSum: number;
  spCount: number;
  weightedActual: number;
  impliedProb: number;
  finisherCount: number;
};

function emptySpAcc(): SpAccumulator {
  return {
    rawWins: 0,
    rawPlaces: 0,
    spSum: 0,
    spCount: 0,
    weightedActual: 0,
    impliedProb: 0,
    finisherCount: 0,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function sharePct(fraction: number): number {
  return Math.round(fraction * 1000) / 10;
}

function buildSpGroupStats<G extends string>(
  order: G[],
  acc: Record<G, SpAccumulator>,
  labels: Record<G, string>,
): Array<{
  group: G;
  label: string;
  rawWins: number;
  rawPlaces: number;
  avgSp: number | null;
  actualShare: number;
  expectedShare: number;
  biasScore: number;
  finisherCount: number;
}> {
  const totalWeightedActual = order.reduce((sum, g) => sum + acc[g].weightedActual, 0);
  const totalImpliedProb = order.reduce((sum, g) => sum + acc[g].impliedProb, 0);

  return order.map((group) => {
    const bucket = acc[group];
    const actualShare =
      totalWeightedActual > 0 ? bucket.weightedActual / totalWeightedActual : 0;
    const expectedShare = totalImpliedProb > 0 ? bucket.impliedProb / totalImpliedProb : 0;
    const biasScore = actualShare - expectedShare;
    const avgSp = bucket.spCount > 0 ? round3(bucket.spSum / bucket.spCount) : null;
    return {
      group,
      label: labels[group],
      rawWins: bucket.rawWins,
      rawPlaces: bucket.rawPlaces,
      avgSp,
      actualShare,
      expectedShare,
      biasScore,
      finisherCount: bucket.finisherCount,
    };
  });
}

function computeSpSummary(races: RaceBiasEntry[]): RaceDayBiasAnalytics["spAdjusted"] {
  const acc: Record<LaneGroup, SpAccumulator> = {
    rail: emptySpAcc(),
    runningLine: emptySpAcc(),
    threeWide: emptySpAcc(),
    fourWidePlus: emptySpAcc(),
  };

  let hasSpData = false;
  let racesWithSpSample = 0;

  for (const race of races) {
    let raceHasSpFinisher = false;

    for (const { field, finish } of POSITION_SLOTS) {
      const slot = race[field];
      const decoded = decodeBiasPositionCode(slot.positionCode);
      if (!decoded) continue;
      const group = laneGroupFromDecoded(decoded);

      if (finish === 1) acc[group].rawWins += 1;
      else acc[group].rawPlaces += 1;

      const sp = parseSp(slot.sp);
      if (sp == null) continue;

      hasSpData = true;
      raceHasSpFinisher = true;
      const weight = FINISH_WEIGHT[finish];
      const bucket = acc[group];
      bucket.finisherCount += 1;
      bucket.weightedActual += weight;
      bucket.impliedProb += impliedProbabilityFromSp(sp);
      bucket.spSum += sp;
      bucket.spCount += 1;
    }

    if (raceHasSpFinisher) racesWithSpSample += 1;
  }

  const groups = buildSpGroupStats(LANE_GROUP_ORDER, acc, LANE_GROUP_LABELS) as LaneGroupSpStats[];

  return {
    groups,
    signal: deriveSpBiasSignal(groups, hasSpData, racesWithSpSample),
    hasSpData,
    racesWithSpSample,
  };
}

function computePositionalSummary(
  races: RaceBiasEntry[],
  fieldSizeByRaceNo: Record<string, number>,
): RaceDayBiasAnalytics["positional"] {
  const acc = Object.fromEntries(
    POSITION_GROUP_ORDER.map((group) => [group, emptySpAcc()]),
  ) as Record<PositionGroup, SpAccumulator>;

  let hasSpData = false;
  let racesWithSpSample = 0;
  let racesWithFieldSize = 0;

  for (const race of races) {
    const fieldSize = fieldSizeByRaceNo[race.raceNo];
    if (!fieldSize || fieldSize < 1) continue;
    racesWithFieldSize += 1;

    let raceHasSpFinisher = false;

    for (const { field, finish } of POSITION_SLOTS) {
      const slot = race[field];
      const decoded = decodeBiasPositionCode(slot.positionCode);
      if (!decoded) continue;

      const positionGroup = classifyPositionGroup(decoded, fieldSize);
      if (!positionGroup) continue;

      if (finish === 1) acc[positionGroup].rawWins += 1;
      else acc[positionGroup].rawPlaces += 1;

      const sp = parseSp(slot.sp);
      if (sp == null) continue;

      hasSpData = true;
      raceHasSpFinisher = true;
      const weight = FINISH_WEIGHT[finish];
      const bucket = acc[positionGroup];
      bucket.finisherCount += 1;
      bucket.weightedActual += weight;
      bucket.impliedProb += impliedProbabilityFromSp(sp);
      bucket.spSum += sp;
      bucket.spCount += 1;
    }

    if (raceHasSpFinisher) racesWithSpSample += 1;
  }

  const groups = buildSpGroupStats(
    POSITION_GROUP_ORDER,
    acc,
    POSITION_GROUP_LABELS,
  ) as PositionGroupSpStats[];

  return {
    groups,
    signal: derivePositionalBiasSignal(
      groups,
      hasSpData,
      racesWithSpSample,
      racesWithFieldSize,
    ),
    hasSpData,
    racesWithSpSample,
    racesWithFieldSize,
  };
}

export function computeRaceDayBiasAnalytics(
  races: RaceBiasEntry[],
  fieldSizeByRaceNo: Record<string, number> = {},
): RaceDayBiasAnalytics {
  const composite = computeCompositeMatrix(races, fieldSizeByRaceNo);
  return {
    spAdjusted: computeSpSummary(races),
    positional: computePositionalSummary(races, fieldSizeByRaceNo),
    composite,
    conclusion: composite.conclusion,
  };
}

function deriveSpBiasSignal(
  spGroups: LaneGroupSpStats[],
  hasSpData: boolean,
  racesWithSpSample: number,
): string {
  if (!hasSpData) {
    return "Enter SP for finishers to calculate weighted share bias.";
  }

  if (racesWithSpSample < MIN_RACES_FOR_SP_SIGNAL) {
    return `Neutral — enter at least ${MIN_RACES_FOR_SP_SIGNAL} races with code + SP to assess bias.`;
  }

  const qualified = spGroups.filter(
    (g) => g.finisherCount >= MIN_FINISHERS_PER_GROUP && g.biasScore >= MIN_BIAS_SCORE_PP,
  );

  if (qualified.length === 0) {
    return "Neutral — no lane has meaningful positive bias (+10 pp vs market share).";
  }

  const best = [...qualified].sort((a, b) => b.biasScore - a.biasScore)[0]!;
  const pp = sharePct(best.biasScore);

  if (best.group === "rail") {
    return `INSIDE BIAS — Rail +${pp} pp vs market share (${best.finisherCount} top-4 finishers).`;
  }
  if (best.group === "runningLine") {
    return `RUNNING LINE BIAS — Running Line +${pp} pp vs market share (${best.finisherCount} top-4 finishers).`;
  }
  if (best.group === "threeWide" || best.group === "fourWidePlus") {
    return `OFF-RAIL / WIDE BIAS — ${best.label} +${pp} pp vs market share (${best.finisherCount} top-4 finishers).`;
  }

  return "Neutral — no clear SP-adjusted lane edge.";
}

const WIDE_POSITION_GROUPS = new Set<PositionGroup>([
  "wideForward",
  "wideMidfield",
  "wideBack",
]);

function derivePositionalBiasSignal(
  groups: PositionGroupSpStats[],
  hasSpData: boolean,
  racesWithSpSample: number,
  racesWithFieldSize: number,
): string {
  if (racesWithFieldSize === 0) {
    return "Import meeting CSV in Mounting Yard so field size is available for positional analysis.";
  }

  if (!hasSpData) {
    return "Enter SP for finishers to calculate positional weighted share bias.";
  }

  if (racesWithSpSample < MIN_RACES_FOR_SP_SIGNAL) {
    return `Neutral — enter at least ${MIN_RACES_FOR_SP_SIGNAL} races with code + SP to assess positional bias.`;
  }

  const qualified = groups.filter(
    (g) => g.finisherCount >= MIN_FINISHERS_PER_GROUP && g.biasScore >= MIN_BIAS_SCORE_PP,
  );

  if (qualified.length === 0) {
    return "Neutral — no position group has meaningful positive bias (+10 pp vs market share).";
  }

  const best = [...qualified].sort((a, b) => b.biasScore - a.biasScore)[0]!;
  const pp = sharePct(best.biasScore);

  if (best.group === "leaderFrontPair") {
    return `POSSIBLE FRONT-END BIAS — ${best.label} +${pp} pp vs market share (${best.finisherCount} top-4 finishers).`;
  }
  if (best.group === "onPace") {
    return `POSSIBLE ON-PACE BIAS — ${best.label} +${pp} pp vs market share (${best.finisherCount} top-4 finishers).`;
  }
  if (best.group === "midfield") {
    return `POSSIBLE MIDFIELD FLOW — ${best.label} +${pp} pp vs market share (${best.finisherCount} top-4 finishers).`;
  }
  if (best.group === "backmarker") {
    return `POSSIBLE BACKMARKER / SWOOPER BIAS — ${best.label} +${pp} pp vs market share (${best.finisherCount} top-4 finishers).`;
  }
  if (WIDE_POSITION_GROUPS.has(best.group)) {
    return `POSSIBLE WIDE-LANE ADVANTAGE — ${best.label} +${pp} pp vs market share (${best.finisherCount} top-4 finishers).`;
  }

  return "Neutral — no clear SP-adjusted positional edge.";
}

/** Format a 0–1 share as a percentage string. */
export function formatSharePercent(fraction: number): string {
  return `${sharePct(fraction)}%`;
}

/** Format bias score (share difference) as signed percentage points. */
export function formatBiasPercentPoints(fraction: number): string {
  const pp = sharePct(fraction);
  return fraction > 0 ? `+${pp}%` : `${pp}%`;
}
