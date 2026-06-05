import { isOldIOS } from "@/lib/legacy-safari";

export type LegacyClickProps = {
  onClick: () => void;
  onTouchStart?: undefined;
  onPointerDown?: undefined;
  onTouchEnd?: undefined;
};

/** Old iOS Safari: click-only — no touch/pointer handlers that double-fire. */
export function legacyClickProps(onClick: () => void): LegacyClickProps {
  if (isOldIOS()) {
    return {
      onClick,
      onTouchStart: undefined,
      onPointerDown: undefined,
      onTouchEnd: undefined,
    };
  }
  return { onClick };
}

export function useClickOnlyOnOldIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return isOldIOS();
}
