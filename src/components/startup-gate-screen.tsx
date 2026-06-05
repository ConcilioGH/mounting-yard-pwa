"use client";

import { useState } from "react";
import { resetLocalDataAndReload } from "@/lib/reset-local-data";

type StartupGateScreenProps = {
  label: string;
  isBlocking: boolean;
  timedOut: boolean;
  errors: string[];
};

export function StartupGateScreen({ label, isBlocking, timedOut, errors }: StartupGateScreenProps) {
  const [resetting, setResetting] = useState(false);
  const showFailure = timedOut || errors.length > 0;

  const handleReset = () => {
    setResetting(true);
    void resetLocalDataAndReload().catch((error) => {
      console.error(error);
      setResetting(false);
    });
  };

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-4 text-center">
      {isBlocking && !showFailure ? (
        <p className="text-xl text-slate-400">{label}</p>
      ) : (
        <>
          <p className="max-w-lg text-lg font-semibold text-red-200">
            App failed to initialise on this device. Tap Reset Local Data.
          </p>
          {errors.length > 0 ? (
            <div
              role="alert"
              className="max-h-[40vh] w-full max-w-xl overflow-y-auto rounded-xl border border-red-500/80 bg-red-950/90 p-3 text-left text-sm text-red-100"
            >
              <p className="font-semibold uppercase tracking-wide text-red-300">Startup error</p>
              <ul className="mt-2 space-y-2">
                {errors.map((message, index) => (
                  <li key={`${index}-${message}`} className="break-words rounded-lg bg-red-900/70 p-2">
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="rounded-xl bg-red-600 px-5 py-3 text-base font-semibold text-white shadow-lg disabled:opacity-60"
          >
            {resetting ? "Resetting…" : "Reset Local Data"}
          </button>
        </>
      )}
    </div>
  );
}
