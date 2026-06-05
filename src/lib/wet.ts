import { WET_BODY_TYPES, WET_FEET } from "./constants";
import type { WetBodyType, WetFeet, WetState } from "./types";

const BODY_VALUES = new Set<string>(WET_BODY_TYPES.map((o) => o.value));
const FEET_VALUES = new Set<string>(WET_FEET.map((o) => o.value));

export function normalizeWetFromStorage(raw: unknown): WetState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const bodyType = typeof o.bodyType === "string" && BODY_VALUES.has(o.bodyType) ? (o.bodyType as WetBodyType) : undefined;
  const feet = typeof o.feet === "string" && FEET_VALUES.has(o.feet) ? (o.feet as WetFeet) : undefined;
  if (!bodyType && !feet) return undefined;
  return { ...(bodyType ? { bodyType } : {}), ...(feet ? { feet } : {}) };
}

export function wetIsSet(wet: WetState | undefined): boolean {
  return Boolean(wet?.bodyType || wet?.feet);
}

export function wetShorthand(wet: WetState | undefined): string | null {
  if (!wet?.bodyType && !wet?.feet) return null;
  const body = WET_BODY_TYPES.find((o) => o.value === wet.bodyType)?.shorthand ?? "?";
  const feet = WET_FEET.find((o) => o.value === wet.feet)?.shorthand ?? "?";
  if (wet.bodyType && wet.feet) return `${body}/${feet}`;
  if (wet.bodyType) return body;
  return feet;
}

export function wetBodyLabel(value: WetBodyType | undefined): string {
  return WET_BODY_TYPES.find((o) => o.value === value)?.label ?? "";
}

export function wetFeetLabel(value: WetFeet | undefined): string {
  return WET_FEET.find((o) => o.value === value)?.label ?? "";
}
