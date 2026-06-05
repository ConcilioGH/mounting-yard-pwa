import { downloadTextFile } from "@/lib/csv";
import {
  buildMeetingExportFilename,
  type MeetingExportKind,
} from "@/lib/meeting-export";
import { loadMeetingDirectoryHandle } from "@/lib/meeting-folder-handle";
import { loadMeetingManifest } from "@/lib/meeting-coordination";

export type DeliverMeetingExportOptions = {
  fallbackTrack?: string;
};

async function ensureDirectoryWritePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  if (!("requestPermission" in handle) || typeof handle.requestPermission !== "function") {
    return true;
  }
  const permission = await handle.requestPermission({ mode: "readwrite" });
  return permission === "granted";
}

async function writeViaDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  filename: string,
  content: string,
): Promise<boolean> {
  try {
    if (!(await ensureDirectoryWritePermission(handle))) return false;
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (error) {
    console.warn("[meeting export] directory handle write failed", error);
    return false;
  }
}

async function writeViaApi(
  folderPath: string,
  filename: string,
  content: string,
): Promise<boolean> {
  try {
    const res = await fetch("/api/meeting-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath, filename, content }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return Boolean(data.ok);
  } catch (error) {
    console.warn("[meeting export] API write failed", error);
    return false;
  }
}

/**
 * Save export CSV into the imported meeting folder when possible; otherwise browser download.
 */
export async function deliverMeetingExport(
  kind: MeetingExportKind,
  content: string,
  options?: DeliverMeetingExportOptions,
): Promise<void> {
  const manifest = loadMeetingManifest();
  const filename = buildMeetingExportFilename(kind, manifest, {
    fallbackTrack: options?.fallbackTrack,
  });
  const folderPath = manifest?.meetingFolderPath?.trim() ?? "";

  console.log("EXPORT PATH:", folderPath || "(none — browser download fallback)");
  console.log("EXPORT FILENAME:", filename);

  if (manifest?.meetingKey) {
    const handle = await loadMeetingDirectoryHandle(manifest.meetingKey);
    if (handle) {
      const wrote = await writeViaDirectoryHandle(handle, filename, content);
      if (wrote) {
        const displayPath = folderPath
          ? `${folderPath.replace(/\/+$/, "")}/${filename}`
          : `${handle.name}/${filename}`;
        console.log("EXPORT PATH:", displayPath);
        return;
      }
    }
  }

  if (folderPath) {
    const wrote = await writeViaApi(folderPath, filename, content);
    if (wrote) {
      console.log("EXPORT PATH:", `${folderPath.replace(/\/+$/, "")}/${filename}`);
      return;
    }
  }

  console.log("EXPORT PATH:", "(browser download fallback)");
  downloadTextFile(filename, content);
}
