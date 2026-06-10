"use client";

import "@/lib/ios12-polyfills";
import { useEffect, type ReactNode } from "react";
import { enableIOS12CompatMode } from "@/lib/ios12-compat-mode";
import { removeBlockingOverlays } from "@/lib/ios12-overlay-fix";
import { isOldIOS, shouldSkipServiceWorker } from "@/lib/legacy-safari";
import { logMountedBlockingOverlays, removeLegacyStartupOverlays } from "@/lib/yard-touch-diagnostics";
import {
  logStartupStep,
  reportStartupFailure,
  traceAsync,
} from "@/lib/startup-diagnostics";

export function StartupDiagnosticsRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    removeLegacyStartupOverlays();
    removeBlockingOverlays();
    document.body.setAttribute("data-app-ready", "true");
    logStartupStep("app-mounted");
    logMountedBlockingOverlays();

    if (isOldIOS()) {
      void enableIOS12CompatMode();
    }

    if (shouldSkipServiceWorker()) {
      logStartupStep("service-worker-registration:skipped", { reason: "legacy-safari" });
      return;
    }

    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      logStartupStep("service-worker-registration:skipped", { reason: "unsupported" });
      return;
    }

    logStartupStep("service-worker-registration:start");
    void traceAsync("service-worker-registration", async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return {
        registered: Boolean(registration),
        scope: registration?.scope ?? null,
        active: Boolean(registration?.active),
        waiting: Boolean(registration?.waiting),
        installing: Boolean(registration?.installing),
      };
    }).catch((error) => {
      reportStartupFailure("service-worker-registration", error);
    });
  }, []);

  return <>{children}</>;
}
