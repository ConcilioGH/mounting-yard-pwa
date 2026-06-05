import { isOldIOS } from "@/lib/legacy-safari";

/** True when Yard must use click-only handlers (iOS 12 Safari). */
export function isIOS12SafeInteractionMode(): boolean {
  return isOldIOS();
}

/** iOS 12: onClick only — never attach touch/pointer handlers. */
export function ios12SafeClick(onClick: () => void): { onClick: () => void } {
  return { onClick };
}

/** Yard controls: click-only on iOS 12, plain onClick elsewhere. */
export function yardControlClick(onClick: () => void): { onClick: () => void } {
  if (isOldIOS()) return ios12SafeClick(onClick);
  return { onClick };
}
