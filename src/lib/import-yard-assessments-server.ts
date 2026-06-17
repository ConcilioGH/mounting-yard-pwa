import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseMeetingCsv } from "@/lib/csv";
import {
  buildMeetingKey,
  raceNosFromMountingYardRaces,
  type MeetingManifest,
} from "@/lib/meeting-coordination";
import { buildMeetingExportFilename, parseMeetingFolderMeta } from "@/lib/meeting-export";
import { listMeetingLibrary, readMeetingLibraryCsv } from "@/lib/meeting-library-server";

export function safeMeetingFolderPath(folderPath: string): string | null {
  const normalized = String(folderPath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!normalized.startsWith("meetings/")) return null;
  if (normalized.includes("..")) return null;
  if (!normalized.includes("/")) return null;
  return normalized;
}

async function findMeetingFolderByKey(meetingKey: string): Promise<string | null> {
  const entries = await listMeetingLibrary();
  for (const entry of entries) {
    try {
      const content = await readMeetingLibraryCsv(entry.relativePath);
      const parsed = parseMeetingCsv(content, entry.fileName);
      const key = buildMeetingKey(raceNosFromMountingYardRaces(parsed.races));
      if (key === meetingKey) {
        return path.dirname(entry.relativePath).replace(/\\/g, "/");
      }
    } catch {
      continue;
    }
  }
  return null;
}

function manifestForFolder(folder: string, meetingKey: string): MeetingManifest {
  const folderMeta = parseMeetingFolderMeta(folder);
  const track = folderMeta?.track ?? "";
  const date = folderMeta?.date ?? "";
  return {
    meetingId: date && track ? `${date}-${track}` : meetingKey,
    meetingKey,
    trackName: track,
    trackSlug: track,
    date,
    meetingFolderPath: folder,
    raceNos: meetingKey.split("|").filter(Boolean),
    importedAt: "",
  };
}

/** Write iPad yard assessments CSV into repo `meetings/{folder}/`. */
export async function importYardAssessmentsToMeetingFolder(options: {
  meetingKey: string;
  csv: string;
  meetingFolderPath?: string;
}): Promise<{ savedTo: string; folderPath: string; filename: string }> {
  const meetingKey = String(options.meetingKey ?? "").trim();
  const csv = options.csv;
  if (!meetingKey) throw new Error("meetingKey is required");
  if (typeof csv !== "string" || !csv.trim()) throw new Error("csv is required");

  let folder = safeMeetingFolderPath(String(options.meetingFolderPath ?? "").trim());
  if (!folder) {
    folder = await findMeetingFolderByKey(meetingKey);
  }
  if (!folder) throw new Error("Meeting folder not found for meetingKey");

  const manifest = manifestForFolder(folder, meetingKey);
  const filename = buildMeetingExportFilename("mounting-yard-assessments", manifest);
  const destDir = path.join(process.cwd(), folder);
  const destFile = path.join(destDir, filename);

  await mkdir(destDir, { recursive: true });
  await writeFile(destFile, csv, "utf8");

  const savedTo = `${folder}/${filename}`;
  return { savedTo, folderPath: folder, filename };
}
