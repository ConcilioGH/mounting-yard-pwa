"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  computeRaceDayBiasAnalytics,
  formatBiasPercentPoints,
  formatSharePercent,
} from "@/lib/race-day-bias/analytics";
import { buildBiasDetailCsv, buildBiasSummaryCsv } from "@/lib/race-day-bias/export";
import { buildRaceFieldSizeMap } from "@/lib/race-day-bias/field-size";
import { deliverMeetingExport } from "@/lib/meeting-export-delivery";
import { loadAllRaces } from "@/lib/db";
import { sanitizePositionCodeInput } from "@/lib/race-day-bias/lane";
import { parseSp, sanitizeSpInput } from "@/lib/race-day-bias/sp";
import {
  isBiasStorageKey,
  loadRaceDayBiasStateForMeeting,
  logBiasStorageDebug,
  removeLegacyBiasStorageKeys,
  saveRaceDayBiasStateForMeeting,
} from "@/lib/race-day-bias/storage";
import { RESULTED_SP_UPDATED_EVENT } from "@/lib/resulted-sp/types";
import {
  loadMeetingManifest,
  MEETING_IMPORTED_EVENT,
  MEETING_MANIFEST_STORAGE_KEY,
} from "@/lib/meeting-coordination";
import {
  ensureActiveMeetingSynced,
  loadBiasStateForManifest,
} from "@/lib/active-meeting-session";
import type { ApplyResultsSpReport } from "@/lib/race-day-bias/apply-results-sp";
import type { FinisherSlot, PositionField, RaceDayBiasState } from "@/lib/race-day-bias/types";
import { cn } from "@/lib/utils";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  logLoadingState,
  logStartupStep,
  reportStartupFailure,
  STARTUP_GATE_TIMEOUT_MS,
} from "@/lib/startup-diagnostics";
import { ResultsSpImportPanel } from "@/components/race-day-bias/results-sp-import-panel";
import {
  BiasConclusionPanel,
  CompositeBiasMatrixPanel,
} from "@/components/race-day-bias/bias-conclusion-panel";

const POSITION_ROWS: Array<{ field: PositionField; label: string }> = [
  { field: "first", label: "1st" },
  { field: "second", label: "2nd" },
  { field: "third", label: "3rd" },
  { field: "fourth", label: "4th" },
];

type CellKey = { raceNo: string; field: PositionField };

function cellKeyId(key: CellKey): string {
  return `${key.raceNo}:${key.field}`;
}

/** Primary export actions — matches Speed Map / Mounting Yard dashboard chrome. */
const biasExportButtonClass = cn(
  "min-h-[2.875rem] min-w-[11.5rem] flex-1 rounded-xl border px-4 text-sm font-semibold tracking-wide sm:flex-none sm:min-w-[12.5rem]",
  "bg-gradient-to-b from-[#16233f] to-[#0b1730] text-[#f5f7ff]",
  "border-[rgba(120,180,255,0.25)]",
  "shadow-[0_2px_10px_rgba(0,0,0,0.35)]",
  "transition-all duration-200 ease-out",
  "hover:-translate-y-px hover:border-cyan-400/40",
  "hover:from-[#1c2d4f] hover:to-[#0f1c38]",
  "hover:shadow-[0_0_18px_rgba(56,189,248,0.22),0_4px_14px_rgba(0,0,0,0.4)]",
  "active:translate-y-0 active:scale-[0.99]",
  "disabled:pointer-events-none disabled:opacity-100",
  "disabled:translate-y-0 disabled:shadow-none",
  "disabled:border-slate-600/30 disabled:bg-[rgba(20,30,50,0.7)] disabled:from-transparent disabled:to-transparent",
  "disabled:text-[rgba(255,255,255,0.35)]",
);

const biasModalCancelButtonClass = cn(
  "border border-[rgba(148,163,184,0.35)] bg-[rgba(15,23,42,0.95)] text-[rgba(226,232,240,0.85)]",
  "shadow-[0_2px_8px_rgba(0,0,0,0.25)]",
  "hover:border-[rgba(125,211,252,0.45)] hover:bg-slate-800 hover:text-white",
  "active:bg-slate-900",
);

export default function RaceDayBiasApp() {
  const [state, setState] = useState<RaceDayBiasState>(() => ({
    meetingLabel: "",
    races: [],
    updatedAt: new Date().toISOString(),
  }));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [editingCell, setEditingCell] = useState<CellKey | null>(null);
  const [draft, setDraft] = useState<FinisherSlot>({ positionCode: "", sp: "" });
  const [editorStep, setEditorStep] = useState<"code" | "sp" | "combined">("code");
  const [spImportOpen, setSpImportOpen] = useState(false);
  const [spImportReport, setSpImportReport] = useState<ApplyResultsSpReport | null>(null);
  const [fieldSizeByRaceNo, setFieldSizeByRaceNo] = useState<Record<string, number>>({});
  const stateRef = useRef(state);
  stateRef.current = state;
  const biasHydratedRef = useRef(false);
  const spInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const persist = useDebouncedCallback(() => {
    if (!biasHydratedRef.current) return;
    const manifest = loadMeetingManifest();
    if (!manifest?.meetingId) return;
    setSaveState("saving");
    console.log("[bias-debug] save start", {
      meetingId: manifest.meetingId,
      rows: stateRef.current.races.length,
    });
    try {
      saveRaceDayBiasStateForMeeting(manifest.meetingId, stateRef.current);
      console.log("[bias-debug] save success", {
        meetingId: manifest.meetingId,
        rows: stateRef.current.races.length,
      });
      setSaveState("saved");
    } catch (error) {
      console.warn("[bias-debug] save failed", error);
      setSaveState("error");
    }
  }, 350);

  useEffect(() => {
    logLoadingState("RaceDayBiasApp", true, "background-init");
    let cancelled = false;

    const refreshFieldSizes = async () => {
      try {
        const races = await loadAllRaces();
        if (!cancelled) setFieldSizeByRaceNo(buildRaceFieldSizeMap(races));
      } catch (error) {
        reportStartupFailure("race-day-bias-field-sizes", error);
      }
    };

    const refreshBiasState = async () => {
      try {
        removeLegacyBiasStorageKeys();
        console.log("[bias-debug] hydrate start");
        logStartupStep("meeting-load:start");
        await ensureActiveMeetingSynced();
        const manifest = loadMeetingManifest();
        console.log("[bias-debug] active meetingId", {
          meetingId: manifest?.meetingId ?? null,
        });
        logStartupStep("meeting-load:end", {
          hasManifest: Boolean(manifest),
          meetingId: manifest?.meetingId ?? null,
        });
        if (!manifest?.meetingId) {
          biasHydratedRef.current = false;
          if (!cancelled) {
            setState({ meetingLabel: "", races: [], updatedAt: new Date().toISOString() });
          }
          return;
        }
        const loaded = loadBiasStateForManifest(manifest);
        const { biasKey, loadedExisting, meetingId } = loadRaceDayBiasStateForMeeting(manifest.meetingId);
        logBiasStorageDebug(meetingId, biasKey, loadedExisting, loaded.races.length);
        console.log("[bias-debug] hydrate loaded", {
          meetingId,
          biasKey,
          loadedExisting,
          rows: loaded.races.length,
        });
        if (!cancelled) {
          setState(loaded);
          biasHydratedRef.current = true;
        }
      } catch (error) {
        reportStartupFailure("race-day-bias-state-load", error);
      }
    };

    const refresh = () => {
      console.log("[bias-debug] reload state");
      void refreshBiasState();
      void refreshFieldSizes();
    };

    const safetyTimer = window.setTimeout(() => {
      logLoadingState("RaceDayBiasApp", false, "background-init-safety-timeout");
    }, STARTUP_GATE_TIMEOUT_MS);

    try {
      refresh();
      logLoadingState("RaceDayBiasApp", false, "background-init-done");
    } catch (error) {
      reportStartupFailure("race-day-bias-init", error);
    }

    window.addEventListener(MEETING_IMPORTED_EVENT, refresh);
    window.addEventListener(RESULTED_SP_UPDATED_EVENT, refresh);
    // NOTE: intentionally not listening to RACE_DAY_BIAS_UPDATED_EVENT here.
    // That event is dispatched by our own saveRaceDayBiasStateForMeeting, so
    // reacting to it created a save -> reload -> setState loop that clobbered
    // freshly typed input. Cross-tab bias changes still arrive via "storage".
    const onStorage = (event: StorageEvent) => {
      if (isBiasStorageKey(event.key) || event.key === MEETING_MANIFEST_STORAGE_KEY) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
      window.removeEventListener(MEETING_IMPORTED_EVENT, refresh);
      window.removeEventListener(RESULTED_SP_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    persist();
  }, [state, persist]);

  useEffect(() => {
    if (editorStep === "sp") {
      spInputRef.current?.focus();
    } else if (editorStep === "code" || editorStep === "combined") {
      codeInputRef.current?.focus();
    }
  }, [editorStep, editingCell]);

  const analytics = useMemo(
    () => computeRaceDayBiasAnalytics(state.races, fieldSizeByRaceNo),
    [state.races, fieldSizeByRaceNo],
  );

  const showImportPrompt = state.races.length === 0;

  const saveCell = (raceNo: string, field: PositionField, slot: FinisherSlot) => {
    const next: FinisherSlot = {
      positionCode: sanitizePositionCodeInput(slot.positionCode),
      sp: sanitizeSpInput(slot.sp),
    };
    console.log("[bias-debug] input changed", {
      raceNo,
      field,
      positionCode: next.positionCode,
      sp: next.sp,
    });
    setState((prev) => ({
      ...prev,
      races: prev.races.map((race) => {
        if (race.raceNo !== raceNo) return race;
        return { ...race, [field]: next };
      }),
    }));
  };

  const openCell = (raceNo: string, field: PositionField) => {
    const race = state.races.find((r) => r.raceNo === raceNo);
    const slot = race?.[field] ?? { positionCode: "", sp: "" };
    const hasExisting = Boolean(slot.positionCode.trim() || slot.sp.trim());
    setDraft({ positionCode: slot.positionCode, sp: slot.sp });
    setEditorStep(hasExisting ? "combined" : "code");
    setEditingCell({ raceNo, field });
  };

  const closeEditor = () => {
    setEditingCell(null);
    setDraft({ positionCode: "", sp: "" });
    setEditorStep("code");
  };

  const handleCodeNext = () => {
    setDraft((prev) => ({ ...prev, positionCode: sanitizePositionCodeInput(prev.positionCode) }));
    setEditorStep("sp");
  };

  const handleEditorSave = () => {
    if (!editingCell) return;
    saveCell(editingCell.raceNo, editingCell.field, draft);
    closeEditor();
  };

  const handleExportDetail = () => {
    void (async () => {
      const csv = buildBiasDetailCsv(stateRef.current);
      await deliverMeetingExport("race-day-bias", csv, {
        fallbackTrack: stateRef.current.meetingLabel,
      });
    })();
  };

  const handleExportSummary = () => {
    void (async () => {
      const csv = buildBiasSummaryCsv(stateRef.current, fieldSizeByRaceNo);
      await deliverMeetingExport("race-day-bias-summary", csv, {
        fallbackTrack: stateRef.current.meetingLabel,
      });
    })();
  };

  const editingLabel = useMemo(() => {
    if (!editingCell) return "";
    const pos = POSITION_ROWS.find((p) => p.field === editingCell.field)?.label ?? "";
    return `R${editingCell.raceNo} · ${pos}`;
  }, [editingCell]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 md:p-4">
      <header className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">Race Day Bias</h1>
        <p className="mt-1 text-sm text-slate-400">
          Tap a cell to enter lane code and SP. Autosaves on this device.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex min-h-[3rem] flex-1 items-center gap-2 text-sm text-slate-300">
            Meeting
            <input
              type="text"
              value={state.meetingLabel}
              onChange={(e) => setState((prev) => ({ ...prev, meetingLabel: e.target.value }))}
              placeholder="e.g. Hawkesbury 2026-05-14"
              className="min-h-[3rem] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 text-base text-slate-100"
            />
          </label>
        </div>
        {!showImportPrompt && (
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-stretch">
            <Button
              type="button"
              variant="default"
              size="sm"
              className={biasExportButtonClass}
              onClick={() => setSpImportOpen(true)}
            >
              Import Results / SP
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className={biasExportButtonClass}
              onClick={handleExportDetail}
            >
              Export Bias CSV
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className={biasExportButtonClass}
              onClick={handleExportSummary}
            >
              Export Bias Summary CSV
            </Button>
          </div>
        )}
        {spImportReport && !showImportPrompt && (
          <p className="mt-2 text-xs text-slate-500">
            Last SP import: {spImportReport.spPopulated} SPs from {spImportReport.racesFound} races (
            {spImportReport.parserUsed})
          </p>
        )}
        {saveState === "saving" && <p className="mt-2 text-xs text-slate-500">Saving…</p>}
        {saveState === "saved" && <p className="mt-2 text-xs text-emerald-400/90">Saved locally</p>}
        {saveState === "error" && (
          <p className="mt-2 rounded-lg border border-red-500/50 bg-red-950/60 px-3 py-2 text-sm font-semibold text-red-200">
            Could not save bias input — device storage may be full. Free up space or export before
            entering more, or this input may be lost.
          </p>
        )}
      </header>

      {showImportPrompt ? (
        <p className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-8 text-center text-base text-slate-400">
          Import the meeting CSV from Mounting Yard to create bias rows for each race.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/90">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="sticky left-0 z-10 min-w-[3rem] bg-slate-950/95 px-2 py-2" aria-hidden />
                {state.races.map((race) => (
                  <th
                    key={race.raceNo}
                    className="min-w-[3.25rem] px-1 py-2 text-center text-base font-bold text-slate-200"
                  >
                    R{race.raceNo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POSITION_ROWS.map((pos) => (
                <tr key={pos.field} className="border-b border-slate-800/80">
                  <th className="sticky left-0 z-10 bg-slate-950/95 px-2 py-1.5 text-left text-sm font-semibold text-slate-400">
                    {pos.label}
                  </th>
                  {state.races.map((race) => (
                    <BiasGridCell
                      key={cellKeyId({ raceNo: race.raceNo, field: pos.field })}
                      slot={race[pos.field]}
                      label={`${pos.label} finisher, race ${race.raceNo}`}
                      onOpen={() => openCell(race.raceNo, pos.field)}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!showImportPrompt && (
        <p className="text-xs text-slate-500">
          Code: Rail 1,3,5,7,9,11 · Line 2,4,6,8,10,12 · Wide 32,42… · SP stored per cell (dot when set)
        </p>
      )}

      {!showImportPrompt && (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Top-4 weighted share (SP-adjusted)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Lane groups · Weights: 1st 1.00 · 2nd 0.60 · 3rd 0.35 · 4th 0.20 · Bias = actual share −
            expected share among entered top-4 finishers
          </p>
          <div className="mt-3 overflow-x-auto">
            <SummaryTable
              headers={[
                "Lane Group",
                "Wins",
                "Places",
                "Avg SP",
                "Actual Share",
                "Expected Share",
                "Bias Score",
              ]}
              rows={analytics.spAdjusted.groups.map((row) => [
                row.label,
                String(row.rawWins),
                String(row.rawPlaces),
                row.avgSp != null ? row.avgSp.toFixed(2) : "—",
                formatSharePercent(row.actualShare),
                formatSharePercent(row.expectedShare),
                formatBiasPercentPoints(row.biasScore),
              ])}
            />
          </div>
          <p
            className={cn(
              "mt-3 text-sm font-medium",
              analytics.spAdjusted.hasSpData ? "text-slate-100" : "text-slate-500",
            )}
          >
            {analytics.spAdjusted.signal}
          </p>
        </section>
      )}

      {!showImportPrompt && (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Positional bias summary
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Running-order position relative to field size · Wide groups for 3-wide+ codes · Same
            top-4 weighted SP model as lane analysis
          </p>
          <div className="mt-3 overflow-x-auto">
            <SummaryTable
              headers={[
                "Position Group",
                "Wins",
                "Places",
                "Avg SP",
                "Actual Share",
                "Expected Share",
                "Bias Score",
              ]}
              rows={analytics.positional.groups.map((row) => [
                row.label,
                String(row.rawWins),
                String(row.rawPlaces),
                row.avgSp != null ? row.avgSp.toFixed(2) : "—",
                formatSharePercent(row.actualShare),
                formatSharePercent(row.expectedShare),
                formatBiasPercentPoints(row.biasScore),
              ])}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Field sizes from imported meeting ({analytics.positional.racesWithFieldSize} races)
          </p>
          <p
            className={cn(
              "mt-3 text-sm font-medium",
              analytics.positional.hasSpData ? "text-slate-100" : "text-slate-500",
            )}
          >
            {analytics.positional.signal}
          </p>
        </section>
      )}

      {!showImportPrompt && (
        <BiasConclusionPanel conclusion={analytics.conclusion} />
      )}

      {!showImportPrompt && (
        <CompositeBiasMatrixPanel composite={analytics.composite} />
      )}

      {editingCell && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
          role="presentation"
          onClick={closeEditor}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bias-cell-editor-title"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="bias-cell-editor-title" className="text-lg font-bold text-slate-50">
              {editingLabel}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {editorStep === "combined"
                ? "Edit position code and SP"
                : editorStep === "code"
                  ? "Step 1 of 2 — position code"
                  : "Step 2 of 2 — starting price"}
            </p>

            {editorStep === "combined" ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-slate-300">
                  Position code
                  <input
                    ref={codeInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={draft.positionCode}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        positionCode: sanitizePositionCodeInput(e.target.value),
                      }))
                    }
                    className="mt-1 min-h-[3.25rem] w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-center text-2xl font-bold tabular-nums text-slate-50 focus:border-cyan-400 focus:outline-none"
                    placeholder="e.g. 2"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  SP (decimal)
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={draft.sp}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, sp: sanitizeSpInput(e.target.value) }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleEditorSave();
                      }
                    }}
                    className="mt-1 min-h-[3.25rem] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-center text-xl font-semibold tabular-nums text-slate-100 focus:border-amber-400/80 focus:outline-none"
                    placeholder="e.g. 4.6"
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="default"
                    className={cn("min-h-[3rem] flex-1", biasModalCancelButtonClass)}
                    onClick={closeEditor}
                  >
                    Cancel
                  </Button>
                  <Button type="button" className="min-h-[3rem] flex-1" onClick={handleEditorSave}>
                    Save
                  </Button>
                </div>
              </div>
            ) : editorStep === "code" ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-slate-300">
                  Position code
                  <input
                    ref={codeInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={draft.positionCode}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        positionCode: sanitizePositionCodeInput(e.target.value),
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCodeNext();
                      }
                    }}
                    className="mt-1 min-h-[3.25rem] w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-center text-2xl font-bold tabular-nums text-slate-50 focus:border-cyan-400 focus:outline-none"
                    placeholder="e.g. 2"
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="default"
                    className={cn("min-h-[3rem] flex-1", biasModalCancelButtonClass)}
                    onClick={closeEditor}
                  >
                    Cancel
                  </Button>
                  <Button type="button" className="min-h-[3rem] flex-1" onClick={handleCodeNext}>
                    Next — SP
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-slate-300">
                  SP (decimal)
                  <input
                    ref={spInputRef}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={draft.sp}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, sp: sanitizeSpInput(e.target.value) }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleEditorSave();
                      }
                    }}
                    className="mt-1 min-h-[3.25rem] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-center text-xl font-semibold tabular-nums text-slate-100 focus:border-amber-400/80 focus:outline-none"
                    placeholder="e.g. 4.6"
                  />
                </label>
                <p className="text-center text-2xl font-bold text-cyan-300/90">{draft.positionCode || "—"}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[3rem] flex-1"
                    onClick={() => setEditorStep("code")}
                  >
                    Back
                  </Button>
                  <Button type="button" className="min-h-[3rem] flex-1" onClick={handleEditorSave}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ResultsSpImportPanel
        open={spImportOpen}
        biasRaces={state.races}
        onClose={() => setSpImportOpen(false)}
        onApplied={(entries, report) => {
          setState((prev) => ({ ...prev, races: entries }));
          setSpImportReport(report);
        }}
      />
    </div>
  );
}

function BiasGridCell({
  slot,
  label,
  onOpen,
}: {
  slot: FinisherSlot;
  label: string;
  onOpen: () => void;
}) {
  const hasSp = parseSp(slot.sp) != null;
  const displayCode = slot.positionCode.trim();

  return (
    <td className="p-1">
      <button
        type="button"
        aria-label={label}
        onClick={onOpen}
        className={cn(
          "relative flex min-h-[3.25rem] min-w-[3.25rem] w-full items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 text-xl font-bold tabular-nums text-slate-50 transition-colors",
          "hover:border-cyan-500/50 hover:bg-slate-800 active:scale-[0.98]",
          displayCode && "border-slate-600",
        )}
      >
        <span className={cn(!displayCode && "text-slate-600")}>{displayCode || "—"}</span>
        {hasSp && (
          <span
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400"
            aria-hidden
            title="SP saved"
          />
        )}
      </button>
    </td>
  );
}

function SummaryTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table className="w-full min-w-[32rem] border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
          {headers.map((h) => (
            <th
              key={h}
              className={cn("py-2 pr-2", h !== headers[0] && "px-2 text-right")}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, index) => (
          <tr key={index} className="border-b border-slate-800/80 text-slate-200">
            {cells.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                className={cn(
                  "py-2.5 pr-2 font-semibold tabular-nums",
                  cellIndex > 0 && "px-2 text-right",
                  cellIndex === 0 && "pr-4",
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
