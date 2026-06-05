import { LANE_GROUP_LABELS } from "@/lib/race-day-bias/lane";
import { impliedProbabilityFromSp, parseSp } from "@/lib/race-day-bias/sp";
import {
  classifyPositionGroup,
  decodeBiasPositionCode,
  laneGroupFromDecoded,
} from "@/lib/race-day-bias/position";
import type { LaneGroup, PositionField, PositionGroup, RaceBiasEntry } from "@/lib/race-day-bias/types";

export type CompositeDepth = "front" | "mid" | "back";

export type CompositeBucketKey = `${LaneGroup}_${CompositeDepth}`;

export const COMPOSITE_DEPTH_ORDER: CompositeDepth[] = ["front", "mid", "back"];

export const COMPOSITE_LANE_ORDER: LaneGroup[] = [
  "rail",
  "runningLine",
  "threeWide",
  "fourWidePlus",
];

export const COMPOSITE_DEPTH_LABELS: Record<CompositeDepth, string> = {
  front: "Front",
  mid: "Mid",
  back: "Back",
};

export const COMPOSITE_DEPTH_LABELS_LONG: Record<CompositeDepth, string> = {
  front: "Front",
  mid: "Midfield",
  back: "Back",
};

const LANE_SHORT: Record<LaneGroup, string> = {
  rail: "RAIL",
  runningLine: "RUNNING LINE",
  threeWide: "3 WIDE",
  fourWidePlus: "4 WIDE+",
};

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

export const MIN_RACES_FOR_CONCLUSION = 3;
export const MIN_FINISHERS_PER_COMPOSITE = 3;

type SpAccumulator = {
  weightedActual: number;
  impliedProb: number;
  finisherCount: number;
};

export type CompositeMatrixCell = {
  key: CompositeBucketKey;
  lane: LaneGroup;
  depth: CompositeDepth;
  label: string;
  shortLabel: string;
  biasScore: number;
  biasScorePp: number;
  finisherCount: number;
  actualShare: number;
  expectedShare: number;
};

export type BiasHeatTier =
  | "strongPositive"
  | "positive"
  | "neutral"
  | "negative"
  | "strongNegative"
  | "insufficient";

export type BiasConclusionPick = {
  key: CompositeBucketKey;
  label: string;
  shortLabel: string;
  biasScorePp: number;
  finisherCount: number;
  heatTier: BiasHeatTier;
  tracksideTag: string;
};

export type BiasConclusion = {
  sufficientSample: boolean;
  racesWithSpSample: number;
  primary: BiasConclusionPick | null;
  secondary: BiasConclusionPick | null;
  negative: BiasConclusionPick | null;
  interpretationLines: string[];
  tracksideCards: Array<{ title: string; tag: string; heatTier: BiasHeatTier }>;
};

export type CompositeMatrixResult = {
  cells: CompositeMatrixCell[];
  matrix: CompositeMatrixCell[][];
  conclusion: BiasConclusion;
  racesWithSpSample: number;
  hasSpData: boolean;
  racesWithFieldSize: number;
};

function emptyAcc(): SpAccumulator {
  return { weightedActual: 0, impliedProb: 0, finisherCount: 0 };
}

function compositeKey(lane: LaneGroup, depth: CompositeDepth): CompositeBucketKey {
  return `${lane}_${depth}`;
}

export function compositeDepthFromPositionGroup(group: PositionGroup): CompositeDepth {
  switch (group) {
    case "leaderFrontPair":
    case "onPace":
    case "wideForward":
      return "front";
    case "midfield":
    case "wideMidfield":
      return "mid";
    default:
      return "back";
  }
}

export function compositeBucketLabel(lane: LaneGroup, depth: CompositeDepth): string {
  return `${LANE_GROUP_LABELS[lane]} ${COMPOSITE_DEPTH_LABELS_LONG[depth]}`;
}

export function compositeBucketShortLabel(lane: LaneGroup, depth: CompositeDepth): string {
  return `${LANE_SHORT[lane]} ${COMPOSITE_DEPTH_LABELS_LONG[depth].toUpperCase()}`;
}

function biasScorePp(fraction: number): number {
  return Math.round(fraction * 1000) / 10;
}

/** Heat-map tier from bias score (fraction). Thresholds in percentage points. */
export function biasHeatTier(biasScore: number, finisherCount: number): BiasHeatTier {
  if (finisherCount < MIN_FINISHERS_PER_COMPOSITE) return "insufficient";
  const pp = biasScorePp(biasScore);
  if (pp >= 15) return "strongPositive";
  if (pp >= 8) return "positive";
  if (pp > -8) return "neutral";
  if (pp > -15) return "negative";
  return "strongNegative";
}

export function tracksideTagForTier(tier: BiasHeatTier, role: "positive" | "negative"): string {
  if (tier === "insufficient") return "—";
  if (role === "negative") {
    if (tier === "strongNegative" || tier === "negative") return "AVOID";
    return "NEUTRAL";
  }
  switch (tier) {
    case "strongPositive":
      return "STRONG POSITIVE";
    case "positive":
      return "POSITIVE";
    case "neutral":
      return "NEUTRAL";
    case "negative":
      return "CAUTION";
    case "strongNegative":
      return "AVOID";
    default:
      return "—";
  }
}

export function formatMatrixBiasPp(biasScore: number): string {
  const pp = biasScorePp(biasScore);
  if (pp === 0) return "0";
  return pp > 0 ? `+${pp}` : `${pp}`;
}

function interpretationLine(
  lane: LaneGroup,
  depth: CompositeDepth,
  role: "primary" | "secondary" | "negative",
  pp: number,
): string {
  const strong = Math.abs(pp) >= 12;

  if (lane === "rail" && depth === "front") {
    if (role === "negative") {
      return "Leaders on the rail are underperforming market expectation.";
    }
    if (role === "secondary" && !strong) {
      return "Leaders on the rail are performing slightly above expectation.";
    }
    return "Leaders on the rail are outperforming market expectation.";
  }

  if (lane === "runningLine" && depth === "mid") {
    if (role === "negative") {
      return "Horses settling one-off the fence in midfield are underperforming expectation.";
    }
    return "Horses settling one-off the fence in midfield positions are outperforming market expectation.";
  }

  if (lane === "runningLine" && depth === "front") {
    if (role === "negative") {
      return "Horses on the running line near the lead are underperforming expectation.";
    }
  }

  if (lane === "threeWide" && depth === "front") {
    if (role === "negative") {
      return "Horses working three-wide without cover are underperforming expectation.";
    }
    return "Three-wide forward runners are outperforming market expectation.";
  }

  if (lane === "threeWide") {
    if (role === "negative") {
      return `Horses racing three-wide in ${depth === "mid" ? "midfield" : "backmarker"} positions are underperforming expectation.`;
    }
  }

  if (lane === "fourWidePlus") {
    const wide = "Four-wide or wider runners";
    if (role === "negative") {
      return `${wide} in ${COMPOSITE_DEPTH_LABELS_LONG[depth].toLowerCase()} positions are underperforming expectation.`;
    }
    return `${wide} in ${COMPOSITE_DEPTH_LABELS_LONG[depth].toLowerCase()} positions are outperforming expectation.`;
  }

  const lanePhrase: Record<LaneGroup, string> = {
    rail: "On the rail",
    runningLine: "Horses on the running line",
    threeWide: "Three-wide runners",
    fourWidePlus: "Wide runners (4+)",
  };

  const depthPhrase: Record<CompositeDepth, string> = {
    front: "in forward positions",
    mid: "in midfield positions",
    back: "from backmarker positions",
  };

  const verb =
    role === "negative"
      ? "underperforming"
      : role === "secondary" && !strong
        ? "performing slightly above"
        : "outperforming";

  return `${lanePhrase[lane]} ${depthPhrase[depth]} are ${verb} market expectation.`;
}

function buildConclusion(
  cells: CompositeMatrixCell[],
  racesWithSpSample: number,
  hasSpData: boolean,
  racesWithFieldSize: number,
): BiasConclusion {
  const insufficient: BiasConclusion = {
    sufficientSample: false,
    racesWithSpSample,
    primary: null,
    secondary: null,
    negative: null,
    interpretationLines: [],
    tracksideCards: [],
  };

  if (racesWithFieldSize === 0) {
    return {
      ...insufficient,
      interpretationLines: [
        "Import meeting CSV in Mounting Yard so field size is available for composite analysis.",
      ],
    };
  }

  if (!hasSpData) {
    return {
      ...insufficient,
      interpretationLines: ["Enter SP for finishers to generate a bias conclusion."],
    };
  }

  if (racesWithSpSample < MIN_RACES_FOR_CONCLUSION) {
    return {
      ...insufficient,
      interpretationLines: ["Insufficient sample size."],
    };
  }

  const qualified = cells.filter((c) => c.finisherCount >= MIN_FINISHERS_PER_COMPOSITE);

  if (qualified.length === 0) {
    return {
      ...insufficient,
      interpretationLines: ["Insufficient sample size."],
    };
  }

  const byScoreDesc = [...qualified].sort((a, b) => b.biasScore - a.biasScore);
  const byScoreAsc = [...qualified].sort((a, b) => a.biasScore - b.biasScore);

  const primaryCell = byScoreDesc[0]!;
  const negativeCell = byScoreAsc[0]!;

  const secondaryCell =
    byScoreDesc.find(
      (c) =>
        c.key !== primaryCell.key &&
        c.biasScore > 0 &&
        c.finisherCount >= MIN_FINISHERS_PER_COMPOSITE,
    ) ?? byScoreDesc[1] ?? null;

  const toPick = (cell: CompositeMatrixCell, role: "positive" | "negative"): BiasConclusionPick => {
    const tier = biasHeatTier(cell.biasScore, cell.finisherCount);
    return {
      key: cell.key,
      label: cell.label,
      shortLabel: cell.shortLabel,
      biasScorePp: cell.biasScorePp,
      finisherCount: cell.finisherCount,
      heatTier: tier,
      tracksideTag: tracksideTagForTier(tier, role),
    };
  };

  const primary = toPick(primaryCell, "positive");
  const secondary =
    secondaryCell && secondaryCell.key !== primaryCell.key
      ? toPick(secondaryCell, "positive")
      : null;
  const negative = toPick(negativeCell, "negative");

  const interpretationLines: string[] = [
    interpretationLine(primaryCell.lane, primaryCell.depth, "primary", primary.biasScorePp),
  ];

  if (secondary && secondary.key !== primary.key) {
    interpretationLines.push(
      interpretationLine(
        secondaryCell!.lane,
        secondaryCell!.depth,
        "secondary",
        secondary.biasScorePp,
      ),
    );
  }

  if (negative.key !== primary.key || negative.biasScorePp < 0) {
    interpretationLines.push(
      interpretationLine(negativeCell.lane, negativeCell.depth, "negative", negative.biasScorePp),
    );
  }

  const tracksideCards: BiasConclusion["tracksideCards"] = [
    { title: primary.shortLabel, tag: primary.tracksideTag, heatTier: primary.heatTier },
  ];

  if (negative.biasScorePp < -5 && negative.key !== primary.key) {
    tracksideCards.push({
      title: negative.shortLabel,
      tag: negative.tracksideTag,
      heatTier: negative.heatTier,
    });
  }

  return {
    sufficientSample: true,
    racesWithSpSample,
    primary,
    secondary: secondary && secondary.key !== primary.key ? secondary : null,
    negative,
    interpretationLines,
    tracksideCards,
  };
}

export function computeCompositeMatrix(
  races: RaceBiasEntry[],
  fieldSizeByRaceNo: Record<string, number>,
): CompositeMatrixResult {
  const acc = Object.fromEntries(
    COMPOSITE_LANE_ORDER.flatMap((lane) =>
      COMPOSITE_DEPTH_ORDER.map((depth) => [compositeKey(lane, depth), emptyAcc()]),
    ),
  ) as Record<CompositeBucketKey, SpAccumulator>;

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

      const lane = laneGroupFromDecoded(decoded);
      const depth = compositeDepthFromPositionGroup(positionGroup);
      const key = compositeKey(lane, depth);

      const sp = parseSp(slot.sp);
      if (sp == null) continue;

      hasSpData = true;
      raceHasSpFinisher = true;
      const bucket = acc[key];
      bucket.finisherCount += 1;
      bucket.weightedActual += FINISH_WEIGHT[finish];
      bucket.impliedProb += impliedProbabilityFromSp(sp);
    }

    if (raceHasSpFinisher) racesWithSpSample += 1;
  }

  const totalWeightedActual = Object.values(acc).reduce((s, b) => s + b.weightedActual, 0);
  const totalImpliedProb = Object.values(acc).reduce((s, b) => s + b.impliedProb, 0);

  const cells: CompositeMatrixCell[] = [];

  for (const lane of COMPOSITE_LANE_ORDER) {
    for (const depth of COMPOSITE_DEPTH_ORDER) {
      const key = compositeKey(lane, depth);
      const bucket = acc[key];
      const actualShare =
        totalWeightedActual > 0 ? bucket.weightedActual / totalWeightedActual : 0;
      const expectedShare = totalImpliedProb > 0 ? bucket.impliedProb / totalImpliedProb : 0;
      const biasScore = actualShare - expectedShare;

      cells.push({
        key,
        lane,
        depth,
        label: compositeBucketLabel(lane, depth),
        shortLabel: compositeBucketShortLabel(lane, depth),
        biasScore,
        biasScorePp: biasScorePp(biasScore),
        finisherCount: bucket.finisherCount,
        actualShare,
        expectedShare,
      });
    }
  }

  const matrix = COMPOSITE_LANE_ORDER.map((lane) =>
    COMPOSITE_DEPTH_ORDER.map((depth) => cells.find((c) => c.lane === lane && c.depth === depth)!),
  );

  const conclusion = buildConclusion(cells, racesWithSpSample, hasSpData, racesWithFieldSize);

  return {
    cells,
    matrix,
    conclusion,
    racesWithSpSample,
    hasSpData,
    racesWithFieldSize,
  };
}

export const HEAT_CELL_CLASS: Record<BiasHeatTier, string> = {
  strongPositive: "bg-emerald-700 text-white",
  positive: "bg-emerald-600/50 text-emerald-50",
  neutral: "bg-slate-700/80 text-slate-200",
  negative: "bg-red-600/45 text-red-50",
  strongNegative: "bg-red-800 text-white",
  insufficient: "bg-slate-800/60 text-slate-500",
};
