import { readFile } from "node:fs/promises";
import path from "node:path";
import manifestData from "@/data/meeting-library-manifest.json";
import type { MeetingLibraryEntry, MeetingLibraryManifestFile, MeetingLibraryResult } from "@/lib/meeting-library-types";
import { safeMeetingCsvRelativePath } from "@/lib/meeting-library-paths";
import { synthesizeFolderReportsFromManifest } from "@/lib/meeting-library-scan";
import { deriveMeetingId } from "@/lib/race-day-bias/storage";
import { parseMeetingFolderMeta } from "@/lib/meeting-export";

const manifest = manifestData as MeetingLibraryManifestFile;

function withMeetingIds(meetings: MeetingLibraryEntry[]): MeetingLibraryEntry[] {
  return meetings.map((meeting) => {
    if (meeting.meetingId?.trim()) return meeting;
    const folder = meeting.relativePath.replace(/\/[^/]+$/, "");
    const folderMeta = parseMeetingFolderMeta(folder);
    return {
      ...meeting,
      meetingId:
        deriveMeetingId({
          date: meeting.date || folderMeta?.date || "",
          trackSlug: meeting.track || folderMeta?.track || "",
          meetingFolderPath: folder,
        }) || "",
    };
  });
}

const allowedMasterPaths = new Set(
  manifest.meetings.map((meeting) => meeting.relativePath.replace(/\\/g, "/")),
);

/** Production/Vercel: serve meetings from build-time manifest (no disk scan). */
export async function listMeetingLibraryFromManifest(): Promise<MeetingLibraryResult> {
  const meetings = withMeetingIds(manifest.meetings.slice()).sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });

  const folderReports =
    manifest.scan.folderReports?.length
      ? manifest.scan.folderReports
      : synthesizeFolderReportsFromManifest({
          meetings,
          foldersScanned: manifest.scan.foldersScanned,
          foldersExcluded: manifest.scan.foldersExcluded,
        });

  const scan = {
    ...manifest.scan,
    source: "build-manifest" as const,
    generatedAt: manifest.generatedAt,
    folderReports,
    meetingsReturned: meetings.length,
    rootPath: manifest.scan.rootPath || "meeting-library-manifest",
  };

  console.log("[meeting-library] source: build manifest", manifest.generatedAt);
  console.log("[meeting-library] folders scanned:", scan.foldersScanned.length, scan.foldersScanned);
  console.log("[meeting-library] master CSV files found:", scan.masterCsvFiles.length, scan.masterCsvFiles);
  console.log("[meeting-library] folders excluded:", scan.foldersExcluded.length, scan.foldersExcluded);
  console.log("[meeting-library] meetings returned:", meetings.length);

  return { meetings, scan };
}

export async function readMeetingLibraryCsvFromManifest(relativePath: string): Promise<string> {
  const safe = safeMeetingCsvRelativePath(relativePath);
  if (!safe || !/_master\.csv$/i.test(safe)) {
    throw new Error("Invalid meeting path");
  }
  if (!allowedMasterPaths.has(safe)) {
    throw new Error("Meeting file not found");
  }
  const absolute = path.join(process.cwd(), safe);
  return readFile(absolute, "utf8");
}
