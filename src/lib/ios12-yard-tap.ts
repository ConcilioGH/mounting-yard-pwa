import type { CSSProperties } from "react";

/** Inline tap styles for iOS 12 Safari — avoids transform/active-scale hit-test bugs. */
export const IOS12_TAP_BUTTON_STYLE: CSSProperties = {
  cursor: "pointer",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "rgba(0,0,0,0)",
};

declare global {
  interface Window {
    __tapDebugCount?: number;
  }
}

export function installIOS12DocTapListener(onCount: (count: number) => void): () => void {
  window.__tapDebugCount = 0;
  const handler = () => {
    window.__tapDebugCount = (window.__tapDebugCount ?? 0) + 1;
    onCount(window.__tapDebugCount);
  };
  document.addEventListener("click", handler, true);
  return () => document.removeEventListener("click", handler, true);
}
