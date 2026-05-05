import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function makeKey(raceId: string, runnerNo: number) {
  return `${raceId}-${runnerNo}`;
}

export function nextPositive(v: number | undefined) {
  return (v ?? 0) >= 3 ? 0 : (v ?? 0) + 1;
}

export function nextNegative(v: number | undefined) {
  return (v ?? 0) <= -3 ? 0 : (v ?? 0) - 1;
}

export function marks(v: number | undefined) {
  if (!v) return "";
  if (v > 0) return "✓".repeat(v);
  return "−".repeat(Math.abs(v));
}

export function emptyAssessment(): import("./types").Assessment {
  return {
    positive: {},
    negative: {},
    gear: {},
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}
