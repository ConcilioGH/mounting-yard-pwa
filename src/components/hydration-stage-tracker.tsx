"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type HydrationStageCode = "A" | "B" | "C" | "D";

type HydrationStageContextValue = {
  markStage: (stage: HydrationStageCode, detail: string) => void;
  stage: HydrationStageCode;
  detail: string;
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

export function HydrationStageProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<HydrationStageCode>("A");
  const [detail, setDetail] = useState(STAGE_LABELS.A);

  const markStage = useCallback((next: HydrationStageCode, nextDetail: string) => {
    setStage(next);
    setDetail(nextDetail);
  }, []);

  useEffect(() => {
    markStage("D", STAGE_LABELS.D);
  }, [markStage]);

  const value: HydrationStageContextValue = {
    markStage,
    stage,
    detail,
  };

  return <HydrationStageContext.Provider value={value}>{children}</HydrationStageContext.Provider>;
}
