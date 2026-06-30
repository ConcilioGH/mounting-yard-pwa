export type ResultedSpRaceStatus = "waiting" | "checking" | "imported" | "late" | "failed";

export type ResultedSpRunner = {
  raceNo: string;
  runnerNo: string;
  horse: string;
  officialSP: string;
  finishPosition: number | "";
  margin: string;
  resultStatus: string;
  importedAt: string;
  source: string;
};

export type ResultedSpRaceState = {
  status: ResultedSpRaceStatus;
  importedAt?: string;
  lastCheckedAt?: string;
  lastError?: string;
  source?: string;
  isChecking?: boolean;
  runners: ResultedSpRunner[];
};

export type ResultedSpMeetingState = {
  meetingId: string;
  resultsUrl?: string;
  updatedAt: string;
  races: Record<string, ResultedSpRaceState>;
};

export type ResultedSpPollConfig = {
  /** Ms after scheduled race start before first check. Default 3 minutes. */
  startDelayMs: number;
  /** Ms between retry checks. Default 2 minutes. */
  pollIntervalMs: number;
};

export const DEFAULT_RESULTED_SP_POLL_CONFIG: ResultedSpPollConfig = {
  startDelayMs: 3 * 60 * 1000,
  pollIntervalMs: 2 * 60 * 1000,
};

export const RESULTED_SP_UPDATED_EVENT = "mounting-yard-resulted-sp-updated";
