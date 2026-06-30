import type { MeetingManifest } from "@/lib/meeting-coordination";

export function sanitizeMeetingSlug(input: string): string {
  const slug = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "meeting";
}

export type MeetingFolderMeta = {
  date: string;
  track: string;
  /** Relative path e.g. `meetings/2026-05-28-canterbury` */
  meetingFolderPath: string;
};

/**
 * Parse `meetings/2026-05-28-canterbury` or folder name `2026-05-28-canterbury`.
 * date = 2026-05-28, track = canterbury
 */
export function parseMeetingFolderMeta(folderPathOrName: string): MeetingFolderMeta | null {
  const normalized = String(folderPathOrName ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  if (!normalized) return null;

  const segments = normalized.split("/").filter(Boolean);
  const folderName = segments[segments.length - 1] ?? "";
  const match = folderName.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/i);
  if (!match) return null;

  const date = match[1]!;
  const track = sanitizeMeetingSlug(match[2]!);
  const meetingsIdx = segments.indexOf("meetings");
  const meetingFolderPath =
    meetingsIdx >= 0
      ? segments.slice(meetingsIdx).join("/")
      : `meetings/${folderName}`;

  return { date, track, meetingFolderPath };
}

/** e.g. `canterbury_2026-05-28_master.csv` → track + date */
export function parseMasterCsvFileName(fileName: string): { track: string; date: string } | null {
  const base = fileName.replace(/\.csv$/i, "").split(/[/\\]/).pop() ?? "";
  const match = base.match(/^(.+?)_(\d{4}-\d{2}-\d{2})_master$/i);
  if (!match) return null;
  const track = sanitizeMeetingSlug(match[1]!);
  const date = match[2]!;
  if (!track || track === "meeting") return null;
  return { track, date };
}

export function inferMeetingDateFromFileName(fileName: string): string {
  const fromMaster = parseMasterCsvFileName(fileName);
  if (fromMaster?.date) return fromMaster.date;
  const base = fileName.replace(/\.csv$/i, "").split(/[/\\]/).pop() ?? "";
  const match = base.match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

export function inferMeetingTrackFromFileName(fileName: string): string {
  const fromMaster = parseMasterCsvFileName(fileName);
  if (fromMaster?.track) return fromMaster.track;
  const base = fileName.replace(/\.csv$/i, "").split(/[/\\]/).pop() ?? "";
  const stem = base
    .replace(/_\d{4}-\d{2}-\d{2}.*/i, "")
    .replace(/_master$/i, "")
    .replace(/^racenet[-_]?/i, "")
    .replace(/[-_]mounting[-_]?yard.*/i, "")
    .replace(/[-_]race[-_]?day.*/i, "")
    .replace(/[-_]speed[-_]?map.*/i, "");
  const venue = stem.split(/[_-]/).filter(Boolean)[0] ?? "";
  if (!venue || /^(export|speed|map|fields|unknown|meeting)$/i.test(venue)) return "";
  return sanitizeMeetingSlug(venue);
}

/** Build `meetings/{date}-{track}` from parsed folder meta or master CSV name. */
export function inferMeetingFolderPath(options: {
  importPath?: string;
  fileName?: string;
  track?: string;
  date?: string;
}): string {
  if (options.importPath) {
    const fromPath = parseMeetingFolderMeta(options.importPath);
    if (fromPath) return fromPath.meetingFolderPath;
  }
  const track = sanitizeMeetingSlug(options.track ?? "");
  const date = options.date?.trim() ?? "";
  if (date && track && track !== "meeting") {
    return `meetings/${date}-${track}`;
  }
  return "";
}

function resolveExportDate(manifest: MeetingManifest | null): string {
  const fromManifest = manifest?.date?.trim();
  if (fromManifest && /^\d{4}-\d{2}-\d{2}$/.test(fromManifest)) return fromManifest;
  return new Date().toISOString().slice(0, 10);
}

function resolveExportTrack(manifest: MeetingManifest | null, fallbackTrack?: string): string {
  const fromFolder = manifest?.trackSlug?.trim();
  if (fromFolder) return fromFolder;
  const track = manifest?.trackName?.trim() || fallbackTrack?.trim() || "";
  return sanitizeMeetingSlug(track);
}

export type MeetingExportKind =
  | "mounting-yard-assessments"
  | "race-day-bias"
  | "race-day-bias-summary"
  | "resulted-sp";

export function buildMeetingExportFilename(
  kind: MeetingExportKind,
  manifest: MeetingManifest | null,
  options?: { fallbackTrack?: string },
): string {
  const track = resolveExportTrack(manifest, options?.fallbackTrack);
  const date = resolveExportDate(manifest);
  if (kind === "resulted-sp") {
    return `${track}_${date}_resulted_sp.csv`;
  }
  return `${track}_${date}_${kind}.csv`;
}
