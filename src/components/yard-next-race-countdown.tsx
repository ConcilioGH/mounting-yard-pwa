"use client";

import { useEffect, useMemo, useState } from "react";
import type { Race } from "@/lib/types";
import {
  formatCountdownSeconds,
  getNextRaceCountdown,
  type NextRaceCountdown,
} from "@/lib/yard-race-countdown";
import { cn } from "@/lib/utils";

type YardNextRaceCountdownProps = {
  races: Race[];
  meetingDate?: string;
};

function timerTone(countdown: NextRaceCountdown): string {
  if (countdown.status !== "counting_down") return "text-white";
  if (countdown.secondsRemaining < 60) return "text-red-400";
  if (countdown.secondsRemaining < 300) return "text-amber-400";
  return "text-white";
}

export function YardNextRaceCountdown({ races, meetingDate }: YardNextRaceCountdownProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const countdown = useMemo(
    () => getNextRaceCountdown(races, now, meetingDate),
    [races, now, meetingDate],
  );

  if (!countdown) {
    return (
      <div className="min-w-[11rem] rounded-2xl border border-slate-700 bg-[#0f172a] px-4 py-3 text-center shadow-md sm:min-w-[12.5rem]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Next race</p>
        <p className="mt-2 text-sm font-medium text-slate-300">Import meeting for start times</p>
      </div>
    );
  }

  if (countdown.status === "complete") {
    return (
      <div className="min-w-[11rem] rounded-2xl border border-slate-700 bg-[#0f172a] px-4 py-3 text-center shadow-md sm:min-w-[12.5rem]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Next race</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-white sm:text-3xl">Meeting complete</p>
      </div>
    );
  }

  const showCountdown = countdown.status === "counting_down";
  const mainSeconds = showCountdown
    ? countdown.secondsRemaining
    : countdown.secondsUntilCountdownStarts;

  return (
    <div className="min-w-[11rem] rounded-2xl border border-slate-700 bg-[#0f172a] px-4 py-3 text-center shadow-md sm:min-w-[12.5rem]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Next race</p>

      {showCountdown ? (
        <p
          className={cn(
            "mt-1 font-mono text-4xl font-bold tabular-nums leading-none sm:text-5xl",
            timerTone(countdown),
          )}
        >
          {formatCountdownSeconds(mainSeconds)}
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs font-medium text-slate-300">Next countdown starts in</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums leading-none text-white sm:text-4xl">
            {formatCountdownSeconds(mainSeconds)}
          </p>
        </>
      )}

      <p className="mt-2 text-sm font-semibold text-slate-200">
        {countdown.raceLabel} · {countdown.displayStartTime}
      </p>
    </div>
  );
}
