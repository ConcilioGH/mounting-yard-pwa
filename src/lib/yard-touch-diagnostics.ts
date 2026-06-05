import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";

export function describeTouchTarget(node: Element | null): Record<string, string | undefined> | null {
  if (!node) return null;
  const el = node as HTMLElement;
  return {
    tag: el.tagName,
    id: el.id || undefined,
    className: typeof el.className === "string" ? el.className : undefined,
    role: el.getAttribute("role") || undefined,
    dataTest: el.getAttribute("data-assessment-control") || undefined,
  };
}

export function logAssessmentAreaTouch(clientX: number, clientY: number, label = "assessment-area"): void {
  const hit = document.elementFromPoint(clientX, clientY);
  console.log("[Touch] elementFromPoint", {
    label,
    x: clientX,
    y: clientY,
    hit: describeTouchTarget(hit),
  });
}

export function logAssessmentControlTap(label: string, clientX?: number, clientY?: number): void {
  console.log("TAP RECEIVED", label);
  if (clientX != null && clientY != null) {
    logAssessmentAreaTouch(clientX, clientY, label);
  }
}

export function touchPointFromEvent(event: ReactTouchEvent): { x: number; y: number } | null {
  const touch = event.changedTouches[0] ?? event.touches[0];
  if (!touch) return null;
  return { x: touch.clientX, y: touch.clientY };
}

/** Remove bootstrap failure panel if React mounted after the 3s watchdog. */
export function removeLegacyStartupOverlays(): void {
  document.getElementById("ios12-startup-failure")?.remove();
}

export function logMountedBlockingOverlays(): void {
  const suspects = [...document.querySelectorAll("#ios12-startup-failure")];
  if (suspects.length === 0) {
    console.log("[Touch] overlay audit: no blocking startup overlays mounted");
    return;
  }
  console.warn(
    "[Touch] overlay audit: blocking overlays still mounted",
    suspects.map((node) => describeTouchTarget(node)),
  );
}

type LastTouchTimeRef = { current: number };

export const ASSESSMENT_TOUCH_CLICK_GUARD_MS = 700;

/**
 * iOS 12 Safari fires touch then a synthetic click — guard prevents double-toggle.
 * Touch: record time, preventDefault, run once.
 * Click: ignore if within guard window after touch.
 */
export function createAssessmentPressProps(
  label: string,
  onPress: () => void,
  lastTouchTimeRef: LastTouchTimeRef,
): {
  "data-assessment-control": string;
  onTouchStart: (event: ReactTouchEvent) => void;
  onClick: (event: React.MouseEvent) => void;
} {
  return {
    "data-assessment-control": label,
    onTouchStart: (event) => {
      event.preventDefault();
      lastTouchTimeRef.current = Date.now();
      const point = touchPointFromEvent(event);
      logAssessmentControlTap(label, point?.x, point?.y);
      onPress();
    },
    onClick: (event) => {
      if (Date.now() - lastTouchTimeRef.current < ASSESSMENT_TOUCH_CLICK_GUARD_MS) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      logAssessmentControlTap(label);
      onPress();
    },
  };
}
