import { isIOS12 } from "@/lib/legacy-safari";

/** iOS 12 Yard: never hydrate from localStorage / IndexedDB on startup. */
export function shouldSkipYardStartupLoad(): boolean {
  return isIOS12();
}

/** iOS 12 Yard: in-memory only — do not persist assessments. */
export function shouldSkipYardPersistence(): boolean {
  return isIOS12();
}

/** iOS 12 Yard controls: native button onClick only. */
export function yardIOS12OnClick(onClick: () => void): { onClick: () => void } {
  return { onClick };
}
