import type { GearState } from "./types";

export type GearTileCode = keyof GearState;

export function applyGearTileSelection(current: GearState, tile: GearTileCode, location: number): GearState {
  if (location < 1 || location > 5) return current;
  const prev = current[tile] ?? [];
  const set = new Set(prev);
  if (set.has(location)) {
    set.delete(location);
  } else {
    set.add(location);
  }
  const nextArr = [...set].sort((a, b) => a - b);
  const next: GearState = { ...current };
  if (nextArr.length === 0) {
    delete next[tile];
  } else {
    next[tile] = nextArr;
  }
  return next;
}

function normalizeGearKeyArray(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const nums = v
    .map((x) => (typeof x === "number" && Number.isFinite(x) ? Math.floor(x) : NaN))
    .filter((n) => n >= 1 && n <= 5);
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  return uniq.length ? uniq : undefined;
}

/** Migrate legacy single-number values and coerce stored JSON to `number[]` per key. */
export function normalizeGearFromStorage(raw: unknown): GearState {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: GearState = {};
  for (const key of ["FT", "B", "CB", "INJ"] as const) {
    const v = o[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      const n = Math.floor(v);
      if (n >= 1 && n <= 5) out[key] = [n];
      continue;
    }
    const arr = normalizeGearKeyArray(v);
    if (arr?.length) out[key] = arr;
  }
  return out;
}
