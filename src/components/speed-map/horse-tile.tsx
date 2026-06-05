"use client";

import type React from "react";
import { cn } from "@/lib/utils";
import { type SpeedMapRunner } from "@/lib/speed-map";
import { getSpeedMapTile } from "@/lib/speed-map-tile";

type HorseTileProps = {
  runner: SpeedMapRunner;
  dimmed: boolean;
  spotlighted: boolean;
  onPointerDown: (id: string, event: React.PointerEvent<HTMLButtonElement>) => void;
  onClick: (id: string) => void;
};

const TILE_BASE_SURFACE =
  "absolute z-[100] cursor-grab overflow-visible rounded-[9px] border px-2.5 py-2 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_24px_rgba(0,0,0,0.42)] transition hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_14px_28px_rgba(0,0,0,0.46)] active:cursor-grabbing";

const TILE_DEFAULT_BG =
  "border-slate-600/50 bg-gradient-to-b from-[#1a2740] via-[#131e33] to-[#0b1220]";

/** Shared surface styles for runner tiles (board probe uses the same). */
export const HORSE_TILE_SURFACE_CLASS = cn(TILE_BASE_SURFACE, TILE_DEFAULT_BG);

function highlightSurfaceClass(runner: SpeedMapRunner): string {
  if (runner.flags.favourite) {
    return "border-pink-400/50 bg-gradient-to-b from-pink-950/95 via-pink-900/88 to-rose-950/95 text-pink-50";
  }
  if (runner.flags.target) {
    return "border-sky-400/50 bg-gradient-to-b from-sky-950/95 via-blue-900/88 to-sky-950/95 text-sky-50";
  }
  if (runner.flags.mapAdvantage) {
    return "border-emerald-400/50 bg-gradient-to-b from-emerald-950/95 via-emerald-900/88 to-green-950/95 text-emerald-50";
  }
  if (runner.flags.risk) {
    return "border-amber-400/55 bg-gradient-to-b from-amber-950/95 via-orange-950/88 to-red-950/95 text-amber-50";
  }
  return TILE_DEFAULT_BG;
}

export function horseTileStyleFromMetrics(
  xNorm: number,
  yNorm: number,
  tile = getSpeedMapTile(),
): React.CSSProperties {
  const widthPct = (tile.WIDTH / tile.boardWidthPx) * 100;
  const heightPct = (tile.HEIGHT / tile.boardHeightPx) * 100;
  const anchorOffsetPct = (tile.ANCHOR_OFFSET_Y / tile.boardHeightPx) * 100;
  return {
    width: `${widthPct}%`,
    height: `${heightPct}%`,
    left: `${(xNorm * 100).toFixed(2)}%`,
    top: `calc(${(yNorm * 100).toFixed(2)}% - ${anchorOffsetPct}%)`,
    zIndex: 100,
    overflow: "visible",
    boxSizing: "border-box",
  };
}

export function HorseTile({ runner, dimmed, spotlighted, onPointerDown, onClick }: HorseTileProps) {
  return (
    <button
      type="button"
      onPointerDown={(event) => onPointerDown(runner.id, event)}
      onClick={() => onClick(runner.id)}
      className={cn(
        TILE_BASE_SURFACE,
        highlightSurfaceClass(runner),
        spotlighted && "ring-2 ring-cyan-300/85 ring-offset-1 ring-offset-slate-950",
        spotlighted && "scale-[1.02]",
        dimmed && "opacity-25",
      )}
      style={horseTileStyleFromMetrics(runner.x, runner.y)}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-50 text-sm font-extrabold text-slate-900 shadow-sm">
          {runner.no}
        </span>
        <span className="line-clamp-2 pt-0.5 text-[13.5px] font-bold leading-[1.2] text-slate-50">{runner.horse}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        {!runner.hasSpeedData ? (
          <span className="rounded-[5px] border border-amber-300/35 bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-amber-200">
            NO DATA
          </span>
        ) : (
          <span />
        )}
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-500/35 bg-[#2a3b52] px-2 text-[11px] font-bold text-slate-100">
          {runner.barrier}
        </span>
      </div>
    </button>
  );
}
