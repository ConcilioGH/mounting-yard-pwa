export type ResultedSpImportAttemptLog = {
  attemptId: string;
  timestamp: string;
  meetingId: string;
  raceNo: string;
  source: string;
  resolvedUrl: string;
  httpStatus?: number;
  redirectsFollowed?: string[];
  responseLength?: number;
  meetingMatched?: boolean;
  raceMatched?: boolean;
  runnersParsed?: number;
  spValuesParsed?: number;
  rowsWritten?: number;
  storageKey?: string;
  eventDispatched?: boolean;
  parseFailure?: string;
  outcome: "imported" | "not_ready" | "error" | "skipped";
  detail?: string;
};

let attemptCounter = 0;

export function createResultedSpAttemptId(): string {
  attemptCounter += 1;
  return `resulted-sp-${Date.now()}-${attemptCounter}`;
}

export function logResultedSpImportAttempt(log: ResultedSpImportAttemptLog): void {
  const lines = [
    `[resulted-sp] attempt ${log.attemptId}`,
    `  meetingId=${log.meetingId} raceNo=${log.raceNo} source=${log.source} outcome=${log.outcome}`,
    `  resolvedUrl=${log.resolvedUrl}`,
  ];
  if (log.httpStatus != null) lines.push(`  httpStatus=${log.httpStatus}`);
  if (log.redirectsFollowed?.length) {
    lines.push(`  redirectsFollowed=${log.redirectsFollowed.join(" -> ")}`);
  }
  if (log.responseLength != null) lines.push(`  responseLength=${log.responseLength}`);
  if (log.meetingMatched != null) lines.push(`  meetingMatched=${log.meetingMatched}`);
  if (log.raceMatched != null) lines.push(`  raceMatched=${log.raceMatched}`);
  if (log.runnersParsed != null) lines.push(`  runnersParsed=${log.runnersParsed}`);
  if (log.spValuesParsed != null) lines.push(`  spValuesParsed=${log.spValuesParsed}`);
  if (log.rowsWritten != null) lines.push(`  rowsWritten=${log.rowsWritten}`);
  if (log.storageKey) lines.push(`  storageKey=${log.storageKey}`);
  if (log.eventDispatched != null) lines.push(`  eventDispatched=${log.eventDispatched}`);
  if (log.parseFailure) lines.push(`  parseFailure=${log.parseFailure}`);
  if (log.detail) lines.push(`  detail=${log.detail}`);
  console.log(lines.join("\n"));
}
