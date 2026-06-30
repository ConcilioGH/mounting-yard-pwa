"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MeetingManifest } from "@/lib/meeting-coordination";
import type { Race } from "@/lib/types";
import {
  buildResultedSpSchedule,
  computeDisplayRaceStatus,
  startResultedSpPoller,
  type ResultedSpPollerHandle,
} from "@/lib/resulted-sp/poller";
import { loadResultedSpStateForMeeting } from "@/lib/resulted-sp/storage";
import { RESULTED_SP_UPDATED_EVENT, type ResultedSpMeetingState } from "@/lib/resulted-sp/types";

function formatImportedTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, " ")
    .toLowerCase();
}

function statusLabel(status: string, importedAt?: string, source?: string): string {
  const sourceSuffix = source ? ` · ${source}` : "";
  switch (status) {
    case "waiting":
      return "Waiting";
    case "checking":
      return `Checking${sourceSuffix}`.trim();
    case "imported":
      return `Imported ${formatImportedTime(importedAt)}${sourceSuffix}`.trim();
    case "late":
      return `Late / retrying${sourceSuffix}`.trim();
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

type ResultedSpStatusPanelProps = {
  meetingId: string;
  manifest: MeetingManifest;
  races: Race[];
  compact?: boolean;
};

export function ResultedSpStatusPanel({
  meetingId,
  manifest,
  races,
  compact = false,
}: ResultedSpStatusPanelProps) {
  const [state, setState] = useState<ResultedSpMeetingState>(() =>
    loadResultedSpStateForMeeting(meetingId),
  );
  const [poller, setPoller] = useState<ResultedSpPollerHandle | null>(null);
  const [busyRace, setBusyRace] = useState<string | null>(null);

  const schedule = useMemo(
    () => buildResultedSpSchedule(races, manifest.date),
    [races, manifest.date],
  );

  useEffect(() => {
    setState(loadResultedSpStateForMeeting(meetingId));
  }, [meetingId]);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ meetingId?: string }>).detail;
      if (detail?.meetingId && detail.meetingId !== meetingId) return;
      setState(loadResultedSpStateForMeeting(meetingId));
    };
    window.addEventListener(RESULTED_SP_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(RESULTED_SP_UPDATED_EVENT, onUpdate);
  }, [meetingId]);

  useEffect(() => {
    if (!meetingId || !races.length) return;
    const handle = startResultedSpPoller({
      meetingId,
      manifest,
      races,
      onStateChange: setState,
    });
    setPoller(handle);
    return () => handle.stop();
  }, [meetingId, manifest, races]);

  const runAction = useCallback(
    async (raceNo: string, action: "check" | "import" | "reset") => {
      if (!poller) return;
      setBusyRace(raceNo);
      try {
        if (action === "check") await poller.checkNow(raceNo);
        else if (action === "import") await poller.importRaceNow(raceNo);
        else poller.resetRace(raceNo);
        setState(loadResultedSpStateForMeeting(meetingId));
      } finally {
        setBusyRace(null);
      }
    },
    [poller, meetingId],
  );

  if (!schedule.length) return null;

  const now = new Date();

  return (
    <section
      className={
        compact
          ? "rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm"
          : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      }
      aria-label="Resulted SP import status"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">Resulted SP</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!poller || busyRace != null}
          onClick={() => void poller?.checkNow()}
        >
          Check now
        </Button>
      </div>
      <ul className="space-y-2">
        {schedule.map((entry) => {
          const raceState = state.races[entry.raceNo];
          const displayStatus = computeDisplayRaceStatus(state, entry.raceNo, schedule, now);
          const label = statusLabel(displayStatus, raceState?.importedAt, raceState?.source);
          const isBusy = busyRace === entry.raceNo;
          return (
            <li
              key={entry.raceNo}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5"
            >
              <span className="font-medium text-slate-800">
                {entry.raceLabel} {label}
              </span>
              <span className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy || !poller}
                  onClick={() => void runAction(entry.raceNo, "check")}
                >
                  Check
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy || !poller}
                  onClick={() => void runAction(entry.raceNo, "import")}
                >
                  Import
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy || !poller}
                  onClick={() => void runAction(entry.raceNo, "reset")}
                >
                  Reset
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
