"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_RACES,
  gearLocations,
  gearTiles,
  racedayCompactGroups,
  SWEAT_LEGEND,
  SWEAT_NEG_ROW,
  SWEAT_POS_KEY,
  WET_BODY_TYPES,
  WET_FEET,
  wetTile,
} from "@/lib/constants";
import {
  clearAllAssessments,
  loadAllAssessments,
  loadAllRaces,
  mergeAssessment,
  replaceAllAssessments,
  seedRacesIfEmpty,
} from "@/lib/db";
import { buildAssessmentsExportCsv } from "@/lib/csv";
import { deliverMeetingExport } from "@/lib/meeting-export-delivery";
import {
  pickMeetingDirectory,
  readMeetingCsvFromDirectory,
  supportsDirectoryPicker,
} from "@/lib/meeting-folder-handle";
import {
  formatMeetingDisplayLabel,
  importMeetingFromCsv,
  loadMeetingManifest,
  MEETING_IMPORTED_EVENT,
  MEETING_MANIFEST_STORAGE_KEY,
  type MeetingManifest,
} from "@/lib/meeting-coordination";
import {
  ensureActiveMeetingSynced,
  racesMatchManifest,
} from "@/lib/active-meeting-session";
import { YardNextRaceCountdown } from "@/components/yard-next-race-countdown";
import { ResultedSpStatusPanel } from "@/components/resulted-sp-status-panel";
import { getOfficialSpForRunner, loadResultedSpStateForMeeting } from "@/lib/resulted-sp/storage";
import { applyGearTileSelection, type GearTileCode } from "@/lib/gear";
import type { Assessment, Race, Runner, WetBodyType, WetFeet } from "@/lib/types";
import { wetIsSet, wetShorthand } from "@/lib/wet";
import { cn, emptyAssessment, makeKey, marks, nextNegative, nextPositive } from "@/lib/utils";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { enableIOS12CompatMode } from "@/lib/ios12-compat-mode";
import { shouldSkipYardPersistence, shouldSkipYardStartupLoad } from "@/lib/ios12-yard-fallback";
import { installIOS12OverlayFix, removeBlockingOverlays } from "@/lib/ios12-overlay-fix";
import { IOS12_TAP_BUTTON_STYLE } from "@/lib/ios12-yard-tap";
import { isIOS12, shouldSkipIndexedDB } from "@/lib/legacy-safari";
import { yardControlClick } from "@/lib/ios12-safe-interaction";
import {
  createAssessmentPressProps,
  removeLegacyStartupOverlays,
  type AssessmentPressProps,
} from "@/lib/yard-touch-diagnostics";
import {
  logLoadingState,
  logStartupStep,
  reportStartupFailure,
  STARTUP_GATE_TIMEOUT_MS,
} from "@/lib/startup-diagnostics";
import {
  installIOS12YardDomBridge,
  type YardDomBridgeHandlers,
} from "@/lib/ios12-yard-dom-bridge";
import YardLegacyIOS12 from "@/components/yard-legacy-ios12";

function isPositiveAssessmentFactor(factor: string): boolean {
  return factor === SWEAT_POS_KEY || factor.endsWith("+");
}

function totals(a: Assessment | undefined) {
  const pos = a
    ? Object.values(a.positive).reduce((sum, v) => sum + Math.max(0, v ?? 0), 0)
    : 0;
  const neg = a
    ? Object.values(a.negative).reduce((sum, v) => sum + Math.abs(Math.min(0, v ?? 0)), 0)
    : 0;
  return { pos, neg, net: pos - neg };
}

function physicalDigitAtLocation(loc: number): React.ReactNode {
  if (loc < 1 || loc > 5) return null;
  const textCls = "text-3xl font-bold leading-none text-red-600 tabular-nums";
  switch (loc) {
    case 1:
      return (
        <span key={loc} className={cn("pointer-events-none absolute bottom-1 left-1 z-10", textCls)}>
          {loc}
        </span>
      );
    case 2:
      return (
        <span key={loc} className={cn("pointer-events-none absolute top-1 left-1 z-10", textCls)}>
          {loc}
        </span>
      );
    case 3:
      return (
        <span key={loc} className={cn("pointer-events-none absolute top-1 right-1 z-10", textCls)}>
          {loc}
        </span>
      );
    case 4:
      return (
        <span key={loc} className={cn("pointer-events-none absolute bottom-1 right-1 z-10", textCls)}>
          {loc}
        </span>
      );
    case 5:
      return (
        <span key={loc} className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <span className={textCls}>{loc}</span>
        </span>
      );
    default:
      return null;
  }
}

function renderPhysicalValue(locs: number[] | undefined): React.ReactNode {
  if (!locs?.length) return null;
  const uniq = [...new Set(locs.filter((n) => n >= 1 && n <= 5))].sort((a, b) => a - b);
  if (uniq.length === 0) return null;
  return <>{uniq.map((loc) => physicalDigitAtLocation(loc))}</>;
}

/** Net = total_positive − total_negative; soft tints for outdoor readability. */
function runnerNetBackground(net: number): string {
  if (net >= 3) return "bg-emerald-300/80";
  if (net === 2) return "bg-emerald-200/85";
  if (net === 1) return "bg-emerald-100/90";
  if (net === 0) return "bg-slate-200/70";
  if (net === -1) return "bg-orange-100/90";
  if (net === -2) return "bg-orange-200/85";
  return "bg-red-200/80";
}

function formatNet(n: number) {
  return `${n > 0 ? "+" : ""}${n}`;
}

const compactFactorBtn =
  "h-auto min-h-[3.25rem] flex-col gap-0.5 rounded-xl px-1.5 py-1.5 text-center text-[0.95rem] font-bold leading-tight sm:min-h-[3.5rem] sm:px-2 sm:text-base";
const compactMarksPos = "text-xl font-bold leading-none text-green-700 sm:text-2xl";
const compactMarksNeg = "text-xl font-bold leading-none text-red-700 sm:text-2xl";
const ios12FactorBtnClass =
  "yard-interactive inline-flex w-full cursor-pointer items-center justify-center gap-2 font-semibold rounded-2xl border border-slate-200 bg-white min-h-[56px]";

type PhysicalPicker = GearTileCode | "WET" | null;

const ios12BtnClass =
  "yard-interactive inline-flex cursor-pointer items-center justify-center gap-2 font-semibold min-h-[56px] rounded-2xl px-5 text-lg";

function YardButton({
  onClick,
  className,
  children,
  variant = "default",
  disabled,
  tapDebugAlways,
  yardAction,
}: {
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
  variant?: "default" | "outline";
  disabled?: boolean;
  /** iOS 12: remain clickable so tap-count debug still fires */
  tapDebugAlways?: boolean;
  yardAction?: string;
}) {
  if (isIOS12()) {
    const faded = Boolean(disabled);
    return (
      <button
        type="button"
        disabled={faded && !tapDebugAlways}
        data-yard-action={yardAction}
        style={IOS12_TAP_BUTTON_STYLE}
        className={cn(
          ios12BtnClass,
          variant === "default"
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white",
          faded && "opacity-50",
          className,
        )}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
  return (
    <Button type="button" variant={variant} size="touch" className={className} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

function AssessmentControl({
  onPress,
  pressProps,
  className,
  children,
  variant = "outline",
  yardFactor,
}: {
  onPress: () => void;
  pressProps: AssessmentPressProps;
  className?: string;
  children: React.ReactNode;
  variant?: "default" | "outline";
  yardFactor?: string;
}) {
  if (isIOS12()) {
    return (
      <button
        type="button"
        data-yard-action={yardFactor ? "assessment" : undefined}
        data-factor={yardFactor}
        style={IOS12_TAP_BUTTON_STYLE}
        className={cn(
          ios12FactorBtnClass,
          variant === "default" && "border-slate-900 bg-slate-900 text-white",
          className,
        )}
        onClick={onPress}
      >
        {children}
      </button>
    );
  }
  return (
    <Button type="button" variant={variant} size="touch" className={className} {...pressProps}>
      {children}
    </Button>
  );
}

export default function MountingYardApp() {
  const [clientReady, setClientReady] = useState(false);
  const [useLegacyYard, setUseLegacyYard] = useState(false);

  useEffect(() => {
    setUseLegacyYard(isIOS12());
    setClientReady(true);
  }, []);

  if (!clientReady) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>Loading Yard...</div>
      </div>
    );
  }

  if (useLegacyYard) {
    return <YardLegacyIOS12 />;
  }

  return <MountingYardModernApp />;
}

function MountingYardModernApp() {
  const [races, setRaces] = useState<Race[]>(DEFAULT_RACES);
  const [raceId, setRaceId] = useState(DEFAULT_RACES[0]?.id ?? "R1");
  const [selectedRunner, setSelectedRunner] = useState(DEFAULT_RACES[0]?.runners[0]?.no ?? 1);
  const [data, setData] = useState<Record<string, Assessment>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [meetingLabel, setMeetingLabel] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingManifest, setMeetingManifest] = useState<MeetingManifest | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef<Record<string, Assessment>>({});
  const keyRef = useRef<string>("");
  const prevKeyRef = useRef<string | null>(null);
  const [gearPicker, setGearPicker] = useState<PhysicalPicker>(null);
  const gearTilesRef = useRef<HTMLDivElement>(null);
  const assessmentAreaRef = useRef<HTMLDivElement>(null);
  const yardRootRef = useRef<HTMLDivElement>(null);
  const bridgeHandlersRef = useRef<YardDomBridgeHandlers | null>(null);
  const lastTouchTimeRef = useRef(0);
  const userInteractedRef = useRef(false);

  const markUserInteraction = useCallback(() => {
    userInteractedRef.current = true;
  }, []);

  useEffect(() => {
    removeLegacyStartupOverlays();
    removeBlockingOverlays();
    if (isIOS12()) void enableIOS12CompatMode();
  }, []);

  useEffect(() => {
    if (!isIOS12()) return;
    removeBlockingOverlays();
    return installIOS12OverlayFix();
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const persistSnapshot = useCallback(() => {
    if (shouldSkipYardPersistence()) return Promise.resolve();
    setSaveState("saving");
    return replaceAllAssessments(dataRef.current)
      .then(() => {
        setSaveState("saved");
        window.setTimeout(() => setSaveState("idle"), 800);
      })
      .catch(() => setSaveState("error"));
  }, []);

  const debouncedSnapshotSave = useDebouncedCallback(() => {
    void persistSnapshot();
  }, 400);

  const flushPending = useCallback(() => {
    void persistSnapshot();
  }, [persistSnapshot]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushPending();
    };
    const onPageHide = () => flushPending();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flushPending]);

  useEffect(() => {
    if (shouldSkipYardStartupLoad()) {
      logLoadingState("MountingYardApp", false, "ios12-fallback-blank-start");
      return;
    }

    logLoadingState("MountingYardApp", true, "background-init");
    let cancelled = false;

    const applyMeetingManifest = () => {
      logStartupStep("meeting-load:start");
      let manifest = null;
      try {
        manifest = loadMeetingManifest();
      } catch (manifestError) {
        reportStartupFailure("meeting-manifest-load", manifestError);
      }
      logStartupStep("meeting-load:end", {
        hasManifest: Boolean(manifest),
        raceCount: manifest?.raceNos.length ?? 0,
      });
      setMeetingLabel(formatMeetingDisplayLabel(manifest));
      setMeetingDate(manifest?.date ?? "");
      setMeetingManifest(manifest);
    };

    const loadPersistedData = async () => {
      if (shouldSkipIndexedDB()) {
        applyMeetingManifest();
        return;
      }
      await seedRacesIfEmpty();
      await ensureActiveMeetingSynced();
      const manifest = loadMeetingManifest();
      const [loadedRaces, loadedAssessments] = await Promise.all([
        loadAllRaces(),
        loadAllAssessments(),
      ]);
      applyMeetingManifest();
      const racesOk = manifest ? racesMatchManifest(loadedRaces, manifest) : loadedRaces.length > 0;
      if (loadedRaces.length && racesOk && !userInteractedRef.current) {
        setRaces(loadedRaces);
        const first = loadedRaces[0];
        setRaceId(first.id);
        setSelectedRunner(first.runners[0]?.no ?? 1);
      } else if (manifest && !racesOk && !userInteractedRef.current) {
        setRaces([]);
        dataRef.current = {};
        setData({});
      }
      if (!userInteractedRef.current && racesOk) {
        dataRef.current = loadedAssessments;
        setData(loadedAssessments);
      }
    };

    const safetyTimer = window.setTimeout(() => {
      logLoadingState("MountingYardApp", false, "background-init-safety-timeout");
    }, STARTUP_GATE_TIMEOUT_MS);

    void (async () => {
      try {
        await Promise.race([
          loadPersistedData(),
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () => reject(new Error(`Yard init timed out after ${STARTUP_GATE_TIMEOUT_MS}ms`)),
              STARTUP_GATE_TIMEOUT_MS,
            ),
          ),
        ]);
      } catch (error) {
        if (!cancelled) {
          reportStartupFailure("mounting-yard-init", error);
          applyMeetingManifest();
        }
      } finally {
        if (!cancelled) {
          window.clearTimeout(safetyTimer);
          logLoadingState("MountingYardApp", false, "background-init-done");
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
    };
  }, []);

  useEffect(() => {
    const refreshFromSharedMeeting = () => {
      void (async () => {
        await ensureActiveMeetingSynced();
        const manifest = loadMeetingManifest();
        setMeetingLabel(formatMeetingDisplayLabel(manifest));
        setMeetingDate(manifest?.date ?? "");
        setMeetingManifest(manifest);
        if (shouldSkipIndexedDB()) return;
        const loadedRaces = await loadAllRaces();
        if (manifest && racesMatchManifest(loadedRaces, manifest)) {
          setRaces(loadedRaces);
          setRaceId(loadedRaces[0]!.id);
          setSelectedRunner(loadedRaces[0]!.runners[0]?.no ?? 1);
        }
      })();
    };
    window.addEventListener(MEETING_IMPORTED_EVENT, refreshFromSharedMeeting);
    const onStorage = (event: StorageEvent) => {
      if (event.key === MEETING_MANIFEST_STORAGE_KEY) {
        refreshFromSharedMeeting();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MEETING_IMPORTED_EVENT, refreshFromSharedMeeting);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const race = races.find((r) => r.id === raceId) ?? races[0];
  const runners = useMemo(() => race?.runners ?? [], [race]);

  const runner: Runner | undefined = race?.runners.find((r) => r.no === selectedRunner) ?? race?.runners[0];

  const key = race && runner ? makeKey(race.id, runner.no) : "";
  const record = key ? data[key] ?? emptyAssessment() : emptyAssessment();

  useEffect(() => {
    setGearPicker(null);
  }, [raceId, selectedRunner]);

  useEffect(() => {
    if (!key) return;
    const prev = prevKeyRef.current;
    prevKeyRef.current = key;
    keyRef.current = key;
    if (prev && prev !== key && !shouldSkipYardPersistence()) {
      void persistSnapshot();
    }
  }, [key, persistSnapshot]);

  const closePhysicalPickerIfOutside = (target: EventTarget | null) => {
    if (!gearPicker) return;
    if (gearTilesRef.current?.contains(target as Node)) return;
    setGearPicker(null);
  };

  const handleAssessmentPress = useCallback(
    (_label: string, handler: () => void) => {
      markUserInteraction();
      handler();
    },
    [markUserInteraction],
  );

  const assessmentPress = useCallback(
    (label: string, handler: () => void): AssessmentPressProps =>
      createAssessmentPressProps(
        label,
        () => handleAssessmentPress(label, handler),
        lastTouchTimeRef,
      ),
    [handleAssessmentPress],
  );

  const yardClick = useCallback(
    (_label: string, handler: () => void) =>
      yardControlClick(() => {
        markUserInteraction();
        handler();
      }),
    [markUserInteraction],
  );

  const updateRecord = useCallback(
    (patch: Partial<Assessment>) => {
      if (!key || !race || !runner) return;
      setData((prev) => {
        const base = prev[key] ?? emptyAssessment();
        const merged = mergeAssessment(patch, base);
        const next = { ...prev, [key]: merged };
        dataRef.current = next;
        if (!shouldSkipYardPersistence()) debouncedSnapshotSave();
        return next;
      });
    },
    [key, debouncedSnapshotSave, race, runner],
  );

  const tapPositive = (item: string) => {
    const v = record.positive[item];
    updateRecord({ positive: { ...record.positive, [item]: nextPositive(v) } });
  };

  const tapNegative = (item: { label: string }) => {
    const v = record.negative[item.label];
    updateRecord({ negative: { ...record.negative, [item.label]: nextNegative(v) } });
  };

  const selectGearLocation = (tile: GearTileCode, location: number) => {
    updateRecord({ gear: applyGearTileSelection(record.gear, tile, location) });
  };

  const selectWetOption = (field: "bodyType" | "feet", value: WetBodyType | WetFeet) => {
    const current = record.wet ?? {};
    const nextValue = current[field] === value ? undefined : value;
    const next = { ...current, [field]: nextValue };
    if (!next.bodyType && !next.feet) {
      updateRecord({ wet: undefined });
    } else {
      updateRecord({ wet: next });
    }
  };

  const { pos: totalPositive, neg: totalNegative, net } = totals(record);

  useEffect(() => {
    if (!race) return;
    if (race.runners.some((r) => r.no === selectedRunner)) return;
    setSelectedRunner(race.runners[0]?.no ?? 1);
  }, [race, selectedRunner]);

  const orderedRunners = useMemo(() => race?.runners ?? [], [race]);
  const runnerIndex = orderedRunners.findIndex((r) => r.no === selectedRunner);
  const safeRunnerIndex = runnerIndex >= 0 ? runnerIndex : 0;
  const canPrev = safeRunnerIndex > 0;
  const canNext = safeRunnerIndex >= 0 && safeRunnerIndex < orderedRunners.length - 1;

  const goPrev = useCallback(() => {
    if (!canPrev) return;
    setGearPicker(null);
    setSelectedRunner(orderedRunners[safeRunnerIndex - 1]!.no);
  }, [canPrev, orderedRunners, safeRunnerIndex]);

  const goNext = useCallback(() => {
    if (!canNext) return;
    setGearPicker(null);
    setSelectedRunner(orderedRunners[safeRunnerIndex + 1]!.no);
  }, [canNext, orderedRunners, safeRunnerIndex]);

  const selectRace = useCallback(
    (nextRaceId: string) => {
      userInteractedRef.current = true;
      setGearPicker(null);
      const nextRace = races.find((r) => r.id === nextRaceId) ?? races[0];
      if (!nextRace) return;
      setRaceId(nextRace.id);
      setSelectedRunner(nextRace.runners[0]?.no ?? 1);
    },
    [races],
  );

  bridgeHandlersRef.current = {
    onBridgeTap: markUserInteraction,
    selectRace: (raceId) => {
      markUserInteraction();
      selectRace(raceId);
    },
    selectRunner: (runnerNo) => {
      markUserInteraction();
      setGearPicker(null);
      setSelectedRunner(runnerNo);
    },
    goPrev: () => {
      markUserInteraction();
      goPrev();
    },
    goNext: () => {
      markUserInteraction();
      goNext();
    },
    tapAssessment: (factor) => {
      if (isPositiveAssessmentFactor(factor)) {
        handleAssessmentPress(`bridge-positive-${factor}`, () => tapPositive(factor));
      } else {
        handleAssessmentPress(`bridge-negative-${factor}`, () => tapNegative({ label: factor }));
      }
    },
  };

  useEffect(() => {
    if (!isIOS12()) return;
    const root = yardRootRef.current;
    if (!root) return;
    return installIOS12YardDomBridge(() => bridgeHandlersRef.current!, root);
  }, []);

  const handleExport = () => {
    void (async () => {
      try {
        const spState = meetingManifest
          ? loadResultedSpStateForMeeting(meetingManifest.meetingId)
          : null;
        const csv = buildAssessmentsExportCsv(races, data, (raceId, runnerNo) => {
          const raceNo = raceId.replace(/^R/i, "");
          return getOfficialSpForRunner(spState, raceNo, runnerNo);
        });
        await deliverMeetingExport("mounting-yard-assessments", csv);
      } catch (e) {
        console.error(e);
      }
    })();
  };

  const runMeetingImport = async (
    text: string,
    options: {
      fileName: string;
      importPath?: string;
      meetingFolderPath?: string;
      directoryHandle?: FileSystemDirectoryHandle;
    },
  ) => {
    const result = await importMeetingFromCsv(text, options);
    if (!result.sameMeeting) {
      await clearAllAssessments();
      dataRef.current = {};
      setData({});
    }
    setRaces(result.races);
    setRaceId(result.races[0]!.id);
    setSelectedRunner(result.races[0]!.runners[0]?.no ?? 1);
    const manifest = loadMeetingManifest();
    setMeetingLabel(formatMeetingDisplayLabel(manifest));
    setMeetingDate(manifest?.date ?? "");
    setMeetingManifest(manifest);
  };

  const handleImportMeetingFolder = async () => {
    if (!supportsDirectoryPicker()) {
      importRef.current?.click();
      return;
    }
    setImportError(null);
    try {
      const dir = await pickMeetingDirectory();
      const { file, name } = await readMeetingCsvFromDirectory(dir);
      const text = await file.text();
      const folderMeta = `meetings/${dir.name}`;
      await runMeetingImport(text, {
        fileName: name,
        meetingFolderPath: folderMeta,
        directoryHandle: dir,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error(e);
      setImportError(e instanceof Error ? e.message : "Import failed.");
    }
  };

  const handleImportFile = async (f: File | null) => {
    if (!f) return;
    setImportError(null);
    try {
      const text = await f.text();
      const webkitPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      await runMeetingImport(text, { fileName: f.name, importPath: webkitPath });
    } catch (e) {
      console.error(e);
      setImportError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const raceTabCols = Math.min(Math.max(races.length, 2), 8);

  return (
    <div
      ref={yardRootRef}
      data-yard-root
      className="min-h-[100dvh] bg-slate-100 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-slate-900"
    >
      <div className="mx-auto max-w-7xl space-y-3 p-3">
        <header className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Mounting Yard</h1>
            <p className="mt-1 text-lg text-slate-600">
              Autosaves on this device. Import meeting CSV here once — Speed Map and Race Day Bias follow.
            </p>
            {meetingLabel && <p className="mt-1 text-base font-medium text-slate-700">{meetingLabel}</p>}
            {saveState === "saving" && <p className="mt-1 text-base text-slate-500">Saving…</p>}
            {saveState === "error" && <p className="mt-1 text-base text-red-600">Could not save. Try again.</p>}
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end lg:shrink-0">
            <div data-yard-countdown>
              <YardNextRaceCountdown races={races} meetingDate={meetingDate || undefined} />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <input
              ref={importRef}
              type="file"
              accept=".csv,text/csv"
              className="yard-hidden-file-input hidden"
              onChange={(e) => void handleImportFile(e.target.files?.[0] ?? null)}
            />
            <YardButton
              variant="outline"
              className="rounded-3xl text-lg"
              onClick={() => void handleImportMeetingFolder()}
            >
              Import meeting folder
            </YardButton>
            <YardButton className="rounded-3xl text-lg" onClick={handleExport}>
              Export all assessments
            </YardButton>
            </div>
          </div>
        </header>

        {importError && (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-900">{importError}</div>
        )}

        {meetingManifest && races.length > 0 && (
          <ResultedSpStatusPanel
            meetingId={meetingManifest.meetingId}
            manifest={meetingManifest}
            races={races}
          />
        )}

        {races.length > 1 &&
          (isIOS12() ? (
            <div
              className="rounded-3xl bg-white p-2 shadow-sm"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${raceTabCols}, minmax(0, 1fr))`,
                gap: "0.5rem",
              }}
            >
              {races.map((r) => {
                const selected = raceId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    data-yard-action="select-race"
                    data-race-id={r.id}
                    data-race-no={r.id.replace(/^R/, "")}
                    style={IOS12_TAP_BUTTON_STYLE}
                    className={cn(
                      "yard-interactive min-h-[52px] w-full rounded-2xl px-4 text-lg font-semibold",
                      selected ? "bg-slate-900 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200",
                    )}
                    onClick={() => {
                      markUserInteraction();
                      selectRace(r.id);
                    }}
                  >
                    {r.id}
                  </button>
                );
              })}
            </div>
          ) : (
            <Tabs
              value={raceId}
              onValueChange={(v) => {
                markUserInteraction();
                selectRace(v);
              }}
            >
              <TabsList
                className="rounded-3xl bg-white p-2 shadow-sm"
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${raceTabCols}, minmax(0, 1fr))`,
                  gap: "0.5rem",
                }}
              >
                {races.map((r) => (
                  <TabsTrigger key={r.id} value={r.id} className="w-full rounded-2xl text-lg">
                    {r.id}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ))}

        <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
          <Card className="rounded-3xl shadow-sm lg:sticky lg:top-3 lg:z-0 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-lg font-bold leading-tight text-slate-800">{race?.title}</h2>
              <div className="space-y-2">
                {race &&
                  runners.map((r) => {
                    const rkey = makeKey(race.id, r.no);
                    const rec = data[rkey];
                    const { pos, neg, net } = totals(rec);
                    const active = selectedRunner === r.no;
                    const tint = runnerNetBackground(net);
                    return (
                      <button
                        key={r.no}
                        type="button"
                        data-yard-action="select-runner"
                        data-runner-id={String(r.no)}
                        {...(isIOS12()
                          ? {
                              style: IOS12_TAP_BUTTON_STYLE,
                              onClick: () => {
                                markUserInteraction();
                                setGearPicker(null);
                                setSelectedRunner(r.no);
                              },
                            }
                          : yardClick(`horse-${r.no}`, () => {
                              setGearPicker(null);
                              setSelectedRunner(r.no);
                            }))}
                        className={cn(
                          "yard-interactive w-full rounded-3xl border-2 p-4 text-left text-slate-900",
                          !isIOS12() && "transition active:scale-[0.99]",
                          tint,
                          active ? "border-slate-900 shadow-lg ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-100" : "border-slate-400/50",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-xl font-bold text-slate-900 shadow-sm backdrop-blur-sm">
                              {r.no}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xl font-bold leading-tight drop-shadow-sm">{r.horse}</div>
                              <div className="truncate text-base text-slate-800/90">
                                {r.jockey} · {r.odds}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
                            <span className="text-xl font-bold leading-none text-slate-900">net {formatNet(net)}</span>
                            <span className="text-sm font-semibold text-slate-800/90">
                              +{pos} −{neg}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </CardContent>
          </Card>

          <div
            ref={assessmentAreaRef}
            className={cn("relative space-y-4", !isIOS12() && "z-10 touch-manipulation")}
            data-yard-assessment="true"
            {...(!isIOS12()
              ? { onMouseDown: (e: React.MouseEvent) => closePhysicalPickerIfOutside(e.target) }
              : {})}
          >
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                    #{runner?.no} {runner?.horse}
                  </h2>
                  <p className="mt-2 text-lg text-slate-600">
                    Br {runner?.br} · {runner?.trainer} · {runner?.jockey} · {runner?.odds}
                  </p>
                  <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-800">
                    +{totalPositive} &nbsp; −{totalNegative} &nbsp; · net {net}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="space-y-2 p-3 sm:p-4">
                <h3 className="text-lg font-bold text-slate-900">Assessment</h3>
                {racedayCompactGroups.map((group) => (
                  <div
                    key={group.title}
                    className="rounded-xl border border-slate-200 bg-slate-50/90 p-2 shadow-sm"
                  >
                    <h4 className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-slate-600 sm:text-xs">
                      {group.title}
                    </h4>
                    {group.kind === "sweat" ? (
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-1 gap-1.5">
                          <AssessmentControl
                            className={cn(compactFactorBtn)}
                            yardFactor={SWEAT_POS_KEY}
                            onPress={() => handleAssessmentPress("positive-clean-plus", () => tapPositive(SWEAT_POS_KEY))}
                            pressProps={assessmentPress("positive-clean-plus", () => tapPositive(SWEAT_POS_KEY))}
                          >
                            <span>Clean +</span>
                            <span className={compactMarksPos}>{marks(record.positive[SWEAT_POS_KEY])}</span>
                          </AssessmentControl>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {SWEAT_NEG_ROW.map((key) => (
                            <AssessmentControl
                              key={key}
                              className={cn(compactFactorBtn)}
                              yardFactor={key}
                              onPress={() => handleAssessmentPress(`negative-sweat-${key}`, () => tapNegative({ label: key }))}
                              pressProps={assessmentPress(`negative-sweat-${key}`, () => tapNegative({ label: key }))}
                            >
                              <span>{key}</span>
                              <span className={compactMarksNeg}>{marks(record.negative[key])}</span>
                            </AssessmentControl>
                          ))}
                        </div>
                        <p className="text-[0.7rem] leading-snug text-slate-600 sm:text-xs">{SWEAT_LEGEND}</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {group.positives.length > 0 && (
                          <div
                            className={cn(
                              "grid gap-1.5",
                              group.positives.length === 1 ? "grid-cols-1" : "grid-cols-2",
                            )}
                          >
                            {group.positives.map((key) => (
                              <AssessmentControl
                                key={key}
                                className={cn(compactFactorBtn)}
                                yardFactor={key}
                                onPress={() => handleAssessmentPress(`positive-${key}`, () => tapPositive(key))}
                                pressProps={assessmentPress(`positive-${key}`, () => tapPositive(key))}
                              >
                                <span>{key}</span>
                                <span className={compactMarksPos}>{marks(record.positive[key])}</span>
                              </AssessmentControl>
                            ))}
                          </div>
                        )}
                        {group.negatives.length > 0 && (
                          <div
                            className={cn(
                              "grid gap-1.5",
                              group.negatives.length >= 3 ? "grid-cols-3" : "grid-cols-2",
                            )}
                          >
                            {group.negatives.map((key) => (
                              <AssessmentControl
                                key={key}
                                className={cn(compactFactorBtn)}
                                yardFactor={key}
                                onPress={() => handleAssessmentPress(`negative-${key}`, () => tapNegative({ label: key }))}
                                pressProps={assessmentPress(`negative-${key}`, () => tapNegative({ label: key }))}
                              >
                                <span className="break-words">{key}</span>
                                <span className={compactMarksNeg}>{marks(record.negative[key])}</span>
                              </AssessmentControl>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-sm">
              <CardContent className="space-y-4 p-5">
                <h3 className="text-xl font-bold">Physical</h3>
                <div ref={gearTilesRef} className="grid grid-cols-2 gap-4">
                  {gearTiles.map((item) => {
                    const locs = record.gear[item.code];
                    const hasLocs = (locs?.length ?? 0) > 0;
                    const open = gearPicker === item.code;
                    return (
                      <div key={item.code} className="relative">
                        <AssessmentControl
                          variant={hasLocs ? "default" : "outline"}
                          className="relative h-auto min-h-[6.25rem] w-full flex-col justify-center gap-2 rounded-3xl py-5 text-lg"
                          onPress={() =>
                            handleAssessmentPress(`gear-${item.code}`, () =>
                              setGearPicker((p) => (p === item.code ? null : item.code)),
                            )
                          }
                          pressProps={assessmentPress(`gear-${item.code}`, () =>
                            setGearPicker((p) => (p === item.code ? null : item.code)),
                          )}
                        >
                          <span className="text-2xl font-bold tracking-tight">{item.code}</span>
                          <span className="text-center text-base leading-snug">{item.label}</span>
                          {renderPhysicalValue(locs)}
                        </AssessmentControl>
                        {open && (
                          <div
                            className="absolute left-0 right-0 top-full z-[60] mt-2 space-y-1 rounded-2xl border-2 border-slate-200 bg-white p-2 shadow-lg"
                            role="listbox"
                            aria-label={`${item.code} location`}
                          >
                            {gearLocations.map(({ num, label }) => (
                              <button
                                key={num}
                                type="button"
                                style={isIOS12() ? IOS12_TAP_BUTTON_STYLE : undefined}
                                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-lg font-semibold hover:bg-slate-100 active:bg-slate-200 ${
                                  locs?.includes(num) ? "bg-slate-100" : ""
                                } ${isIOS12() ? "" : "touch-manipulation transition"}`}
                                {...(isIOS12()
                                  ? {
                                      onClick: () =>
                                        handleAssessmentPress(`gear-${item.code}-loc-${num}`, () =>
                                          selectGearLocation(item.code, num),
                                        ),
                                    }
                                  : {
                                      role: "option",
                                      "aria-selected": locs?.includes(num) ?? false,
                                      ...assessmentPress(`gear-${item.code}-loc-${num}`, () =>
                                        selectGearLocation(item.code, num),
                                      ),
                                    })}
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                                  {num}
                                </span>
                                <span>{label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(() => {
                    const wet = record.wet;
                    const hasWet = wetIsSet(wet);
                    const shorthand = wetShorthand(wet);
                    const open = gearPicker === "WET";
                    return (
                      <div key={wetTile.code} className="relative">
                        <AssessmentControl
                          variant={hasWet ? "default" : "outline"}
                          className="relative h-auto min-h-[6.25rem] w-full flex-col justify-center gap-2 rounded-3xl py-5 text-lg"
                          onPress={() =>
                            handleAssessmentPress("gear-wet", () => setGearPicker((p) => (p === "WET" ? null : "WET")))
                          }
                          pressProps={assessmentPress("gear-wet", () => setGearPicker((p) => (p === "WET" ? null : "WET")))}
                        >
                          <span className="text-2xl font-bold tracking-tight">
                            {wetTile.code}
                            {hasWet ? " ✓" : ""}
                          </span>
                          <span className="text-center text-base leading-snug">{wetTile.label}</span>
                          {shorthand && (
                            <span className="text-sm font-semibold text-slate-700">{shorthand}</span>
                          )}
                        </AssessmentControl>
                        {open && (
                          <div
                            className="absolute left-0 right-0 top-full z-[60] mt-2 max-h-[min(70vh,28rem)] space-y-3 overflow-y-auto rounded-2xl border-2 border-slate-200 bg-white p-3 shadow-lg"
                            role="dialog"
                            aria-label="Wet suitability"
                          >
                            <div>
                              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                                Body type
                              </p>
                              <div className="space-y-1">
                                {WET_BODY_TYPES.map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    style={isIOS12() ? IOS12_TAP_BUTTON_STYLE : undefined}
                                    className={cn(
                                      "flex w-full rounded-xl px-3 py-2.5 text-left text-base font-semibold hover:bg-slate-100 active:bg-slate-200",
                                      !isIOS12() && "touch-manipulation transition",
                                      wet?.bodyType === opt.value && "bg-slate-100 ring-2 ring-slate-900",
                                    )}
                                    {...(isIOS12()
                                      ? {
                                          onClick: () =>
                                            handleAssessmentPress(`wet-body-${opt.value}`, () =>
                                              selectWetOption("bodyType", opt.value),
                                            ),
                                        }
                                      : assessmentPress(`wet-body-${opt.value}`, () =>
                                          selectWetOption("bodyType", opt.value),
                                        ))}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Feet</p>
                              <div className="space-y-1">
                                {WET_FEET.map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    style={isIOS12() ? IOS12_TAP_BUTTON_STYLE : undefined}
                                    className={cn(
                                      "flex w-full rounded-xl px-3 py-2.5 text-left text-base font-semibold hover:bg-slate-100 active:bg-slate-200",
                                      !isIOS12() && "touch-manipulation transition",
                                      wet?.feet === opt.value && "bg-slate-100 ring-2 ring-slate-900",
                                    )}
                                    {...(isIOS12()
                                      ? {
                                          onClick: () =>
                                            handleAssessmentPress(`wet-feet-${opt.value}`, () =>
                                              selectWetOption("feet", opt.value),
                                            ),
                                        }
                                      : assessmentPress(`wet-feet-${opt.value}`, () =>
                                          selectWetOption("feet", opt.value),
                                        ))}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <label className="block">
                  <span className="mb-2 block text-lg font-semibold text-slate-800">Notes</span>
                  <textarea
                    value={record.notes}
                    onChange={(e) => updateRecord({ notes: e.target.value })}
                    placeholder="Quick note…"
                    rows={3}
                    className="w-full rounded-3xl border-2 border-slate-200 bg-white p-4 text-lg outline-none focus:border-slate-900"
                  />
                </label>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <nav
        data-yard-bottom-nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-slate-200 bg-white"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Runner navigation"
      >
        <div className="mx-auto flex max-w-7xl items-stretch gap-3 px-3 py-3">
          <YardButton
            variant="outline"
            className="min-h-[3.75rem] flex-1 rounded-3xl text-xl font-bold"
            disabled={!canPrev}
            tapDebugAlways
            yardAction="prev-runner"
            onClick={() => {
              markUserInteraction();
              goPrev();
            }}
          >
            ← Previous
          </YardButton>
          <YardButton
            className="min-h-[3.75rem] flex-1 rounded-3xl text-xl font-bold"
            disabled={!canNext}
            tapDebugAlways
            yardAction="next-runner"
            onClick={() => {
              markUserInteraction();
              goNext();
            }}
          >
            Next →
          </YardButton>
        </div>
      </nav>
    </div>
  );
}
