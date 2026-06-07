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
  document.getElementById("ios12-startup-failure")?.remove();

  document.querySelectorAll("[data-ios12-overlay-candidate]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.id === "raw-ipad-test-button") return;
    if (node.id === "ios12-startup-failure") {
      node.remove();
    }
  });
}

/** iOS 12 Yard: remove blocking overlays + visual overlay debug only (no pointer-events / touch-action CSS). */
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
