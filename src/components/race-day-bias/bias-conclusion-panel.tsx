"use client";

import {
  COMPOSITE_DEPTH_LABELS,
  COMPOSITE_DEPTH_ORDER,
  COMPOSITE_LANE_ORDER,
  formatMatrixBiasPp,
  HEAT_CELL_CLASS,
  biasHeatTier,
  type BiasConclusion,
  type CompositeMatrixResult,
} from "@/lib/race-day-bias/composite";
import { LANE_GROUP_LABELS } from "@/lib/race-day-bias/lane";
import { cn } from "@/lib/utils";

function formatPickLine(pick: { shortLabel: string; biasScorePp: number } | null): string | null {
  if (!pick) return null;
  const sign = pick.biasScorePp > 0 ? "+" : "";
  return `${pick.shortLabel} (${sign}${pick.biasScorePp})`;
}

export function BiasConclusionPanel({ conclusion }: { conclusion: BiasConclusion }) {
  if (!conclusion.sufficientSample) {
    return (
      <section className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200/90">
          Bias conclusion
        </h2>
        <p className="mt-3 text-base text-slate-300">
          {conclusion.interpretationLines[0] ?? "Insufficient sample size."}
        </p>
      </section>
    );
  }

  const primaryLine = formatPickLine(conclusion.primary);
  const secondaryLine = formatPickLine(conclusion.secondary);
  const negativeLine = formatPickLine(conclusion.negative);

  return (
    <section className="rounded-2xl border border-cyan-900/50 bg-gradient-to-b from-slate-950 to-slate-900 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-200/90">
        Bias conclusion
      </h2>

      {conclusion.tracksideCards.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {conclusion.tracksideCards.map((card) => (
            <div
              key={card.title}
              className={cn(
                "min-w-[10rem] flex-1 rounded-xl border border-slate-700/80 px-4 py-3 text-center shadow-lg",
                card.heatTier === "strongPositive" && "border-emerald-600/50 bg-emerald-950/40",
                card.heatTier === "positive" && "border-emerald-700/30 bg-emerald-950/25",
                (card.heatTier === "strongNegative" || card.heatTier === "negative") &&
                  "border-red-700/50 bg-red-950/35",
              )}
            >
              <p className="text-sm font-bold tracking-wide text-slate-100">{card.title}</p>
              <p
                className={cn(
                  "mt-1 text-xs font-semibold uppercase tracking-wider",
                  card.tag === "AVOID" ? "text-red-300" : "text-emerald-300",
                )}
              >
                {card.tag}
              </p>
            </div>
          ))}
        </div>
      )}

      <dl className="mt-5 space-y-3 text-sm">
        {primaryLine && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Primary bias
            </dt>
            <dd className="mt-0.5 text-base font-bold text-emerald-300">{primaryLine}</dd>
          </div>
        )}
        {secondaryLine && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Secondary bias
            </dt>
            <dd className="mt-0.5 text-base font-semibold text-slate-200">{secondaryLine}</dd>
          </div>
        )}
        {negativeLine && conclusion.negative && conclusion.negative.biasScorePp < 0 && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Negative bias
            </dt>
            <dd className="mt-0.5 text-base font-semibold text-red-300">{negativeLine}</dd>
          </div>
        )}
      </dl>

      {conclusion.interpretationLines.length > 0 && (
        <div className="mt-5 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Interpretation
          </p>
          <ul className="mt-2 space-y-2 text-base leading-relaxed text-slate-200">
            {conclusion.interpretationLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function CompositeBiasMatrixPanel({ composite }: { composite: CompositeMatrixResult }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
        Lane × position matrix
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        SP-adjusted bias score (pp) by lane and running-order depth · Green = outperforming market ·
        Red = underperforming
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="py-2 pr-3 text-left text-xs font-semibold uppercase text-slate-500" />
              {COMPOSITE_DEPTH_ORDER.map((d) => (
                  <th
                    key={d}
                    className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {COMPOSITE_DEPTH_LABELS[d]}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {composite.matrix.map((row, rowIndex) => {
              const lane = COMPOSITE_LANE_ORDER[rowIndex]!;
              return (
                <tr key={lane}>
                  <th className="py-2 pr-3 text-left text-xs font-semibold text-slate-300">
                    {LANE_GROUP_LABELS[lane]}
                  </th>
                  {row.map((cell) => {
                    const tier = biasHeatTier(cell.biasScore, cell.finisherCount);
                    const display =
                      cell.finisherCount < 3 ? "—" : formatMatrixBiasPp(cell.biasScore);
                    return (
                      <td key={cell.key} className="p-1">
                        <div
                          className={cn(
                            "flex min-h-[2.75rem] items-center justify-center rounded-lg px-2 text-center font-bold tabular-nums",
                            HEAT_CELL_CLASS[tier],
                          )}
                          title={
                            cell.finisherCount >= 3
                              ? `${cell.label}: ${display} pp (${cell.finisherCount} finishers)`
                              : `${cell.label}: insufficient sample`
                          }
                        >
                          {display}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[10px] uppercase tracking-wide text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded bg-emerald-700" /> Strong +
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded bg-emerald-600/50" /> Positive
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded bg-slate-700" /> Neutral
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded bg-red-600/45" /> Negative
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded bg-red-800" /> Strong −
        </span>
      </div>
    </section>
  );
}
