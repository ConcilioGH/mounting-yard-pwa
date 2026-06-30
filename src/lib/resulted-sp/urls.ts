import { sanitizeMeetingSlug } from "@/lib/meeting-export";
import type { MeetingManifest } from "@/lib/meeting-coordination";
import { resolveTabMeetingRef } from "@/lib/resulted-sp/tab-api";
import { buildPrimaryTabResultsUrl as buildTabResultsUrl } from "@/lib/resulted-sp/tab-urls";

export type ResultedSpSource = "tab" | "racingnsw" | "racenet";

export function buildRacingNswResultsUrl(
  manifest: Pick<MeetingManifest, "trackName" | "trackSlug" | "date">,
): string {
  const trackSlug = sanitizeMeetingSlug(manifest.trackName || manifest.trackSlug || "meeting");
  const dateCompact = String(manifest.date ?? "").replace(/-/g, "");
  if (!dateCompact || trackSlug === "meeting") return "";
  return `https://racing.racingnsw.com.au/racing/Results/All/${trackSlug}/${dateCompact}`;
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
