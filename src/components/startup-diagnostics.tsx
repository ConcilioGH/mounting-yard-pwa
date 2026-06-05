"use client";

import "@/lib/ios12-polyfills";
import { useEffect, useState, type ReactNode } from "react";
import { resetLocalDataAndReload } from "@/lib/reset-local-data";
import {
  getStartupFailures,
  logStartupStep,
  reportStartupFailure,
  subscribeStartupFailures,
  traceAsync,
} from "@/lib/startup-diagnostics";

function StartupErrorBanner() {
  const [failures, setFailures] = useState(getStartupFailures);
  const [resetting, setResetting] = useState(false);

  useEffect(() => subscribeStartupFailures(() => setFailures([...getStartupFailures()])), []);

  if (failures.length === 0) return null;

  const handleReset = () => {
    setResetting(true);
    void resetLocalDataAndReload().catch((error) => {
      console.error(error);
      setResetting(false);
    });
  };

  return (
    <div
      role="alert"
      className="fixed inset-x-3 top-[calc(3.5rem+env(safe-area-inset-top))] z-[500] max-h-[40vh] overflow-y-auto rounded-xl border-2 border-red-500 bg-red-950 p-3 text-red-100 shadow-lg"
    >
      <p className="text-sm font-bold uppercase tracking-wide text-red-300">Startup failed</p>
      <ul className="mt-2 space-y-2 text-sm">
        {failures.map((failure, index) => (
          <li key={`${failure.step}-${failure.at}-${index}`} className="rounded-lg bg-red-900/80 p-2">
            <p className="font-semibold text-white">{failure.step}</p>
            <p className="mt-0.5 break-words text-red-100">{failure.message}</p>
            {failure.stack ? (
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-red-200/90">
                {failure.stack}
              </pre>
            ) : null}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={handleReset}
        disabled={resetting}
        className="mt-3 w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {resetting ? "Resetting…" : "Reset Local Data"}
      </button>
    </div>
  );
}

export function StartupDiagnosticsRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.setAttribute("data-app-ready", "true");
    logStartupStep("app-mounted");

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

  return (
    <>
      <StartupErrorBanner />
      {children}
    </>
  );
}
