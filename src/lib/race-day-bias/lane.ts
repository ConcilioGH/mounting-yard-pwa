import type { LaneGroup } from "@/lib/race-day-bias/types";

/** Strip non-digits; allow uncommon multi-digit codes (32, 42, etc.). */
export function sanitizePositionCodeInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 3);
}

/** Classify a numeric finishing-position code into a lane group. */
export function classifyPositionCode(raw: string): LaneGroup | null {
  const digits = sanitizePositionCodeInput(raw);
  if (!digits) return null;

  if (digits.length >= 2) {
    const lead = digits[0]!;
    if (lead === "3") return "threeWide";
    if (lead >= "4") return "fourWidePlus";
    if (digits === "10" || digits === "12") return "runningLine";
    if (digits === "11") return "rail";
    return null;
  }

  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1) return null;
  if (n % 2 === 1) return "rail";
  return "runningLine";
}

export const LANE_GROUP_LABELS: Record<LaneGroup, string> = {
  rail: "Rail",
  runningLine: "Running Line",
  threeWide: "3 Wide",
  fourWidePlus: "4 Wide+",
};
