import type { MeetingLibraryResult } from "@/lib/meeting-library-types";
import { safeMeetingCsvRelativePath } from "@/lib/meeting-library-paths";

export type {
  MeetingLibraryEntry,
  MeetingLibraryFolderReport,
  MeetingLibraryManifestFile,
  MeetingLibraryResult,
  MeetingLibraryScan,
} from "@/lib/meeting-library-types";

export { safeMeetingCsvRelativePath } from "@/lib/meeting-library-paths";

/** List committed `*_master.csv` meetings — manifest on Vercel, disk scan in dev. */
export async function listMeetingLibrary(): Promise<MeetingLibraryResult> {
  if (process.env.NODE_ENV === "production") {
    const { listMeetingLibraryFromManifest } = await import("@/lib/meeting-library-manifest");
    return listMeetingLibraryFromManifest();
  }
  const { listMeetingLibraryFromDisk } = await import("@/lib/meeting-library-disk");
  return listMeetingLibraryFromDisk();
}

export async function readMeetingLibraryCsv(relativePath: string): Promise<string> {
  const safe = safeMeetingCsvRelativePath(relativePath);
  if (!safe) throw new Error("Invalid meeting path");

  if (process.env.NODE_ENV === "production") {
    const { readMeetingLibraryCsvFromManifest } = await import("@/lib/meeting-library-manifest");
    return readMeetingLibraryCsvFromManifest(safe);
  }
  const { readMeetingLibraryCsvFromDisk } = await import("@/lib/meeting-library-disk");
  return readMeetingLibraryCsvFromDisk(safe);
}
