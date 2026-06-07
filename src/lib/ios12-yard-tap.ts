import type { CSSProperties } from "react";

/** iOS 12 Yard interactive elements — pointer hit-test + tap CSS. */
export const IOS12_TAP_BUTTON_STYLE: CSSProperties = {
  position: "relative",
  zIndex: 20,
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

const DEBUG_IDS = {
  touchStart: "yard-debug-touchstart",
  touchEnd: "yard-debug-touchend",
  click: "yard-debug-click",
  tag: "yard-debug-tag",
  className: "yard-debug-class",
  text: "yard-debug-text",
} as const;

function syncDiagnosticsDom(stats: YardDocumentTouchDiagnostics): void {
  const set = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set(DEBUG_IDS.touchStart, String(stats.touchStart));
  set(DEBUG_IDS.touchEnd, String(stats.touchEnd));
  set(DEBUG_IDS.click, String(stats.click));
  set(DEBUG_IDS.tag, stats.lastTargetTag);
  set(DEBUG_IDS.className, stats.lastTargetClassName);
  set(DEBUG_IDS.text, stats.lastTargetText);
}

function describeEventTarget(event: Event, stats: YardDocumentTouchDiagnostics): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const el = target as HTMLElement;
  stats.lastTargetTag = el.tagName || "—";
  stats.lastTargetClassName =
    typeof el.className === "string" && el.className ? el.className.slice(0, 80) : "—";
  stats.lastTargetText = (el.textContent ?? "").trim().slice(0, 30) || "—";
}

/** Document/window capture listeners — counters bypass React handlers. */
export function installYardDocumentTouchDiagnostics(
  onUpdate: (stats: YardDocumentTouchDiagnostics) => void,
): () => void {
  const stats: YardDocumentTouchDiagnostics = { ...EMPTY_DIAGNOSTICS };

  const emit = () => {
    syncDiagnosticsDom(stats);
    onUpdate({ ...stats });
  };

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

  const options: AddEventListenerOptions = { capture: true, passive: true };

  document.addEventListener("touchstart", onTouchStart, options);
  document.addEventListener("touchend", onTouchEnd, options);
  document.addEventListener("click", onClick, options);

  return () => {
    document.removeEventListener("touchstart", onTouchStart, options);
    document.removeEventListener("touchend", onTouchEnd, options);
    document.removeEventListener("click", onClick, options);
  };
}

export { DEBUG_IDS as YARD_DEBUG_IDS };
