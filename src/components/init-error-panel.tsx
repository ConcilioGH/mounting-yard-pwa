"use client";

import { useState } from "react";
import { resetLocalDataAndReload } from "@/lib/reset-local-data";

type InitErrorPanelProps = {
  errors: string[];
};

export function InitErrorPanel({ errors }: InitErrorPanelProps) {
  const [resetting, setResetting] = useState(false);

  if (errors.length === 0) return null;

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
      className="mx-3 mt-2 rounded-xl border-2 border-red-500 bg-red-950 p-3 text-red-100"
    >
      <p className="text-sm font-bold uppercase tracking-wide text-red-300">Startup error</p>
      <ul className="mt-2 space-y-2 text-sm">
        {errors.map((message, index) => (
          <li key={`${index}-${message}`} className="break-words rounded-lg bg-red-900/80 p-2">
            {message}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={handleReset}
        disabled={resetting}
        className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {resetting ? "Resetting…" : "Reset Local Data"}
      </button>
    </div>
  );
}
