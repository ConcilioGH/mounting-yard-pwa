"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_RACES,
  racedayCompactGroups,
  SWEAT_LEGEND,
  SWEAT_NEG_ROW,
  SWEAT_POS_KEY,
} from "@/lib/constants";
import { APP_BUILD_VERSION } from "@/lib/build-version";
import { MEETING_MANIFEST_STORAGE_KEY } from "@/lib/meeting-coordination";
import type { Assessment, Race } from "@/lib/types";
import { emptyAssessment, makeKey, marks, nextNegative, nextPositive } from "@/lib/utils";

const YARD_LITE_RACES_KEY = "yard-lite-races-v1";

function totals(a: Assessment | undefined) {
  const pos = a
    ? Object.values(a.positive).reduce((sum, v) => sum + Math.max(0, v ?? 0), 0)
    : 0;
  const neg = a
    ? Object.values(a.negative).reduce((sum, v) => sum + Math.abs(Math.min(0, v ?? 0)), 0)
    : 0;
  return { pos, neg, net: pos - neg };
}

function formatNet(n: number) {
  return `${n > 0 ? "+" : ""}${n}`;
}

const btnClass =
  "mb-2 mr-2 min-h-[52px] rounded-xl border-2 border-slate-400 bg-white px-4 py-3 text-left text-lg font-semibold text-slate-900";

const btnActiveClass = "border-slate-900 bg-slate-900 text-white";

const factorBtnClass =
  "mb-2 min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-900";

export default function YardLiteApp() {
  const [tapCount, setTapCount] = useState(0);
  const [races, setRaces] = useState<Race[]>(DEFAULT_RACES);
  const [raceId, setRaceId] = useState(DEFAULT_RACES[0]?.id ?? "R1");
  const [selectedRunner, setSelectedRunner] = useState(DEFAULT_RACES[0]?.runners[0]?.no ?? 1);
  const [data, setData] = useState<Record<string, Assessment>>({});
  const [meetingLabel, setMeetingLabel] = useState("");

  useEffect(() => {
    if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        void Promise.all(regs.map((r) => r.unregister()));
      });
    }
    document.getElementById("ios12-startup-failure")?.remove();

    try {
      const manifestRaw = localStorage.getItem(MEETING_MANIFEST_STORAGE_KEY);
      if (manifestRaw) {
        const manifest = JSON.parse(manifestRaw) as { trackName?: string; date?: string };
        const label = [manifest.date, manifest.trackName].filter(Boolean).join(" · ");
        if (label) setMeetingLabel(label);
      }
    } catch {
      /* ignore */
    }

    try {
      const racesRaw = localStorage.getItem(YARD_LITE_RACES_KEY);
      if (racesRaw) {
        const parsed = JSON.parse(racesRaw) as Race[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRaces(parsed);
          setRaceId(parsed[0]!.id);
          setSelectedRunner(parsed[0]!.runners[0]?.no ?? 1);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const bump = useCallback((action: () => void) => {
    setTapCount((count) => count + 1);
    action();
  }, []);

  const race = races.find((r) => r.id === raceId) ?? races[0];
  const runner = race?.runners.find((r) => r.no === selectedRunner) ?? race?.runners[0];
  const key = race && runner ? makeKey(race.id, runner.no) : "";
  const record = key ? data[key] ?? emptyAssessment() : emptyAssessment();
  const { net } = totals(record);

  const selectRace = useCallback(
    (id: string) => {
      const next = races.find((r) => r.id === id) ?? races[0];
      if (!next) return;
      setRaceId(next.id);
      setSelectedRunner(next.runners[0]?.no ?? 1);
    },
    [races],
  );

  const updateRecord = useCallback(
    (patch: Partial<Assessment>) => {
      if (!key) return;
      setData((prev) => {
        const base = prev[key] ?? emptyAssessment();
        const next: Assessment = {
          ...base,
          ...patch,
          positive: patch.positive ?? base.positive,
          negative: patch.negative ?? base.negative,
          gear: patch.gear ?? base.gear,
          wet: patch.wet ?? base.wet,
          notes: patch.notes ?? base.notes,
          updatedAt: new Date().toISOString(),
        };
        return { ...prev, [key]: next };
      });
    },
    [key],
  );

  const tapPositive = (item: string) => {
    const v = record.positive[item];
    updateRecord({ positive: { ...record.positive, [item]: nextPositive(v) } });
  };

  const tapNegative = (item: string) => {
    const v = record.negative[item];
    updateRecord({ negative: { ...record.negative, [item]: nextNegative(v) } });
  };

  const raceTabCols = useMemo(
    () => Math.min(Math.max(races.length, 2), 6),
    [races.length],
  );

  return (
    <div style={{ padding: 12, paddingBottom: 80, fontFamily: "-apple-system, sans-serif" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>Mounting Yard Lite</h1>
        <p style={{ margin: "0 0 8px", fontSize: 14, color: "#475569" }}>
          iOS 12 trackside mode · Build {APP_BUILD_VERSION}
        </p>
        {meetingLabel ? (
          <p style={{ margin: "0 0 8px", fontSize: 14, color: "#334155" }}>{meetingLabel}</p>
        ) : null}
        <div
          style={{
            background: "#fef2f2",
            border: "2px solid #ef4444",
            borderRadius: 12,
            padding: 12,
            fontSize: 16,
            lineHeight: 1.5,
          }}
        >
          <div>
            <strong>Tap count:</strong> {tapCount}
          </div>
          <div>
            <strong>Selected race:</strong> {raceId}
          </div>
          <div>
            <strong>Selected runner:</strong> {runner ? `#${runner.no} ${runner.horse}` : "—"}
          </div>
          <div>
            <strong>Score:</strong> {formatNet(net)}
          </div>
        </div>
      </header>

      {races.length > 1 ? (
        <section style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Races</h2>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${raceTabCols}, 1fr)`, gap: 8 }}>
            {races.map((r) => (
              <button
                key={r.id}
                type="button"
                className={raceId === r.id ? `${btnClass} ${btnActiveClass}` : btnClass}
                onClick={() => bump(() => selectRace(r.id))}
              >
                {r.id}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{race?.title}</h2>
        {race?.runners.map((r) => {
          const rkey = makeKey(race.id, r.no);
          const rec = data[rkey];
          const { net: rnet } = totals(rec);
          const active = selectedRunner === r.no;
          return (
            <button
              key={r.no}
              type="button"
              className={active ? `${btnClass} ${btnActiveClass}` : btnClass}
              style={{ display: "block", width: "100%" }}
              onClick={() =>
                bump(() => {
                  setSelectedRunner(r.no);
                })
              }
            >
              #{r.no} {r.horse} · net {formatNet(rnet)}
            </button>
          );
        })}
      </section>

      {runner ? (
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            #{runner.no} {runner.horse}
          </h2>
          {racedayCompactGroups.map((group) => (
            <div key={group.title} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#64748b" }}>
                {group.title}
              </h3>
              {group.kind === "sweat" ? (
                <>
                  <button
                    type="button"
                    className={factorBtnClass}
                    onClick={() => bump(() => tapPositive(SWEAT_POS_KEY))}
                  >
                    Clean + {marks(record.positive[SWEAT_POS_KEY])}
                  </button>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {SWEAT_NEG_ROW.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={factorBtnClass}
                        onClick={() => bump(() => tapNegative(k))}
                      >
                        {k} {marks(record.negative[k])}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{SWEAT_LEGEND}</p>
                </>
              ) : (
                <>
                  {group.positives.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={factorBtnClass}
                      onClick={() => bump(() => tapPositive(k))}
                    >
                      {k} {marks(record.positive[k])}
                    </button>
                  ))}
                  {group.negatives.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={factorBtnClass}
                      onClick={() => bump(() => tapNegative(k))}
                    >
                      {k} {marks(record.negative[k])}
                    </button>
                  ))}
                </>
              )}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
