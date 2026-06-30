import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MeetingLibraryResult } from "@/lib/meeting-library-types";
import { scanMeetingLibraryFromDisk } from "@/lib/meeting-library-scan";

function logScan(result: MeetingLibraryResult): void {
  const { scan, meetings } = result;
  console.log("[meeting-library] source: disk", scan.rootPath);
  console.log("[meeting-library] folders scanned:", scan.foldersScanned.length, scan.foldersScanned);
  console.log("[meeting-library] master CSV files found:", scan.masterCsvFiles.length, scan.masterCsvFiles);
  console.log("[meeting-library] folders excluded:", scan.foldersExcluded.length, scan.foldersExcluded);
  console.log("[meeting-library] meetings returned:", meetings.length);
}

/** Dev/local: scan repo `meetings/` on disk. */
export async function listMeetingLibraryFromDisk(): Promise<MeetingLibraryResult> {
  const result = await scanMeetingLibraryFromDisk();
  logScan(result);
  return result;
}

export async function readMeetingLibraryCsvFromDisk(relativePath: string): Promise<string> {
  const absolute = path.join(process.cwd(), relativePath);
  return readFile(absolute, "utf8");
}
