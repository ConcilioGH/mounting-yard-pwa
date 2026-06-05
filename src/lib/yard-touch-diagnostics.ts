import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";
import { isOldIOS } from "@/lib/legacy-safari";

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

export type AssessmentPressProps = {
  "data-assessment-control": string;
  onClick: (event: ReactMouseEvent) => void;
  onTouchStart?: (event: ReactTouchEvent) => void;
  onTouchEnd?: (event: ReactTouchEvent) => void;
  onPointerDown?: (event: React.PointerEvent) => void;
};

/**
 * iOS 12: click-only (no touch handlers, no preventDefault).
 * Modern Safari: touch guard to avoid double-toggle.
 */
export function createAssessmentPressProps(
  label: string,
  onPress: () => void,
  lastTouchTimeRef: LastTouchTimeRef,
): AssessmentPressProps {
  if (isOldIOS()) {
    return {
      "data-assessment-control": label,
      onClick: () => {
        logAssessmentControlTap(label);
        onPress();
      },
      onTouchStart: undefined,
      onTouchEnd: undefined,
      onPointerDown: undefined,
    };
  }

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
