/** Decimal SP input (e.g. 1.5, 3.2, 12, 101). */
export function sanitizeSpInput(raw: string): string {
  let cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot >= 0) {
    cleaned = `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, "")}`;
  }
  return cleaned.slice(0, 8);
}

export function parseSp(value: string): number | null {
  const trimmed = sanitizeSpInput(value);
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Implied win probability from decimal SP. */
export function impliedProbabilityFromSp(sp: number): number {
  return 1 / sp;
}
