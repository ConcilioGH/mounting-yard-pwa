import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  parseMasterCsvFileName,
  parseMeetingFolderMeta,
  sanitizeMeetingSlug,
} from "@/lib/meeting-export";
import { deriveMeetingId } from "@/lib/race-day-bias/storage";
import type {
  MeetingLibraryEntry,
  MeetingLibraryFolderReport,
  MeetingLibraryScan,
} from "@/lib/meeting-library-types";

const MEETINGS_ROOT = "meetings";

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
  parseErrors: string[];
} {
  const parseErrors: string[] = [];
  const fromFolder = parseMeetingFolderMeta(folderName);
  const fromFile = parseMasterCsvFileName(fileName);

  if (!fromFolder) {
    parseErrors.push(`folder name "${folderName}" does not match YYYY-MM-DD-track`);
  }
  if (!fromFile) {
    parseErrors.push(`master CSV "${fileName}" does not match {track}_YYYY-MM-DD_master.csv`);
  }

  const date = fromFolder?.date || fromFile?.date || "";
  const track = fromFolder?.track || fromFile?.track || sanitizeMeetingSlug(folderName);
  const trackLabel = titleCaseTrack(track);
  const label = date ? `${date} · ${trackLabel}` : trackLabel || fileName;

  if (!date) parseErrors.push("could not parse meeting date");
  if (!track || track === "meeting") parseErrors.push("could not parse track slug");

  return { date, track, trackLabel, label, parseErrors };
}

function meetingIdFor(folderPath: string, date: string, track: string): string {
  return (
    deriveMeetingId({
      date,
      trackSlug: track,
      meetingFolderPath: folderPath,
    }) || ""
  );
}

async function scanFolder(
  folderName: string,
  absoluteDir: string,
): Promise<{
  report: MeetingLibraryFolderReport;
  entries: MeetingLibraryEntry[];
}> {
  const relativeDir = `${MEETINGS_ROOT}/${folderName}`;
  const report: MeetingLibraryFolderReport = {
    folder: relativeDir,
    folderName,
    masterCsvFound: false,
    masterCsvCount: 0,
    masterCsvFilenames: [],
    parsedDate: "",
    parsedTrack: "",
    meetingId: "",
    includedInLibrary: false,
    exclusionReason: null,
    parseErrors: [],
  };
  const entries: MeetingLibraryEntry[] = [];

  let names: string[];
  try {
    names = await readdir(absoluteDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : "could not read folder";
    report.exclusionReason = `could not read folder: ${message}`;
    return { report, entries };
  }

  const masterNames = names.filter((name) => /_master\.csv$/i.test(name)).sort();
  report.masterCsvCount = masterNames.length;
  report.masterCsvFilenames = masterNames;
  report.masterCsvFound = masterNames.length > 0;

  if (!masterNames.length) {
    const csvNames = names.filter((name) => /\.csv$/i.test(name));
    report.exclusionReason = csvNames.length
      ? `no *_master.csv file (found ${csvNames.length} other .csv: ${csvNames.join(", ")})`
      : "no *_master.csv file in folder";
    return { report, entries };
  }

  if (masterNames.length > 1) {
    report.parseErrors.push(
      `folder has ${masterNames.length} *_master.csv files (all are listed in the library)`,
    );
  }

  const folderMeta = parseMeetingFolderMeta(folderName);
  if (folderMeta) {
    report.parsedDate = folderMeta.date;
    report.parsedTrack = folderMeta.track;
    report.meetingId = meetingIdFor(folderMeta.meetingFolderPath, folderMeta.date, folderMeta.track);
  }

  const statFailures: string[] = [];
  for (const name of masterNames) {
    const meta = labelForEntry(folderName, name);
    if (!report.parsedDate && meta.date) report.parsedDate = meta.date;
    if (!report.parsedTrack && meta.track) report.parsedTrack = meta.track;
    for (const err of meta.parseErrors) {
      if (report.parseErrors.indexOf(err) < 0) report.parseErrors.push(err);
    }

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

    const meetingId =
      report.meetingId ||
      meetingIdFor(relativeDir, meta.date, meta.track);

    entries.push({
      id: relativePath,
      label: meta.label,
      date: meta.date,
      track: meta.track,
      trackLabel: meta.trackLabel,
      relativePath,
      fileName: name,
      modifiedAt,
      meetingId,
    });
  }

  if (!report.meetingId && entries[0]?.meetingId) {
    report.meetingId = entries[0].meetingId;
  }

  if (!entries.length && statFailures.length) {
    report.exclusionReason = `*_master.csv present but unreadable: ${statFailures.join(", ")}`;
    return { report, entries };
  }

  if (!entries.length) {
    report.exclusionReason = report.exclusionReason || "no readable *_master.csv entries";
    return { report, entries };
  }

  if (!report.parsedDate || !report.parsedTrack || !report.meetingId) {
    report.exclusionReason = "master CSV present but date/track/meetingId could not be parsed";
    return { report, entries };
  }

  report.includedInLibrary = true;
  report.exclusionReason = null;
  return { report, entries };
}

function applyDuplicateMeetingIdWarnings(
  folderReports: MeetingLibraryFolderReport[],
  meetings: MeetingLibraryEntry[],
): void {
  const byMeetingId = new Map<string, string[]>();
  for (const meeting of meetings) {
    const id = meeting.meetingId?.trim();
    if (!id) continue;
    const list = byMeetingId.get(id) ?? [];
    list.push(meeting.relativePath);
    byMeetingId.set(id, list);
  }

  for (const [meetingId, paths] of byMeetingId) {
    if (paths.length <= 1) continue;
    const message = `duplicate meetingId "${meetingId}" shared by: ${paths.join(", ")}`;
    for (const folderReport of folderReports) {
      if (paths.some((p) => p.startsWith(`${folderReport.folder}/`))) {
        if (folderReport.parseErrors.indexOf(message) < 0) {
          folderReport.parseErrors.push(message);
        }
      }
    }
  }
}

export async function scanMeetingLibraryFromDisk(
  meetingsRoot = path.join(process.cwd(), MEETINGS_ROOT),
): Promise<{ meetings: MeetingLibraryEntry[]; scan: MeetingLibraryScan }> {
  let folderNames: string[];
  try {
    const items = await readdir(meetingsRoot, { withFileTypes: true });
    folderNames = items.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    const scan: MeetingLibraryScan = {
      source: "disk",
      rootPath: meetingsRoot,
      foldersScanned: [],
      folderReports: [],
      masterCsvFiles: [],
      meetingsReturned: 0,
      foldersExcluded: [],
    };
    return { meetings: [], scan };
  }

  folderNames.sort((a, b) => a.localeCompare(b));

  const all: MeetingLibraryEntry[] = [];
  const folderReports: MeetingLibraryFolderReport[] = [];
  const masterCsvFiles: string[] = [];
  const foldersExcluded: Array<{ folder: string; reason: string }> = [];

  for (const folderName of folderNames) {
    const absoluteDir = path.join(meetingsRoot, folderName);
    const { report, entries } = await scanFolder(folderName, absoluteDir);
    folderReports.push(report);

    if (!report.includedInLibrary && report.exclusionReason) {
      foldersExcluded.push({ folder: report.folder, reason: report.exclusionReason });
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

  applyDuplicateMeetingIdWarnings(folderReports, all);

  const scan: MeetingLibraryScan = {
    source: "disk",
    rootPath: meetingsRoot,
    foldersScanned: folderNames.map((name) => `${MEETINGS_ROOT}/${name}`),
    folderReports,
    masterCsvFiles,
    meetingsReturned: all.length,
    foldersExcluded,
  };

  return { meetings: all, scan };
}

export function synthesizeFolderReportsFromManifest(options: {
  meetings: MeetingLibraryEntry[];
  foldersScanned: string[];
  foldersExcluded: Array<{ folder: string; reason: string }>;
}): MeetingLibraryFolderReport[] {
  const meetingsByFolder = new Map<string, MeetingLibraryEntry[]>();
  for (const meeting of options.meetings) {
    const folder = meeting.relativePath.replace(/\/[^/]+$/, "");
    const list = meetingsByFolder.get(folder) ?? [];
    list.push(meeting);
    meetingsByFolder.set(folder, list);
  }

  const excludedByFolder = new Map(
    options.foldersExcluded.map((row) => [row.folder, row.reason] as const),
  );

  const reports: MeetingLibraryFolderReport[] = options.foldersScanned.map((folder) => {
    const folderName = folder.split("/").filter(Boolean).pop() ?? folder;
    const entries = meetingsByFolder.get(folder) ?? [];
    const folderMeta = parseMeetingFolderMeta(folderName);
    const masterCsvFilenames = entries.map((e) => e.fileName).sort();
    const excluded = excludedByFolder.get(folder);

    return {
      folder,
      folderName,
      masterCsvFound: masterCsvFilenames.length > 0,
      masterCsvCount: masterCsvFilenames.length,
      masterCsvFilenames,
      parsedDate: folderMeta?.date || entries[0]?.date || "",
      parsedTrack: folderMeta?.track || entries[0]?.track || "",
      meetingId: entries[0]?.meetingId || meetingIdFor(folder, folderMeta?.date || "", folderMeta?.track || ""),
      includedInLibrary: entries.length > 0 && !excluded,
      exclusionReason: excluded || (entries.length ? null : "no *_master.csv file in folder"),
      parseErrors: [],
    };
  });

  applyDuplicateMeetingIdWarnings(reports, options.meetings);
  return reports;
}
