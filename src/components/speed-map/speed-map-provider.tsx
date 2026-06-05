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
  loadSpeedMapFromStorage,
  saveSpeedMapToStorage,
  type SpeedMapSessionState,
} from "@/lib/speed-map-persistence";
import { MEETING_IMPORTED_EVENT } from "@/lib/meeting-coordination";
import { reconcileSpeedMapActivePlacement } from "@/lib/meeting-speed-map-sync";
import { clearSpeedMapLocalStorage } from "@/lib/speed-map-storage";
import type { RaceMapStateEntry } from "@/lib/speed-map";
import {
  logLoadingState,
  reportStartupFailure,
  traceSync,
} from "@/lib/startup-diagnostics";

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
  const [session, setSession] = useState<SpeedMapSessionState>(() => {
    try {
      const loaded = loadSpeedMapFromStorage();
      return loaded
        ? traceSync("speed-map-session-reconcile", () => reconcileSpeedMapActivePlacement(loaded))
        : emptySpeedMapSession();
    } catch (error) {
      reportStartupFailure("speed-map-provider-init-state", error);
      return emptySpeedMapSession();
    }
  });
  const [hydrated, setHydrated] = useState(true);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    logLoadingState("SpeedMapProvider", true, "hydrated=false");
    try {
      const loaded = loadSpeedMapFromStorage();
      if (loaded) {
        setSession(traceSync("speed-map-session-reconcile", () => reconcileSpeedMapActivePlacement(loaded)));
      }
    } catch (error) {
      reportStartupFailure("speed-map-provider-hydrate", error);
      console.error("Failed to hydrate speed map session", error);
    } finally {
      logLoadingState("SpeedMapProvider", false, "hydrated=true");
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    const onMeetingImported = () => {
      const loaded = loadSpeedMapFromStorage();
      if (loaded) setSession(reconcileSpeedMapActivePlacement(loaded));
    };
    window.addEventListener(MEETING_IMPORTED_EVENT, onMeetingImported);
    return () => window.removeEventListener(MEETING_IMPORTED_EVENT, onMeetingImported);
  }, []);

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
    const loaded = loadSpeedMapFromStorage();
    if (!loaded) return false;
    setSession(loaded);
    return true;
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
