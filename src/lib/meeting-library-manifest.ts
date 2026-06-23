import { readFile } from "node:fs/promises";
import path from "node:path";
import manifestData from "@/data/meeting-library-manifest.json";
import type { MeetingLibraryManifestFile, MeetingLibraryResult } from "@/lib/meeting-library-types";
import { safeMeetingCsvRelativePath } from "@/lib/meeting-library-paths";

const manifest = manifestData as MeetingLibraryManifestFile;

const allowedMasterPaths = new Set(
  manifest.meetings.map((meeting) => meeting.relativePath.replace(/\\/g, "/")),
);

/** Production/Vercel: serve meetings from build-time manifest (no disk scan). */
export async function listMeetingLibraryFromManifest(): Promise<MeetingLibraryResult> {
  const meetings = manifest.meetings.slice().sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });

  const scan = {
    ...manifest.scan,
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
