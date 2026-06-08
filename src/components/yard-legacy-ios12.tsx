"use client";

import Script from "next/script";
import { DEFAULT_RACES } from "@/lib/constants";
import { APP_BUILD_VERSION } from "@/lib/build-version";
import { buildYardLegacyMarkup } from "@/lib/yard-legacy-html";
import { removeBlockingOverlays } from "@/lib/ios12-overlay-fix";
import { removeLegacyStartupOverlays } from "@/lib/yard-touch-diagnostics";

declare global {
  interface Window {
    yardLegacy?: {
      selectRace: (raceNo: string) => void;
      selectRunner: (runnerId: number) => void;
      tapFactor: (factorCode: string) => void;
      nextRunner: () => void;
      prevRunner: () => void;
      init: () => void;
    };
    yardLegacyInit?: () => void;
    yardLegacyState?: Record<string, unknown>;
    YARD_LEGACY_RACES?: typeof DEFAULT_RACES;
  }
}

/** iOS 12 Yard — raw HTML + inline onclick, no React event handlers or interaction state. */
export default function YardLegacyIOS12() {
  const markup = buildYardLegacyMarkup(DEFAULT_RACES);

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: markup }} />
      <Script
        src={`/yard-legacy-ios12.js?v=${APP_BUILD_VERSION}`}
        strategy="afterInteractive"
        onLoad={() => {
          removeLegacyStartupOverlays();
          removeBlockingOverlays();
          window.yardLegacyInit?.();
        }}
      />
    </>
  );
}
