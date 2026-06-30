import type { Race } from "@/lib/types";

export type RaceCountdownStatus = "not_started" | "counting_down" | "between_races" | "complete";

export type NextRaceCountdown = {
  status: RaceCountdownStatus;
  raceNo: string;
  raceLabel: string;
  raceStartTime: Date;
  countdownStartTime: Date;
  secondsRemaining: number;
  secondsUntilCountdownStarts: number;
  displayStartTime: string;
};

const RACE1_COUNTDOWN_MINUTES = 20;
const SUBSEQUENT_COUNTDOWN_AFTER_PREV_START_MINUTES = 5;

type ParsedRaceSchedule = {
  raceNo: string;
  raceLabel: string;
  title: string;
  startTime: Date;
};

function normalizeRaceNoFromId(id: string): string {
  const trimmed = String(id ?? "").trim();
  const match = /^R?(\d+)$/i.exec(trimmed);
  if (match) return match[1]!;
  return trimmed;
}

function raceLabelFromId(id: string): string {
  const no = normalizeRaceNoFromId(id);
  return /^R/i.test(id.trim()) ? id.trim().toUpperCase() : `R${no}`;
}

/** Parse "11:00 am", "1:35", etc. from race title text. */
export function parseStartTimeFromRaceTitle(title: string): string | null {
  const withMeridiem = title.match(/\b(\d{1,2}:\d{2}\s*(?:am|pm))\b/i);
  if (withMeridiem?.[1]) return withMeridiem[1].replace(/\s+/g, " ").trim().toLowerCase();

  const bare = title.match(/\b(\d{1,2}:\d{2})\b/);
  return bare?.[1] ?? null;
}

function parseClockTo24Hour(hours: number, minutes: number, meridiem?: string): number {
  const mer = meridiem?.toLowerCase();
  if (mer === "pm" && hours < 12) return hours + 12;
  if (mer === "am" && hours === 12) return 0;
  if (mer === "am" || mer === "pm") return hours;

  // No meridiem: afternoon racecards often use 1:00 = 1pm, morning 10:30 = 10:30am.
  if (hours >= 1 && hours <= 7) return hours + 12;
  return hours;
}

export function parseStartTimeToDate(title: string, meetingDate: string | undefined, now: Date): Date | null {
  const token = parseStartTimeFromRaceTitle(title);
  if (!token) return null;

  const match = token.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (!match) return null;

  const hours = parseInt(match[1]!, 10);
  const minutes = parseInt(match[2]!, 10);
  const meridiem = match[3];
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const hour24 = parseClockTo24Hour(hours, minutes, meridiem);

  let year: number;
  let month: number;
  let day: number;

  const dateMatch = meetingDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    year = parseInt(dateMatch[1]!, 10);
    month = parseInt(dateMatch[2]!, 10) - 1;
    day = parseInt(dateMatch[3]!, 10);
  } else {
    year = now.getFullYear();
    month = now.getMonth();
    day = now.getDate();
  }

  return new Date(year, month, day, hour24, minutes, 0, 0);
}

function buildRaceSchedule(races: Race[], meetingDate: string | undefined, now: Date): ParsedRaceSchedule[] {
  const schedule: ParsedRaceSchedule[] = [];

  for (const race of [...races].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
    const startTime = parseStartTimeToDate(race.title, meetingDate, now);
    if (!startTime) continue;
    schedule.push({
      raceNo: normalizeRaceNoFromId(race.id),
      raceLabel: raceLabelFromId(race.id),
      title: race.title,
      startTime,
    });
  }

  return schedule;
}

function countdownStartForRace(index: number, schedule: ParsedRaceSchedule[]): Date {
  if (index === 0) {
    return new Date(
      schedule[0]!.startTime.getTime() - RACE1_COUNTDOWN_MINUTES * 60 * 1000,
    );
  }
  const previousStart = schedule[index - 1]!.startTime;
  return new Date(
    previousStart.getTime() + SUBSEQUENT_COUNTDOWN_AFTER_PREV_START_MINUTES * 60 * 1000,
  );
}

export function formatCountdownSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function formatRaceStartTimeLabel(date: Date): string {
  return date
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, " ")
    .toLowerCase();
}

export function getNextRaceCountdown(
  races: Race[],
  now: Date = new Date(),
  meetingDate?: string,
): NextRaceCountdown | null {
  const schedule = buildRaceSchedule(races, meetingDate, now);
  if (!schedule.length) return null;

  const last = schedule[schedule.length - 1]!;
  if (now.getTime() >= last.startTime.getTime()) {
    return {
      status: "complete",
      raceNo: last.raceNo,
      raceLabel: last.raceLabel,
      raceStartTime: last.startTime,
      countdownStartTime: countdownStartForRace(schedule.length - 1, schedule),
      secondsRemaining: 0,
      secondsUntilCountdownStarts: 0,
      displayStartTime: formatRaceStartTimeLabel(last.startTime),
    };
  }

  for (let i = 0; i < schedule.length; i += 1) {
    const race = schedule[i]!;
    const countdownStart = countdownStartForRace(i, schedule);
    const raceStart = race.startTime;

    if (now.getTime() < countdownStart.getTime()) {
      const secondsUntilCountdownStarts = (countdownStart.getTime() - now.getTime()) / 1000;
      return {
        status: i === 0 ? "not_started" : "between_races",
        raceNo: race.raceNo,
        raceLabel: race.raceLabel,
        raceStartTime: raceStart,
        countdownStartTime: countdownStart,
        secondsRemaining: 0,
        secondsUntilCountdownStarts,
        displayStartTime: formatRaceStartTimeLabel(raceStart),
      };
    }

    if (now.getTime() >= countdownStart.getTime() && now.getTime() < raceStart.getTime()) {
      const secondsRemaining = (raceStart.getTime() - now.getTime()) / 1000;
      return {
        status: "counting_down",
        raceNo: race.raceNo,
        raceLabel: race.raceLabel,
        raceStartTime: raceStart,
        countdownStartTime: countdownStart,
        secondsRemaining,
        secondsUntilCountdownStarts: 0,
        displayStartTime: formatRaceStartTimeLabel(raceStart),
      };
    }
  }

  return null;
}
