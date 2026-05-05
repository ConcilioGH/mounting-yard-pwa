"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_RACES, gearItems, negativeItems, positiveItems } from "@/lib/constants";
import {
  clearAllAssessments,
  loadAllAssessments,
  loadAllRaces,
  mergeAssessment,
  replaceAllAssessments,
  saveRaces,
  seedRacesIfEmpty,
} from "@/lib/db";
import { buildAssessmentsExportCsv, downloadTextFile, parseRacesCsv } from "@/lib/csv";
import type { Assessment, Race, Runner } from "@/lib/types";
import { emptyAssessment, makeKey, marks, nextNegative, nextPositive } from "@/lib/utils";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

function totals(a: Assessment | undefined) {
  const pos = a
    ? Object.values(a.positive).reduce((sum, v) => sum + Math.max(0, v ?? 0), 0)
    : 0;
  const neg = a
    ? Object.values(a.negative).reduce((sum, v) => sum + Math.abs(Math.min(0, v ?? 0)), 0)
    : 0;
  return { pos, neg, net: pos - neg };
}

export default function MountingYardApp() {
  const [hydrated, setHydrated] = useState(false);
  const [races, setRaces] = useState<Race[]>(DEFAULT_RACES);
  const [raceId, setRaceId] = useState(DEFAULT_RACES[0]?.id ?? "R1");
  const [selectedRunner, setSelectedRunner] = useState(DEFAULT_RACES[0]?.runners[0]?.no ?? 1);
  const [data, setData] = useState<Record<string, Assessment>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef<Record<string, Assessment>>({});
  const keyRef = useRef<string>("");
  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const persistSnapshot = useCallback(() => {
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
    void (async () => {
      try {
        await seedRacesIfEmpty();
        const [loadedRaces, loadedAssessments] = await Promise.all([loadAllRaces(), loadAllAssessments()]);
        if (loadedRaces.length) {
          setRaces(loadedRaces);
          const first = loadedRaces[0];
          setRaceId(first.id);
          setSelectedRunner(first.runners[0]?.no ?? 1);
        }
        dataRef.current = loadedAssessments;
        setData(loadedAssessments);
      } catch (e) {
        console.error(e);
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const race = races.find((r) => r.id === raceId) ?? races[0];
  const runners = useMemo(() => race?.runners ?? [], [race]);

  const runner: Runner | undefined = race?.runners.find((r) => r.no === selectedRunner) ?? race?.runners[0];

  const key = race && runner ? makeKey(race.id, runner.no) : "";
  const record = key ? data[key] ?? emptyAssessment() : emptyAssessment();

  useEffect(() => {
    if (!key) return;
    const prev = prevKeyRef.current;
    prevKeyRef.current = key;
    keyRef.current = key;
    if (prev && prev !== key) {
      void persistSnapshot();
    }
  }, [key, persistSnapshot]);

  const updateRecord = useCallback(
    (patch: Partial<Assessment>) => {
      if (!key || !race || !runner) return;
      setData((prev) => {
        const base = prev[key] ?? emptyAssessment();
        const merged = mergeAssessment(patch, base);
        const next = { ...prev, [key]: merged };
        dataRef.current = next;
        debouncedSnapshotSave();
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

  const toggleGear = (code: string) => {
    updateRecord({ gear: { ...record.gear, [code]: !record.gear[code] } });
  };

  const { pos: totalPositive, neg: totalNegative, net } = totals(record);

  const orderedRunners = race?.runners ?? [];
  const runnerIndex = orderedRunners.findIndex((r) => r.no === selectedRunner);
  const canPrev = runnerIndex > 0;
  const canNext = runnerIndex >= 0 && runnerIndex < orderedRunners.length - 1;

  const goPrev = useCallback(() => {
    if (!canPrev) return;
    setSelectedRunner(orderedRunners[runnerIndex - 1]!.no);
  }, [canPrev, orderedRunners, runnerIndex]);

  const goNext = useCallback(() => {
    if (!canNext) return;
    setSelectedRunner(orderedRunners[runnerIndex + 1]!.no);
  }, [canNext, orderedRunners, runnerIndex]);

  const handleExport = () => {
    try {
      const csv = buildAssessmentsExportCsv(races, data);
      downloadTextFile(`mounting-yard-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch (e) {
      console.error(e);
    }
  };

  const handleImportFile = async (f: File | null) => {
    if (!f) return;
    setImportError(null);
    try {
      const text = await f.text();
      const parsed = parseRacesCsv(text);
      await saveRaces(parsed);
      await clearAllAssessments();
      setRaces(parsed);
      setRaceId(parsed[0]!.id);
      setSelectedRunner(parsed[0]!.runners[0]?.no ?? 1);
      dataRef.current = {};
      setData({});
    } catch (e) {
      console.error(e);
      setImportError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const raceTabCols = Math.min(Math.max(races.length, 2), 8);

  if (!hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-xl text-slate-600">Loading…</div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-100 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-slate-900">
      <div className="mx-auto max-w-7xl space-y-3 p-3">
        <header className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Mounting Yard</h1>
            <p className="mt-1 text-lg text-slate-600">Autosaves on this device. Export CSV after the meeting.</p>
            {saveState === "saving" && <p className="mt-1 text-base text-slate-500">Saving…</p>}
            {saveState === "error" && <p className="mt-1 text-base text-red-600">Could not save. Try again.</p>}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <input
              ref={importRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void handleImportFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="touch" className="rounded-3xl text-lg" onClick={() => importRef.current?.click()}>
              Import races (CSV)
            </Button>
            <Button type="button" size="touch" className="rounded-3xl text-lg" onClick={handleExport}>
              Export all assessments
            </Button>
          </div>
        </header>

        {importError && (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-900">{importError}</div>
        )}

        {races.length > 1 && (
          <Tabs
            value={raceId}
            onValueChange={(v) => {
              const nextRace = races.find((r) => r.id === v) ?? races[0];
              if (!nextRace) return;
              setRaceId(nextRace.id);
              setSelectedRunner(nextRace.runners[0]?.no ?? 1);
            }}
          >
            <TabsList
              className="rounded-3xl bg-white p-2 shadow-sm"
              style={{ display: "grid", gridTemplateColumns: `repeat(${raceTabCols}, minmax(0, 1fr))`, gap: "0.5rem" }}
            >
              {races.map((r) => (
                <TabsTrigger key={r.id} value={r.id} className="w-full rounded-2xl text-lg">
                  {r.id}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
          <Card className="rounded-3xl shadow-sm lg:sticky lg:top-3 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-lg font-bold leading-tight text-slate-800">{race?.title}</h2>
              <div className="space-y-2">
                {race &&
                  runners.map((r) => {
                    const rkey = makeKey(race.id, r.no);
                    const rec = data[rkey];
                    const { pos, neg } = totals(rec);
                    const active = selectedRunner === r.no;
                    return (
                      <button
                        key={r.no}
                        type="button"
                        onClick={() => setSelectedRunner(r.no)}
                        className={`w-full rounded-3xl border-2 p-4 text-left transition active:scale-[0.99] ${
                          active ? "border-slate-900 bg-slate-900 text-white shadow-md" : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold ${
                                active ? "bg-white text-slate-900" : "bg-slate-100 text-slate-900"
                              }`}
                            >
                              {r.no}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xl font-bold leading-tight">{r.horse}</div>
                              <div className={`truncate text-base ${active ? "text-slate-200" : "text-slate-600"}`}>
                                {r.jockey} · {r.odds}
                              </div>
                            </div>
                          </div>
                          <div className={`shrink-0 text-lg font-bold tabular-nums ${active ? "text-white" : "text-slate-700"}`}>
                            +{pos} −{neg}
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
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

            <Card className="rounded-3xl shadow-sm">
              <CardContent className="space-y-3 p-5">
                <h3 className="text-xl font-bold">Positive</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {positiveItems.map((item) => (
                    <Button
                      key={item}
                      type="button"
                      variant="outline"
                      size="touch"
                      onClick={() => tapPositive(item)}
                      className="h-auto min-h-[4.5rem] justify-between rounded-3xl px-5 py-4 text-left text-lg whitespace-normal"
                    >
                      <span className="pr-2">{item}</span>
                      <span className="text-3xl font-bold text-green-700">{marks(record.positive[item])}</span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-sm">
              <CardContent className="space-y-3 p-5">
                <h3 className="text-xl font-bold">Negative</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {negativeItems.map((item) => (
                    <Button
                      key={item.label}
                      type="button"
                      variant="outline"
                      size="touch"
                      onClick={() => tapNegative(item)}
                      className="h-auto min-h-[4.75rem] justify-between rounded-3xl px-5 py-4 text-left text-lg whitespace-normal"
                    >
                      <span className="pr-2">{item.label}</span>
                      <span className="text-3xl font-bold text-red-700">{marks(record.negative[item.label])}</span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-sm">
              <CardContent className="space-y-4 p-5">
                <h3 className="text-xl font-bold">Gear</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                  {gearItems.map((item) => (
                    <Button
                      key={item.code}
                      type="button"
                      size="touch"
                      variant={record.gear[item.code] ? "default" : "outline"}
                      onClick={() => toggleGear(item.code)}
                      className="h-auto min-h-[4.5rem] flex-col gap-1 rounded-3xl py-4 text-base"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-current text-lg font-bold">
                        {item.code}
                      </span>
                      <span className="text-center leading-snug">{item.label}</span>
                    </Button>
                  ))}
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
        className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-slate-200 bg-white"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Runner navigation"
      >
        <div className="mx-auto flex max-w-7xl items-stretch gap-3 px-3 py-3">
          <Button
            type="button"
            size="touch"
            variant="outline"
            className="min-h-[3.75rem] flex-1 rounded-3xl text-xl font-bold"
            disabled={!canPrev}
            onClick={goPrev}
          >
            ← Previous
          </Button>
          <Button type="button" size="touch" className="min-h-[3.75rem] flex-1 rounded-3xl text-xl font-bold" disabled={!canNext} onClick={goNext}>
            Next →
          </Button>
        </div>
      </nav>
    </div>
  );
}
