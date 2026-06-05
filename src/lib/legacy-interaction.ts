import { ios12SafeClick, yardControlClick } from "@/lib/ios12-safe-interaction";
import { isOldIOS } from "@/lib/legacy-safari";

export type LegacyClickProps = {
  onClick: () => void;
  onTouchStart?: undefined;
  onPointerDown?: undefined;
  onTouchEnd?: undefined;
};

/** @deprecated Use yardControlClick */
export function legacyClickProps(onClick: () => void): LegacyClickProps {
  if (isOldIOS()) return ios12SafeClick(onClick);
  return { onClick };
}

export { yardControlClick, ios12SafeClick };
