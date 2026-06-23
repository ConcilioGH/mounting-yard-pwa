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

export type MeetingLibraryScan = {
  rootPath: string;
  foldersScanned: string[];
  masterCsvFiles: string[];
  meetingsReturned: number;
  foldersExcluded: Array<{ folder: string; reason: string }>;
};

export type MeetingLibraryResult = {
  meetings: MeetingLibraryEntry[];
  scan: MeetingLibraryScan;
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
): Promise<{ entries: MeetingLibraryEntry[]; exclusionReason: string | null }> {
  let names: string[];
  try {
    names = await readdir(absoluteDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : "could not read folder";
    return { entries: [], exclusionReason: `could not read folder: ${message}` };
  }

  const masterNames = names.filter((name) => /_master\.csv$/i.test(name));
  if (!masterNames.length) {
    const csvNames = names.filter((name) => /\.csv$/i.test(name));
    if (csvNames.length) {
      return {
        entries: [],
        exclusionReason: `no *_master.csv file (found ${csvNames.length} other .csv: ${csvNames.join(", ")})`,
      };
    }
    return { entries: [], exclusionReason: "no *_master.csv file in folder" };
  }

  const entries: MeetingLibraryEntry[] = [];
  const statFailures: string[] = [];
  for (const name of masterNames) {
    const relativePath = `${relativeDir}/${name}`.replace(/\\/g, "/");
    const absoluteFile = path.join(absoluteDir, name);
    let modifiedAt = "";
    try {
      const fileStat = await stat(absoluteFile);
      modifiedAt = fileStat.mtime.toISOString();
    } catch {
      statFailures.push(name);
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

  if (!entries.length && statFailures.length) {
    return {
      entries: [],
      exclusionReason: `*_master.csv present but unreadable: ${statFailures.join(", ")}`,
    };
  }

  return { entries, exclusionReason: null };
}

/** Scan repo `meetings/` for `*_master.csv` files — always reads disk, no caching. */
export async function listMeetingLibrary(): Promise<MeetingLibraryResult> {
  const root = path.join(process.cwd(), MEETINGS_ROOT);
  let folderNames: string[];
  try {
    const items = await readdir(root, { withFileTypes: true });
    folderNames = items.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    const scan: MeetingLibraryScan = {
      rootPath: root,
      foldersScanned: [],
      masterCsvFiles: [],
      meetingsReturned: 0,
      foldersExcluded: [],
    };
    console.log("[meeting-library] folders scanned:", 0, []);
    console.log("[meeting-library] master CSV files found:", 0, []);
    console.log("[meeting-library] folders excluded:", 0, []);
    console.log("[meeting-library] meetings returned:", 0);
    return { meetings: [], scan };
  }

  folderNames.sort((a, b) => a.localeCompare(b));

  const all: MeetingLibraryEntry[] = [];
  const masterCsvFiles: string[] = [];
  const foldersExcluded: Array<{ folder: string; reason: string }> = [];
  for (const folderName of folderNames) {
    const relativeDir = `${MEETINGS_ROOT}/${folderName}`;
    const absoluteDir = path.join(root, folderName);
    const { entries, exclusionReason } = await listMasterCsvInDir(absoluteDir, relativeDir);
    if (!entries.length && exclusionReason) {
      foldersExcluded.push({ folder: relativeDir, reason: exclusionReason });
    }
    for (const entry of entries) {
      masterCsvFiles.push(entry.relativePath);
    }
    all.push(...entries);
  }

  all.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });

  const scan: MeetingLibraryScan = {
    rootPath: root,
    foldersScanned: folderNames.map((name) => `${MEETINGS_ROOT}/${name}`),
    masterCsvFiles,
    meetingsReturned: all.length,
    foldersExcluded,
  };

  console.log(
    "[meeting-library] folders scanned:",
    scan.foldersScanned.length,
    scan.foldersScanned,
  );
  console.log(
    "[meeting-library] master CSV files found:",
    scan.masterCsvFiles.length,
    scan.masterCsvFiles,
  );
  console.log(
    "[meeting-library] folders excluded:",
    scan.foldersExcluded.length,
    scan.foldersExcluded,
  );
  console.log("[meeting-library] meetings returned:", scan.meetingsReturned);

  return { meetings: all, scan };
}

export async function readMeetingLibraryCsv(relativePath: string): Promise<string> {
  const safe = safeMeetingCsvRelativePath(relativePath);
  if (!safe) throw new Error("Invalid meeting path");
  const absolute = path.join(process.cwd(), safe);
  return readFile(absolute, "utf8");
}
