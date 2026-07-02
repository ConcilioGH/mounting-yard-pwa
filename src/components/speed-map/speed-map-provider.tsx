"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  emptySpeedMapSession,
  saveSpeedMapToStorage,
  type SpeedMapSessionState,
} from "@/lib/speed-map-persistence";
import {
  MEETING_IMPORTED_EVENT,
  MEETING_MANIFEST_STORAGE_KEY,
  loadMeetingManifest,
} from "@/lib/meeting-coordination";
import {
  ensureActiveMeetingSynced,
  emptySpeedMapSessionForManifest,
  loadSpeedMapSessionForManifest,
  safeReconcileSpeedMapSession,
} from "@/lib/active-meeting-session";
import { clearSpeedMapLocalStorage } from "@/lib/speed-map-storage";
import type { RaceMapStateEntry } from "@/lib/speed-map";
import {
  logLoadingState,
  normalizeErrorMessage,
  reportStartupFailure,
} from "@/lib/startup-diagnostics";
import { useHydrationStageOptional } from "@/components/hydration-stage-tracker";

type SpeedMapContextValue = SpeedMapSessionState & {
  hydrated: boolean;
  setMeetingTrack: (value: string) => void;
  setMeetingGoing: (value: string) => void;
  setMeetingRail: (value: string) => void;
  setRaceMap: React.Dispatch<React.SetStateAction<Record<string, RaceMapStateEntry>>>;
  setRaceOrder: React.Dispatch<React.SetStateAction<string[]>>;
  setActiveRaceNo: React.Dispatch<React.SetStateAction<string>>;
  setSelectedRunnerIds: React.Dispatch<React.SetStateAction<string[]>>;
  setFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
  setPressureOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  persistNow: (statusMessage?: string) => void;
  loadFromStorage: () => boolean;
  resetMeeting: () => void;
  applySession: (session: SpeedMapSessionState) => void;
};

const SpeedMapContext = createContext<SpeedMapContextValue | null>(null);

export function SpeedMapProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SpeedMapSessionState>(emptySpeedMapSession);
  const [hydrated, setHydrated] = useState(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const hydrationStage = useHydrationStageOptional();
  const markStageRef = useRef(hydrationStage?.markStage);
  markStageRef.current = hydrationStage?.markStage;

  const applyManifestSession = useCallback(() => {
    try {
      const manifest = loadMeetingManifest();
      const loaded = loadSpeedMapSessionForManifest(manifest);
      if (loaded) {
        const next = safeReconcileSpeedMapSession(loaded);
        setSession(next);
        console.log("[meeting-sync] speedmap active meeting", {
          meetingId: next.meetingId || manifest?.meetingId || null,
          manifestMeetingId: manifest?.meetingId ?? null,
          raceCount: next.raceOrder?.length ?? 0,
        });
        return;
      }
      if (manifest) {
        const empty = emptySpeedMapSessionForManifest(manifest);
        setSession(empty);
        console.log("[meeting-sync] speedmap active meeting", {
          meetingId: empty.meetingId || manifest.meetingId,
          manifestMeetingId: manifest.meetingId,
          raceCount: 0,
        });
        return;
      }
      setSession(emptySpeedMapSession());
    } catch (error) {
      console.warn("[speed-map] session apply failed:", normalizeErrorMessage(error));
      reportStartupFailure("speed-map-session-apply", error);
      setSession(emptySpeedMapSession());
    }
  }, []);

  const runMeetingSync = useCallback(() => {
    void ensureActiveMeetingSynced()
      .then(() => applyManifestSession())
      .catch((error) => {
        console.warn("[speed-map] meeting sync failed:", normalizeErrorMessage(error));
        reportStartupFailure("speed-map-meeting-sync", error);
        applyManifestSession();
      });
  }, [applyManifestSession]);

  useEffect(() => {
    logLoadingState("SpeedMapProvider", true, "hydrated=false");
    markStageRef.current?.("B", "SpeedMapProvider mounted");

    let cancelled = false;
    void ensureActiveMeetingSynced()
      .then(() => {
        if (cancelled) return;
        applyManifestSession();
        markStageRef.current?.("C", "localStorage read complete");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[speed-map] hydrate sync failed:", normalizeErrorMessage(error));
        reportStartupFailure("speed-map-provider-hydrate", error);
        applyManifestSession();
      })
      .finally(() => {
        if (cancelled) return;
        logLoadingState("SpeedMapProvider", false, "hydrated=true");
        setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [applyManifestSession]);

  useEffect(() => {
    const onMeetingImported = () => runMeetingSync();
    window.addEventListener(MEETING_IMPORTED_EVENT, onMeetingImported);
    const onStorage = (event: StorageEvent) => {
      if (event.key === MEETING_MANIFEST_STORAGE_KEY) {
        runMeetingSync();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MEETING_IMPORTED_EVENT, onMeetingImported);
      window.removeEventListener("storage", onStorage);
    };
  }, [runMeetingSync]);

  const persistNow = useCallback((statusMessage?: string) => {
    saveSpeedMapToStorage(sessionRef.current);
    return statusMessage;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      saveSpeedMapToStorage(sessionRef.current);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [session, hydrated]);

  const loadFromStorage = useCallback(() => {
    try {
      const manifest = loadMeetingManifest();
      const loaded = loadSpeedMapSessionForManifest(manifest);
      if (!loaded) return false;
      setSession(safeReconcileSpeedMapSession(loaded));
      return true;
    } catch (error) {
      console.warn("[speed-map] load from storage failed:", normalizeErrorMessage(error));
      return false;
    }
  }, []);

  const resetMeeting = useCallback(() => {
    clearSpeedMapLocalStorage();
    setSession(emptySpeedMapSession());
  }, []);

  const applySession = useCallback((next: SpeedMapSessionState) => {
    setSession(next);
  }, []);

  const setMeetingTrack = useCallback((value: string) => {
    setSession((s) => ({ ...s, meetingTrack: value }));
  }, []);

  const setMeetingGoing = useCallback((value: string) => {
    setSession((s) => ({ ...s, meetingGoing: value }));
  }, []);

  const setMeetingRail = useCallback((value: string) => {
    setSession((s) => ({ ...s, meetingRail: value }));
  }, []);

  const setRaceMap: React.Dispatch<React.SetStateAction<Record<string, RaceMapStateEntry>>> = useCallback(
    (updater) => {
      setSession((s) => ({
        ...s,
        raceMap: typeof updater === "function" ? updater(s.raceMap) : updater,
      }));
    },
    [],
  );

  const setRaceOrder: React.Dispatch<React.SetStateAction<string[]>> = useCallback((updater) => {
    setSession((s) => ({
      ...s,
      raceOrder: typeof updater === "function" ? updater(s.raceOrder) : updater,
    }));
  }, []);

  const setActiveRaceNo: React.Dispatch<React.SetStateAction<string>> = useCallback((updater) => {
    setSession((s) => ({
      ...s,
      activeRaceNo: typeof updater === "function" ? updater(s.activeRaceNo) : updater,
    }));
  }, []);

  const setSelectedRunnerIds: React.Dispatch<React.SetStateAction<string[]>> = useCallback((updater) => {
    setSession((s) => ({
      ...s,
      selectedRunnerIds: typeof updater === "function" ? updater(s.selectedRunnerIds) : updater,
    }));
  }, []);

  const setFocusMode: React.Dispatch<React.SetStateAction<boolean>> = useCallback((updater) => {
    setSession((s) => ({
      ...s,
      focusMode: typeof updater === "function" ? updater(s.focusMode) : updater,
    }));
  }, []);

  const setPressureOverlay: React.Dispatch<React.SetStateAction<boolean>> = useCallback((updater) => {
    setSession((s) => ({
      ...s,
      pressureOverlay: typeof updater === "function" ? updater(s.pressureOverlay) : updater,
    }));
  }, []);

  const value = useMemo<SpeedMapContextValue>(
    () => ({
      ...session,
      hydrated,
      setMeetingTrack,
      setMeetingGoing,
      setMeetingRail,
      setRaceMap,
      setRaceOrder,
      setActiveRaceNo,
      setSelectedRunnerIds,
      setFocusMode,
      setPressureOverlay,
      persistNow,
      loadFromStorage,
      resetMeeting,
      applySession,
    }),
    [
      session,
      hydrated,
      setMeetingTrack,
      setMeetingGoing,
      setMeetingRail,
      setRaceMap,
      setRaceOrder,
      setActiveRaceNo,
      setSelectedRunnerIds,
      setFocusMode,
      setPressureOverlay,
      persistNow,
      loadFromStorage,
      resetMeeting,
      applySession,
    ],
  );

  return <SpeedMapContext.Provider value={value}>{children}</SpeedMapContext.Provider>;
}

export function useSpeedMapSession(): SpeedMapContextValue {
  const ctx = useContext(SpeedMapContext);
  if (!ctx) {
    throw new Error("useSpeedMapSession must be used within SpeedMapProvider");
  }
  return ctx;
}
