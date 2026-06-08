"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { APP_BUILD_VERSION } from "@/lib/build-version";

export type HydrationStageCode = "A" | "B" | "C" | "D";

type HydrationStageContextValue = {
  markStage: (stage: HydrationStageCode, detail: string) => void;
  stage: HydrationStageCode;
  detail: string;
  clientUserAgent: string;
};

const HydrationStageContext = createContext<HydrationStageContextValue | null>(null);

export function useHydrationStageOptional(): HydrationStageContextValue | null {
  return useContext(HydrationStageContext);
}

const STAGE_LABELS: Record<HydrationStageCode, string> = {
  A: "AppProviders mounted",
  B: "SpeedMapProvider mounted",
  C: "localStorage read complete",
  D: "hydration complete",
};

export function HydrationStageBanner() {
  const ctx = useHydrationStageOptional();
  if (!ctx) return null;

  const { stage, detail, clientUserAgent } = ctx;
  const label = STAGE_LABELS[stage];

  return (
    <div
      id="hydration-stage-banner"
      style={{
        position: "fixed",
        top: 56,
        left: 8,
        right: 8,
        zIndex: 2147483646,
        padding: 12,
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 13,
        lineHeight: 1.45,
        background: "#eff6ff",
        border: "2px solid #2563eb",
        borderRadius: 10,
        color: "#0f172a",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: 700 }}>
        Stage {stage}: {label}
      </div>
      <div style={{ marginTop: 4 }}>{detail}</div>
      <div style={{ marginTop: 6, wordBreak: "break-word" }}>
        <strong>Client UserAgent:</strong> {clientUserAgent || "(not set — client JS / effects not running)"}
      </div>
      <div style={{ marginTop: 4, color: "#64748b" }}>Build {APP_BUILD_VERSION}</div>
    </div>
  );
}

export function HydrationStageProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<HydrationStageCode>("A");
  const [detail, setDetail] = useState(STAGE_LABELS.A);
  const [clientUserAgent, setClientUserAgent] = useState("");

  const markStage = useCallback((next: HydrationStageCode, nextDetail: string) => {
    setStage(next);
    setDetail(nextDetail);
  }, []);

  useEffect(() => {
    try {
      setClientUserAgent(navigator.userAgent);
    } catch {
      setClientUserAgent("(navigator.userAgent unavailable)");
    }
    markStage("D", STAGE_LABELS.D);
  }, [markStage]);

  const value: HydrationStageContextValue = {
    markStage,
    stage,
    detail,
    clientUserAgent,
  };

  return (
    <HydrationStageContext.Provider value={value}>
      <HydrationStageBanner />
      {children}
    </HydrationStageContext.Provider>
  );
}
