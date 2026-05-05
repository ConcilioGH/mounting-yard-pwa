import { openDB, type IDBPDatabase } from "idb";
import type { Assessment, AssessmentRow, Race } from "./types";
import { DEFAULT_RACES } from "./constants";
import { emptyAssessment } from "./utils";

const DB_NAME = "mounting-yard-assessment";
const DB_VERSION = 1;

type Schema = {
  races: { key: string; value: Race };
  assessments: { key: string; value: AssessmentRow };
};

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function getDB(): Promise<IDBPDatabase<Schema>> {
  if (!dbPromise) {
    dbPromise = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("races")) {
          database.createObjectStore("races", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("assessments")) {
          database.createObjectStore("assessments", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

export async function loadAllRaces(): Promise<Race[]> {
  const db = await getDB();
  const rows = await db.getAll("races");
  return rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
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
  const existing = await loadAllRaces();
  if (existing.length > 0) return;
  await saveRaces(DEFAULT_RACES);
}

export async function loadAllAssessments(): Promise<Record<string, Assessment>> {
  const db = await getDB();
  const rows = await db.getAll("assessments");
  const out: Record<string, Assessment> = {};
  for (const row of rows) {
    const { key, ...raw } = row;
    out[key] = {
      positive: raw.positive ?? {},
      negative: raw.negative ?? {},
      gear: raw.gear ?? {},
      notes: raw.notes ?? "",
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
    };
  }
  return out;
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
    notes: patch.notes ?? b.notes,
    updatedAt: new Date().toISOString(),
  };
}
