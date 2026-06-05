import type { PressureLabel, SpeedMapRunner } from "@/lib/speed-map";

const COLS = 11;

/** Raw score at which normalized pressure reaches 1.0 (11-col w_ir scale). */
const PRESSURE_SCORE_FULL_SCALE = 16;

/** Label thresholds on normalized 0–1 pressure (gauge fill uses score / 9). */
const PRESSURE_LOW_MAX = 0.35;
const PRESSURE_MODERATE_MAX = 0.6;
const PRESSURE_HIGH_MAX = 0.82;

function tileIndexFromX(x: number): number {
  const clamped = Math.max(0, Math.min(0.999999, x));
  return Math.min(COLS - 1, Math.floor(clamped * COLS));
}

function labelFromNormalizedPressure(normalized: number): PressureLabel {
  if (normalized < PRESSURE_LOW_MAX) return "Low";
  if (normalized < PRESSURE_MODERATE_MAX) return "Moderate";
  if (normalized < PRESSURE_HIGH_MAX) return "High";
  return "Extreme";
}

export function pressureFromRunnersByWirScale(runners: SpeedMapRunner[]): { score: number; label: PressureLabel } {
  let leaderCount = 0;
  let onPaceCount = 0;
  let partialCount = 0;

  for (const runner of runners) {
    const canUseForPressure = runner.hasSpeedData || runner.manuallyPlaced;
    if (!canUseForPressure) continue;

    const tile = tileIndexFromX(runner.x);
    // Leader pressure: right-most columns (scaled from former 12-col thresholds).
    if (tile >= 9) {
      leaderCount += 1;
      continue;
    }
    if (tile >= 7) {
      onPaceCount += 1;
      continue;
    }
    if (tile >= 5) {
      partialCount += 1;
    }
  }

  const pressureScore = leaderCount * 1.5 + onPaceCount + partialCount * 0.5;
  const normalized = Math.min(1, pressureScore / PRESSURE_SCORE_FULL_SCALE);

  console.log("PRESSURE DEBUG", {
    leaderCount,
    onPaceCount,
    pressureScore,
    normalized,
  });

  const label = labelFromNormalizedPressure(normalized);
  // Keep gauge fill formula (score / 9): map normalized 0–1 onto the same 0–9 display range.
  const score = normalized * 9;

  return { score, label };
}
