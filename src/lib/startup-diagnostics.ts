/** Max time a non-blocking init safety timer may wait before giving up on background load. */
export const STARTUP_GATE_TIMEOUT_MS = 3_000;

/**
 * Startup diagnostics for iPad Safari / PWA init debugging.
 *
 * Init is non-blocking: pages render immediately with defaults; background load may fail softly.
 */

export type StartupFailure = {
  step: string;
  message: string;
  at: string;
  stack?: string;
};

const failures: StartupFailure[] = [];
const failureListeners = new Set<() => void>();

function serializeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

export function logStartupStep(step: string, detail?: Record<string, unknown>): void {
  if (typeof console !== "undefined") {
    if (detail) console.log(`[Startup] ${step}`, detail);
    else console.log(`[Startup] ${step}`);
  }
}

export function logLoadingState(component: string, loading: boolean, reason?: string): void {
  logStartupStep(`loading-state`, {
    component,
    loading,
    reason: reason ?? (loading ? "gate-open" : "gate-closed"),
  });
}

export function reportStartupFailure(step: string, error: unknown): void {
  const { message, stack } = serializeError(error);
  const entry: StartupFailure = {
    step,
    message,
    at: new Date().toISOString(),
    stack,
  };
  failures.push(entry);
  console.error(`[Startup] FAILURE ${step}`, error);
  for (const listener of failureListeners) listener();
}

export function getStartupFailures(): readonly StartupFailure[] {
  return failures;
}

export function getStartupErrorSummary(): string {
  if (failures.length === 0) return "";
  return failures.map((failure) => `${failure.step}: ${failure.message}`).join("; ");
}

export function subscribeStartupFailures(listener: () => void): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

export function clearStartupFailures(): void {
  failures.length = 0;
  for (const listener of failureListeners) listener();
}

export async function traceAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  logStartupStep(`${label}:start`);
  try {
    const result = await fn();
    logStartupStep(`${label}:end`);
    return result;
  } catch (error) {
    reportStartupFailure(label, error);
    throw error;
  }
}

export function traceSync<T>(label: string, fn: () => T): T {
  logStartupStep(`${label}:start`);
  try {
    const result = fn();
    logStartupStep(`${label}:end`);
    return result;
  } catch (error) {
    reportStartupFailure(label, error);
    throw error;
  }
}

/** Logs if an init step exceeds `ms` without calling `clear`. */
export function startInitWatchdog(label: string, ms: number): () => void {
  logStartupStep(`${label}:watchdog-armed`, { ms });
  const id = window.setTimeout(() => {
    reportStartupFailure(
      label,
      new Error(`Initialization watchdog: "${label}" exceeded ${ms}ms (promise may be unresolved).`),
    );
  }, ms);
  return () => {
    window.clearTimeout(id);
    logStartupStep(`${label}:watchdog-cleared`);
  };
}
