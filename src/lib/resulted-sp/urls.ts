import { sanitizeMeetingSlug } from "@/lib/meeting-export";
import type { MeetingManifest } from "@/lib/meeting-coordination";
import { resolveTabMeetingRef } from "@/lib/resulted-sp/tab-api";
import { buildPrimaryTabResultsUrl as buildTabResultsUrl } from "@/lib/resulted-sp/tab-urls";

export type ResultedSpSource = "tab" | "racingnsw" | "racenet";

const RACING_NSW_VENUE_ALIASES: Record<string, string> = {
  "illawarra-grange": "Kembla Grange",
  "kembla-grange": "Kembla Grange",
  kensington: "Kensington",
  randwick: "Royal Randwick",
  rosehill: "Rosehill Gardens",
  "rosehill-gardens": "Rosehill Gardens",
  warwick: "Warwick Farm",
  "warwick-farm": "Warwick Farm",
  warwickfarm: "Warwick Farm",
};

function titleCaseTrack(value: string): string {
  return value
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function resolveRacingNswVenue(
  manifest: Pick<MeetingManifest, "trackName" | "trackSlug">,
): string {
  const slug = sanitizeMeetingSlug(manifest.trackSlug || manifest.trackName || "");
  return RACING_NSW_VENUE_ALIASES[slug] || titleCaseTrack(manifest.trackName || manifest.trackSlug || "");
}

export function buildRacingNswMeetingKey(
  manifest: Pick<MeetingManifest, "trackName" | "trackSlug" | "date">,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(manifest.date ?? "").trim());
  const venue = resolveRacingNswVenue(manifest);
  if (!match || !venue) return "";
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    Number(match[2]) - 1
  ];
  if (!month) return "";
  return `${match[1]}${month}${match[3]},NSW,${venue}`;
}

export function buildRacingNswResultsUrl(
  manifest: Pick<MeetingManifest, "trackName" | "trackSlug" | "date">,
): string {
  const key = buildRacingNswMeetingKey(manifest);
  if (!key) return "";
  return `https://mdata.racingnsw.com.au/FreeFields/Results.aspx?Key=${encodeURIComponent(key)}`;
}

export function racingNswMeetingMatchesHtml(
  html: string,
  manifest: Pick<MeetingManifest, "trackName" | "trackSlug" | "date">,
): boolean {
  const key = buildRacingNswMeetingKey(manifest);
  if (!key) return false;
  const normalizedHtml = html.replace(/&amp;/gi, "&").replace(/\+/g, " ").toLowerCase();
  return normalizedHtml.includes(key.toLowerCase());
}

export function buildRacenetResultsUrl(
  manifest: Pick<MeetingManifest, "trackName" | "trackSlug" | "date">,
): string {
  const trackSlug = sanitizeMeetingSlug(manifest.trackName || manifest.trackSlug || "meeting");
  const dateCompact = String(manifest.date ?? "").replace(/-/g, "");
  if (!dateCompact || trackSlug === "meeting") return "";
  return `https://www.racenet.com.au/horse-racing-results/${trackSlug}-${dateCompact}`;
}

export function buildPrimaryTabResultsUrl(
  manifest: MeetingManifest,
  options?: Parameters<typeof buildTabResultsUrl>[1],
): string {
  return buildTabResultsUrl(manifest, options);
}

/** Resolve TAB venue mnemonic via API, then build the meeting-specific results URL. */
export async function resolvePrimaryTabResultsUrl(
  manifest: MeetingManifest,
  raceNo?: string,
): Promise<string | null> {
  const meetingRef = await resolveTabMeetingRef(manifest);
  if (!meetingRef) return null;
  return buildTabResultsUrl(manifest, { meetingRef, raceNo });
}

export function fallbackHtmlSources(
  manifest: MeetingManifest,
): Array<{ source: Exclude<ResultedSpSource, "tab">; url: string }> {
  const sources: Array<{ source: Exclude<ResultedSpSource, "tab">; url: string }> = [];
  const nsw = buildRacingNswResultsUrl(manifest);
  const racenet = buildRacenetResultsUrl(manifest);
  if (nsw) sources.push({ source: "racingnsw", url: nsw });
  if (racenet) sources.push({ source: "racenet", url: racenet });
  return sources;
}
