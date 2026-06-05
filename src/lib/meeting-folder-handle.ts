import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "mounting-yard-meeting-dir";
const DB_VERSION = 1;
const STORE = "handles";

type Schema = {
  handles: { key: string; value: FileSystemDirectoryHandle };
};

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function getDB(): Promise<IDBPDatabase<Schema>> {
  if (!dbPromise) {
    dbPromise = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function saveMeetingDirectoryHandle(
  meetingKey: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await getDB();
  await db.put(STORE, handle, meetingKey);
}

export async function loadMeetingDirectoryHandle(
  meetingKey: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await getDB();
    const handle = await db.get(STORE, meetingKey);
    return handle ?? null;
  } catch {
    return null;
  }
}

export async function clearMeetingDirectoryHandle(meetingKey: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, meetingKey);
}

/** Find a master or first CSV in the picked meeting folder. */
export async function readMeetingCsvFromDirectory(
  dir: FileSystemDirectoryHandle,
): Promise<{ file: File; name: string }> {
  const csvFiles: { name: string; file: File }[] = [];
  const dirWithEntries = dir as FileSystemDirectoryHandle & {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  for await (const [name, handle] of dirWithEntries.entries()) {
    if (handle.kind !== "file") continue;
    if (!name.toLowerCase().endsWith(".csv")) continue;
    const file = await (handle as FileSystemFileHandle).getFile();
    csvFiles.push({ name, file });
  }
  if (!csvFiles.length) {
    throw new Error("No CSV file found in the selected meeting folder.");
  }
  const master =
    csvFiles.find((f) => /_master\.csv$/i.test(f.name)) ??
    csvFiles.sort((a, b) => a.name.localeCompare(b.name))[0]!;
  return { file: master.file, name: master.name };
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickMeetingDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!supportsDirectoryPicker()) {
    throw new Error("Folder picker is not supported in this browser.");
  }
  const picker = (
    window as Window & {
      showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  return picker!({ mode: "readwrite" });
}
