"use client";

import type { PressureLabel } from "@/lib/speed-map";
import { cn } from "@/lib/utils";

type PressureMeterProps = {
  score: number;
  label: PressureLabel;
};

export function PressureMeter({ score, label }: PressureMeterProps) {
  const fill = Math.max(0, Math.min(100, Math.round((score / 9) * 100)));
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-950/65 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Pressure Meter</span>
        <span
          className={cn(
            "text-sm font-bold",
            label === "Low" && "text-sky-300",
            label === "Moderate" && "text-amber-300",
            label === "High" && "text-orange-400",
            label === "Extreme" && "text-red-500",
          )}
        >
          {label}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-800/80">
        <div
          className={cn(
            "h-full transition-all",
            label === "Low" && "bg-sky-400",
            label === "Moderate" && "bg-amber-300",
            label === "High" && "bg-orange-400",
            label === "Extreme" && "bg-red-600",
          )}
          style={{ width: `${fill}%` }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-white/35 to-transparent" />
      </div>
    </div>
  );
}
