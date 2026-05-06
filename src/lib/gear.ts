import type { GearState } from "./types";

export type GearTileCode = keyof GearState;

export function applyGearTileSelection(current: GearState, tile: GearTileCode, location: number): GearState {
  const cur = current[tile];
  if (cur === location) {
    const next = { ...current };
    delete next[tile];
    return next;
  }

  if (tile === "INJ") {
    return { ...current, INJ: location };
  }

  const next: GearState = {};
  if (current.INJ !== undefined) next.INJ = current.INJ;
  next[tile] = location;
  return next;
}

/** Migrate legacy stored shapes to `{ FT?, B?, CB?, INJ? }` with location 1–5. */
export function normalizeGearFromStorage(raw: unknown): GearState {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: GearState = {};
  for (const key of ["FT", "B", "CB", "INJ"] as const) {
    const v = o[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      const n = Math.floor(v);
      if (n >= 1 && n <= 5) out[key] = n;
    }
  }
  return out;
}
