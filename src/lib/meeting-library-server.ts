import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  parseMasterCsvFileName,
  parseMeetingFolderMeta,
  sanitizeMeetingSlug,
} from "@/lib/meeting-export";

export type MeetingLibraryEntry = {
  id: string;
  label: string;
  date: string;
  track: string;
  trackLabel: string;
  relativePath: string;
  fileName: string;
  modifiedAt: string;
};

const MEETINGS_ROOT = "meetings";

export function safeMeetingCsvRelativePath(relativePath: string): string | null {
  const normalized = String(relativePath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!normalized.startsWith(`${MEETINGS_ROOT}/`)) return null;
  if (normalized.includes("..")) return null;
  const fileName = path.basename(normalized);
  if (!fileName.toLowerCase().endsWith(".csv")) return null;
  if (fileName !== normalized.split("/").pop()) return null;
  return normalized;
}

function titleCaseTrack(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function labelForEntry(folderName: string, fileName: string): {
  date: string;
  track: string;
  trackLabel: string;
  label: string;
} {
  const fromFolder = parseMeetingFolderMeta(folderName);
  const fromFile = parseMasterCsvFileName(fileName);
  const date = fromFolder?.date || fromFile?.date || "";
  const track = fromFolder?.track || fromFile?.track || sanitizeMeetingSlug(folderName);
  const trackLabel = titleCaseTrack(track);
  const label = date ? `${date} · ${trackLabel}` : trackLabel || fileName;
  return { date, track, trackLabel, label };
}

async function listMasterCsvInDir(
  absoluteDir: string,
  relativeDir: string,
): Promise<MeetingLibraryEntry[]> {
  let names: string[];
  try {
    names = await readdir(absoluteDir);
  } catch {
    return [];
  }

  const entries: MeetingLibraryEntry[] = [];
  for (const name of names) {
    if (!/_master\.csv$/i.test(name)) continue;
    const relativePath = `${relativeDir}/${name}`.replace(/\\/g, "/");
    const absoluteFile = path.join(absoluteDir, name);
    let modifiedAt = "";
    try {
      const fileStat = await stat(absoluteFile);
      modifiedAt = fileStat.mtime.toISOString();
    } catch {
      continue;
    }
    const folderName = path.basename(relativeDir);
    const meta = labelForEntry(folderName, name);
    entries.push({
      id: relativePath,
      label: meta.label,
      date: meta.date,
      track: meta.track,
      trackLabel: meta.trackLabel,
      relativePath,
      fileName: name,
      modifiedAt,
    });
  }
  return entries;
}

/** Scan repo `meetings/` for `*_master.csv` files (laptop dev workflow). */
export async function listMeetingLibrary(): Promise<MeetingLibraryEntry[]> {
  const root = path.join(process.cwd(), MEETINGS_ROOT);
  let folderNames: string[];
  try {
    const items = await readdir(root, { withFileTypes: true });
    folderNames = items.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }

  const all: MeetingLibraryEntry[] = [];
  for (const folderName of folderNames) {
    const relativeDir = `${MEETINGS_ROOT}/${folderName}`;
    const absoluteDir = path.join(root, folderName);
    const found = await listMasterCsvInDir(absoluteDir, relativeDir);
    all.push(...found);
  }

  all.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });

  return all;
}

export async function readMeetingLibraryCsv(relativePath: string): Promise<string> {
  const safe = safeMeetingCsvRelativePath(relativePath);
  if (!safe) throw new Error("Invalid meeting path");
  const absolute = path.join(process.cwd(), safe);
  return readFile(absolute, "utf8");
}
