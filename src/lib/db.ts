import { openDB, type IDBPDatabase } from "idb";
import { withTimeout } from "@/lib/promise-timeout";
import { reportStartupFailure, traceAsync } from "@/lib/startup-diagnostics";
import type { Assessment, AssessmentRow, Race } from "./types";
import { DEFAULT_RACES } from "./constants";
import { normalizeGearFromStorage } from "./gear";
import { normalizeWetFromStorage } from "./wet";
import { emptyAssessment } from "./utils";

const DB_NAME = "mounting-yard-assessment";
const DB_VERSION = 1;
const DB_OPEN_TIMEOUT_MS = 4_000;

type Schema = {
  races: { key: string; value: Race };
  assessments: { key: string; value: AssessmentRow };
};

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function getDB(): Promise<IDBPDatabase<Schema>> {
  if (!dbPromise) {
    dbPromise = withTimeout(
      traceAsync("indexeddb-open", () =>
        openDB<Schema>(DB_NAME, DB_VERSION, {
          upgrade(database) {
            if (!database.objectStoreNames.contains("races")) {
              database.createObjectStore("races", { keyPath: "id" });
            }
            if (!database.objectStoreNames.contains("assessments")) {
              database.createObjectStore("assessments", { keyPath: "key" });
            }
          },
        }),
      ),
      DB_OPEN_TIMEOUT_MS,
      "indexeddb-open",
    ).catch((error) => {
      dbPromise = null;
      reportStartupFailure("indexeddb-open", error);
      throw error;
    });
  }
  return dbPromise;
}

export async function loadAllRaces(): Promise<Race[]> {
  return traceAsync("race-data-load", async () => {
    try {
      const db = await getDB();
      const rows = await db.getAll("races");
      return rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    } catch (error) {
      reportStartupFailure("race-data-load", error);
      return [];
    }
  });
}

export async function saveRace(race: Race): Promise<void> {
  const db = await getDB();
  await db.put("races", race);
}

export async function saveRaces(races: Race[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("races", "readwrite");
  await tx.store.clear();
  for (const r of races) {
    await tx.store.put(r);
  }
  await tx.done;
}

export async function seedRacesIfEmpty(): Promise<void> {
  return traceAsync("indexeddb-seed-races", async () => {
    try {
      const existing = await loadAllRaces();
      if (existing.length > 0) return;
      await saveRaces(DEFAULT_RACES);
    } catch (error) {
      reportStartupFailure("indexeddb-seed-races", error);
    }
  });
}

export async function loadAllAssessments(): Promise<Record<string, Assessment>> {
  return traceAsync("indexeddb-load-assessments", async () => {
    try {
      const db = await getDB();
      const rows = await db.getAll("assessments");
      const out: Record<string, Assessment> = {};
      for (const row of rows) {
        const { key, ...raw } = row;
        out[key] = {
          positive: raw.positive ?? {},
          negative: raw.negative ?? {},
          gear: normalizeGearFromStorage(raw.gear),
          wet: normalizeWetFromStorage(raw.wet),
          notes: raw.notes ?? "",
          updatedAt: raw.updatedAt ?? new Date().toISOString(),
        };
      }
      return out;
    } catch (error) {
      reportStartupFailure("indexeddb-load-assessments", error);
      return {};
    }
  });
}

export async function saveAssessmentRow(key: string, assessment: Assessment): Promise<void> {
  const db = await getDB();
  const row: AssessmentRow = { key, ...assessment };
  await db.put("assessments", row);
}

/** Replaces the entire assessments store with the in-memory snapshot (reliable autosave). */
export async function replaceAllAssessments(data: Record<string, Assessment>): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("assessments", "readwrite");
  await tx.store.clear();
  for (const [key, assessment] of Object.entries(data)) {
    await tx.store.put({ key, ...assessment });
  }
  await tx.done;
}

export async function clearAllAssessments(): Promise<void> {
  const db = await getDB();
  await db.clear("assessments");
}

export async function removeAssessment(key: string): Promise<void> {
  const db = await getDB();
  await db.delete("assessments", key);
}

export function mergeAssessment(patch: Partial<Assessment>, base?: Assessment): Assessment {
  const b = base ?? emptyAssessment();
  return {
    ...b,
    ...patch,
    positive: patch.positive ?? b.positive,
    negative: patch.negative ?? b.negative,
    gear: patch.gear ?? b.gear,
    wet: patch.wet ?? b.wet,
    notes: patch.notes ?? b.notes,
    updatedAt: new Date().toISOString(),
  };
}
