/** Active localStorage key for speed-map broadcast state. */
export const SPEED_MAP_STORAGE_KEY = "speed-map-broadcast-state-v2";

const LEGACY_SPEED_MAP_STORAGE_KEYS = ["speed-map-broadcast-state-v1"] as const;

const KNOWN_INDEXED_DB_NAMES = [
  "mounting-yard-pwa",
  "speed-map",
  "mounting-yard-assessment",
  "mounting-yard-meeting-dir",
] as const;

function deleteIndexedDbDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to delete IndexedDB: ${name}`));
    request.onblocked = () => resolve();
  });
}

/** Remove speed-map localStorage entries (current + legacy keys). */
export function clearSpeedMapLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SPEED_MAP_STORAGE_KEY);
  for (const key of LEGACY_SPEED_MAP_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}

/**
 * Full app storage wipe (debug / recovery). Clears all localStorage and IndexedDB databases
 * visible to this origin, including legacy speed-map keys.
 */
export async function hardResetAppStorage(): Promise<void> {
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }

  if (typeof indexedDB === "undefined") return;

  if (typeof indexedDB.databases === "function") {
    const databases = await indexedDB.databases();
    await Promise.all(
      databases.map((db) => (db.name ? deleteIndexedDbDatabase(db.name) : Promise.resolve())),
    );
    return;
  }

  await Promise.all(KNOWN_INDEXED_DB_NAMES.map((name) => deleteIndexedDbDatabase(name)));
}
