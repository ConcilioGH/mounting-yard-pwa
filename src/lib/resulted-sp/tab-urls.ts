import { normalizeRaceNo } from "@/lib/meeting-coordination";
import type { MeetingManifest } from "@/lib/meeting-coordination";
import {
  inferTabJurisdiction,
  tabStateCodeForJurisdiction,
  type TabJurisdiction,
} from "@/lib/resulted-sp/tab-jurisdiction";

/** TAB race code in web URLs and API paths (R = thoroughbred, H = harness, G = greyhound). */
export type TabRaceTypeCode = "R" | "H" | "G";

export type TabMeetingRef = {
  date: string;
  raceType: TabRaceTypeCode;
  venueMnemonic: string;
  meetingName: string;
  jurisdiction: TabJurisdiction;
};

const TAB_RESULTS_BASE = "https://www.tab.com.au/racing/meetings/results";

/** Date segment for TAB results URLs — "today" when the meeting is on the current calendar day. */
export function tabResultsDateSegment(manifestDate: string | undefined, now: Date = new Date()): string {
  const trimmed = String(manifestDate ?? "").trim();
  if (!trimmed) return "today";
  const today = now.toISOString().slice(0, 10);
  if (trimmed === today) return "today";
  return trimmed;
}

/**
 * Canonical TAB meeting results URL.
 * Example: https://www.tab.com.au/racing/meetings/results/2026-06-30/R/TRE/1
 */
export function buildTabResultsMeetingUrl(
  ref: Pick<TabMeetingRef, "date" | "raceType" | "venueMnemonic">,
  raceNo?: string,
): string {
  const date = tabResultsDateSegment(ref.date === "today" ? undefined : ref.date);
  const raceType = ref.raceType || "R";
  const venue = String(ref.venueMnemonic ?? "")
    .trim()
    .toUpperCase();
  if (!venue) return "";
  const base = `${TAB_RESULTS_BASE}/${encodeURIComponent(date)}/${raceType}/${venue}`;
  if (!raceNo) return base;
  return `${base}/${encodeURIComponent(normalizeRaceNo(raceNo))}`;
}

/**
 * Jurisdiction results list URL when the venue mnemonic is not yet known.
 * Example: https://www.tab.com.au/racing/meetings/results/2026-06-30/R
 */
export function buildTabResultsListUrl(
  manifest: Pick<MeetingManifest, "trackSlug" | "trackName" | "date">,
  now: Date = new Date(),
): string {
  const jurisdiction = inferTabJurisdiction(manifest);
  const state = tabStateCodeForJurisdiction(jurisdiction);
  const date = tabResultsDateSegment(manifest.date, now);
  return `${TAB_RESULTS_BASE}/${encodeURIComponent(date)}/${state}`;
}

export function buildTabMeetingRef(
  meeting: {
    meetingName: string;
    meetingDate?: string;
    raceType?: string;
    venueMnemonic: string;
  },
  manifest: Pick<MeetingManifest, "date">,
  jurisdiction: TabJurisdiction,
): TabMeetingRef {
  const raceType = String(meeting.raceType ?? "R").trim().toUpperCase();
  return {
    date: meeting.meetingDate || tabResultsDateSegment(manifest.date),
    raceType: (raceType === "H" || raceType === "G" ? raceType : "R") as TabRaceTypeCode,
    venueMnemonic: meeting.venueMnemonic,
    meetingName: meeting.meetingName,
    jurisdiction,
  };
}

export function buildPrimaryTabResultsUrl(
  manifest: MeetingManifest,
  options?: { meetingRef?: TabMeetingRef | null; raceNo?: string; now?: Date },
): string {
  if (options?.meetingRef) {
    const meetingUrl = buildTabResultsMeetingUrl(options.meetingRef, options.raceNo);
    if (meetingUrl) return meetingUrl;
  }
  return buildTabResultsListUrl(manifest, options?.now);
}
