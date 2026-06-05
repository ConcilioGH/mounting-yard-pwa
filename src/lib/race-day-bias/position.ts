import type { LaneGroup, PositionGroup } from "@/lib/race-day-bias/types";
import { LANE_GROUP_LABELS, sanitizePositionCodeInput } from "@/lib/race-day-bias/lane";

export type DecodedBiasPosition = {
  laneGroup: (typeof LANE_GROUP_LABELS)[LaneGroup];
  orderIndex: number;
  widthIndex: number;
};

export type { PositionGroup };

export const POSITION_GROUP_ORDER: PositionGroup[] = [
  "leaderFrontPair",
  "onPace",
  "midfield",
  "backmarker",
  "wideForward",
  "wideMidfield",
  "wideBack",
];

export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  leaderFrontPair: "Leader / Front Pair",
  onPace: "On Pace",
  midfield: "Midfield",
  backmarker: "Backmarker",
  wideForward: "Wide Forward",
  wideMidfield: "Wide Midfield",
  wideBack: "Wide Back",
};

const LANE_LABEL_TO_GROUP: Record<(typeof LANE_GROUP_LABELS)[LaneGroup], LaneGroup> = {
  Rail: "rail",
  "Running Line": "runningLine",
  "3 Wide": "threeWide",
  "4 Wide+": "fourWidePlus",
};

function laneLabel(group: LaneGroup): DecodedBiasPosition["laneGroup"] {
  return LANE_GROUP_LABELS[group];
}

/** Map last digit of wider codes to running-order depth (pair index). */
function orderIndexFromWideLastDigit(lastDigit: number): number {
  if (lastDigit <= 0) return 1;
  return Math.ceil(lastDigit / 2);
}

function orderIndexFromRailCode(n: number): number {
  return (n + 1) / 2;
}

function orderIndexFromRunningLineCode(n: number): number {
  return n / 2;
}

/**
 * Decode a finishing position code into lane width, running-order depth, and lane group.
 * Centralized mapping — adjust orderIndexFromWideLastDigit here when tuning wider codes.
 */
export function decodeBiasPositionCode(code: string | number): DecodedBiasPosition | null {
  const digits = sanitizePositionCodeInput(String(code ?? ""));
  if (!digits) return null;

  if (digits.length >= 2) {
    const lead = digits[0]!;
    const lastDigit = Number(digits[digits.length - 1]!);

    if (digits === "10" || digits === "12") {
      const n = Number(digits);
      return {
        laneGroup: laneLabel("runningLine"),
        orderIndex: orderIndexFromRunningLineCode(n),
        widthIndex: 2,
      };
    }
    if (digits === "11") {
      return {
        laneGroup: laneLabel("rail"),
        orderIndex: orderIndexFromRailCode(11),
        widthIndex: 1,
      };
    }

    if (lead === "3") {
      return {
        laneGroup: laneLabel("threeWide"),
        orderIndex: orderIndexFromWideLastDigit(lastDigit),
        widthIndex: 3,
      };
    }
    if (lead >= "4") {
      const widthIndex = Math.max(4, Number(lead));
      return {
        laneGroup: laneLabel("fourWidePlus"),
        orderIndex: orderIndexFromWideLastDigit(lastDigit),
        widthIndex,
      };
    }

    return null;
  }

  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1) return null;

  if (n % 2 === 1) {
    return {
      laneGroup: laneLabel("rail"),
      orderIndex: orderIndexFromRailCode(n),
      widthIndex: 1,
    };
  }

  return {
    laneGroup: laneLabel("runningLine"),
    orderIndex: orderIndexFromRunningLineCode(n),
    widthIndex: 2,
  };
}

/** Classify decoded position relative to field size (mutually exclusive groups). */
export function classifyPositionGroup(
  decoded: DecodedBiasPosition,
  fieldSize: number,
): PositionGroup | null {
  if (!Number.isFinite(fieldSize) || fieldSize < 1) return null;

  const denominator = Math.max(1, Math.ceil(fieldSize / 2));
  const fieldFraction = decoded.orderIndex / denominator;

  if (decoded.widthIndex >= 3) {
    if (fieldFraction <= 0.35) return "wideForward";
    if (fieldFraction <= 0.7) return "wideMidfield";
    return "wideBack";
  }

  if (decoded.orderIndex <= 1) return "leaderFrontPair";
  if (fieldFraction <= 0.35) return "onPace";
  if (fieldFraction <= 0.7) return "midfield";
  return "backmarker";
}

/** Resolve lane group key from a decoded position (for lane analytics). */
export function laneGroupFromDecoded(decoded: DecodedBiasPosition): LaneGroup {
  return LANE_LABEL_TO_GROUP[decoded.laneGroup];
}
