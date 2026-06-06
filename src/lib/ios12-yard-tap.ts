import type { CSSProperties } from "react";

/** iOS 12 Yard interactive elements — pointer hit-test + tap CSS. */
export const IOS12_TAP_BUTTON_STYLE: CSSProperties = {
  position: "relative",
  zIndex: 10,
  pointerEvents: "auto",
  touchAction: "manipulation",
  cursor: "pointer",
  WebkitTapHighlightColor: "rgba(0,0,0,0)",
};

export type YardDocumentTouchDiagnostics = {
  touchStart: number;
  touchEnd: number;
  click: number;
  lastTargetTag: string;
  lastTargetClassName: string;
  lastTargetText: string;
};

const EMPTY_DIAGNOSTICS: YardDocumentTouchDiagnostics = {
  touchStart: 0,
  touchEnd: 0,
  click: 0,
  lastTargetTag: "—",
  lastTargetClassName: "—",
  lastTargetText: "—",
};

function describeEventTarget(event: Event, stats: YardDocumentTouchDiagnostics): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const el = target as HTMLElement;
  stats.lastTargetTag = el.tagName || "—";
  stats.lastTargetClassName =
    typeof el.className === "string" && el.className ? el.className.slice(0, 80) : "—";
  stats.lastTargetText = (el.textContent ?? "").trim().slice(0, 30) || "—";
}

/** Document capture listeners — counters do not use React event handlers. */
export function installYardDocumentTouchDiagnostics(
  onUpdate: (stats: YardDocumentTouchDiagnostics) => void,
): () => void {
  const stats: YardDocumentTouchDiagnostics = { ...EMPTY_DIAGNOSTICS };

  const emit = () => onUpdate({ ...stats });

  const onTouchStart = (event: Event) => {
    stats.touchStart += 1;
    describeEventTarget(event, stats);
    emit();
  };

  const onTouchEnd = (event: Event) => {
    stats.touchEnd += 1;
    describeEventTarget(event, stats);
    emit();
  };

  const onClick = (event: Event) => {
    stats.click += 1;
    describeEventTarget(event, stats);
    emit();
  };

  document.addEventListener("touchstart", onTouchStart, true);
  document.addEventListener("touchend", onTouchEnd, true);
  document.addEventListener("click", onClick, true);

  return () => {
    document.removeEventListener("touchstart", onTouchStart, true);
    document.removeEventListener("touchend", onTouchEnd, true);
    document.removeEventListener("click", onClick, true);
  };
}

export const YARD_IOS12_INTERACTIVE_STYLE_ID = "yard-ios12-interactive-fix";

export function installYardIOS12InteractiveCss(): () => void {
  if (document.getElementById(YARD_IOS12_INTERACTIVE_STYLE_ID)) {
    return () => undefined;
  }
  const style = document.createElement("style");
  style.id = YARD_IOS12_INTERACTIVE_STYLE_ID;
  style.textContent = `
    [data-yard-root] button,
    [data-yard-root] [role="tab"] {
      position: relative !important;
      z-index: 10 !important;
      pointer-events: auto !important;
      touch-action: manipulation !important;
    }
  `;
  document.head.appendChild(style);
  return () => style.remove();
}
