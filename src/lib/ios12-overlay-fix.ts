import { isIOS12 } from "@/lib/legacy-safari";

export const IOS12_OVERLAY_FIX_STYLE_ID = "yard-ios12-overlay-fix";

/** Remove known startup blockers that intercept iPad touches. */
export function removeBlockingOverlays(): void {
  document.getElementById("ios12-startup-failure")?.remove();
  document.querySelectorAll("[data-blocking-overlay]").forEach((node) => node.remove());
}

function isLargeLayer(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return rect.width >= vw * 0.85 && rect.height >= vh * 0.5;
}

function markOverlayCandidates(): void {
  document.querySelectorAll("body *").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const style = window.getComputedStyle(node);
    if (style.position !== "fixed" && style.position !== "absolute") return;
    if (!isLargeLayer(node)) return;
    node.setAttribute("data-ios12-overlay-candidate", "true");
  });
}

function neutralizeNonEssentialOverlays(): void {
  const selectors = [
    "#ios12-startup-failure",
    "[data-overlay]",
    "[data-startup-overlay]",
    ".loading-overlay",
    ".compatibility-overlay",
    ".startup-overlay",
    ".modal-backdrop",
    ".fixed-debug-layer",
  ];
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.style.pointerEvents = "none";
    });
  });

  document.querySelectorAll("[data-ios12-overlay-candidate]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.hasAttribute("data-yard-root")) return;
    if (node.id === "raw-ipad-test-button") return;
    if (node.id === "ios12-startup-failure") {
      node.remove();
      return;
    }
    if (node.matches("button, a, input, textarea, select, [role='button']")) return;
    if (node.closest("[data-yard-root] button, [data-yard-root] .yard-interactive")) return;
    node.style.pointerEvents = "none";
  });
}

/** iOS 12 Yard: unblock touches, highlight overlay candidates, enable interactive controls. */
export function installIOS12OverlayFix(): () => void {
  if (!isIOS12()) return () => undefined;

  removeBlockingOverlays();
  markOverlayCandidates();
  neutralizeNonEssentialOverlays();

  if (document.getElementById(IOS12_OVERLAY_FIX_STYLE_ID)) {
    const interval = window.setInterval(() => {
      removeBlockingOverlays();
      markOverlayCandidates();
      neutralizeNonEssentialOverlays();
    }, 1000);
    return () => window.clearInterval(interval);
  }

  const style = document.createElement("style");
  style.id = IOS12_OVERLAY_FIX_STYLE_ID;
  style.textContent = `
    html, body, #__next, main {
      pointer-events: auto !important;
    }
    [data-overlay],
    .loading-overlay,
    .compatibility-overlay,
    .startup-overlay,
    .modal-backdrop,
    .fixed-debug-layer,
    #ios12-startup-failure,
    [data-startup-overlay="true"] {
      pointer-events: none !important;
    }
    [data-overlay] button,
    [data-overlay] a,
    [data-overlay] input,
    #ios12-startup-failure button,
    #ios12-startup-failure a {
      pointer-events: auto !important;
    }
    [data-yard-root] button,
    [data-yard-root] [role="button"],
    [data-yard-root] .yard-interactive {
      pointer-events: auto !important;
      position: relative !important;
      z-index: 20 !important;
      touch-action: manipulation !important;
    }
    [data-yard-countdown],
    [data-yard-bottom-nav] {
      pointer-events: none !important;
    }
    [data-yard-bottom-nav] button {
      pointer-events: auto !important;
      position: relative !important;
      z-index: 20 !important;
    }
    input[type="file"].yard-hidden-file-input {
      pointer-events: none !important;
    }
    html[data-ios12-overlay-debug] [data-ios12-overlay-candidate] {
      outline: 3px solid rgba(255, 0, 0, 0.45) !important;
      outline-offset: -2px;
    }
  `;
  document.head.appendChild(style);
  document.documentElement.setAttribute("data-ios12-overlay-debug", "true");

  const interval = window.setInterval(() => {
    removeBlockingOverlays();
    markOverlayCandidates();
    neutralizeNonEssentialOverlays();
  }, 1000);

  return () => {
    window.clearInterval(interval);
    style.remove();
    document.documentElement.removeAttribute("data-ios12-overlay-debug");
  };
}
