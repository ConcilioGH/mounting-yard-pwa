"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getStartupFailures,
  reportStartupFailure,
  STARTUP_GATE_TIMEOUT_MS,
  subscribeStartupFailures,
} from "@/lib/startup-diagnostics";

type UseStartupGateOptions = {
  onTimeout?: () => void;
};

export function useStartupGate(gateId: string, options?: UseStartupGateOptions) {
  const [released, setReleased] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const onTimeoutRef = useRef(options?.onTimeout);
  onTimeoutRef.current = options?.onTimeout;

  const refreshErrors = useCallback(() => {
    setErrors(getStartupFailures().map((failure) => `${failure.step}: ${failure.message}`));
  }, []);

  useEffect(() => subscribeStartupFailures(refreshErrors), [refreshErrors]);

  useEffect(() => {
    refreshErrors();
  }, [refreshErrors, timedOut]);

  const markReleased = useCallback(() => {
    setReleased(true);
  }, []);

  useEffect(() => {
    if (released) return;
    const timer = window.setTimeout(() => {
      const message = `App failed to initialise on this device (${gateId} exceeded ${STARTUP_GATE_TIMEOUT_MS}ms).`;
      reportStartupFailure(gateId, new Error(message));
      setTimedOut(true);
      setReleased(true);
      onTimeoutRef.current?.();
    }, STARTUP_GATE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [gateId, released]);

  return {
    isBlocking: !released,
    timedOut,
    markReleased,
    errors,
    showFailure: timedOut || errors.length > 0,
  };
}
