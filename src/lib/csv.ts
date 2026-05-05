import Papa from "papaparse";
import type { Race, Runner, Assessment } from "./types";
import { makeKey } from "./utils";

export type RaceImportRow = {
  race_id: string;
  race_title: string;
  runner_no: string | number;
  horse: string;
  barrier: string | number;
  trainer: string;
  jockey: string;
  odds: string;
};

const REQUIRED: (keyof RaceImportRow)[] = [
  "race_id",
  "race_title",
  "runner_no",
  "horse",
  "barrier",
  "trainer",
  "jockey",
  "odds",
];

function num(v: string | number, field: string): number {
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${field}`);
  return n;
}

export function parseRacesCsv(text: string): Race[] {
  const parsed = Papa.parse<RaceImportRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => {
      const x = h
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
      if (x === "br") return "barrier";
      if (x === "no" || x === "num" || x === "number") return "runner_no";
      return x;
    },
  });

  if (parsed.errors.length) {
    const msg = parsed.errors.map((e) => e.message).join("; ");
    throw new Error(`CSV parse: ${msg}`);
  }

  const rows = parsed.data.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""));
  if (rows.length === 0) throw new Error("No data rows in CSV");

  const headerMap = parsed.meta.fields?.map((f) => f.toLowerCase().replace(/\s+/g, "_")) ?? [];
  for (const col of REQUIRED) {
    if (!headerMap.includes(col)) {
      throw new Error(`Missing required column: ${col}. Found: ${headerMap.join(", ")}`);
    }
  }

  const byRace = new Map<string, { title: string; runners: Runner[] }>();

  for (const raw of rows) {
    const raceId = String(raw.race_id ?? "").trim();
    const title = String(raw.race_title ?? "").trim();
    if (!raceId || !title) continue;

    const runner: Runner = {
      no: num(raw.runner_no, "runner_no"),
      horse: String(raw.horse ?? "").trim(),
      br: num(raw.barrier, "barrier"),
      trainer: String(raw.trainer ?? "").trim(),
      jockey: String(raw.jockey ?? "").trim(),
      odds: String(raw.odds ?? "").trim(),
    };

    if (!runner.horse) throw new Error(`Missing horse for race ${raceId} runner ${runner.no}`);

    let bucket = byRace.get(raceId);
    if (!bucket) {
      bucket = { title, runners: [] };
      byRace.set(raceId, bucket);
    }
    if (bucket.title !== title) {
      bucket.title = title;
    }
    bucket.runners.push(runner);
  }

  if (byRace.size === 0) {
    throw new Error("No valid rows. Each row needs race_id and race_title (check spelling and commas).");
  }

  const races: Race[] = [...byRace.entries()].map(([id, { title, runners }]) => ({
    id,
    title,
    runners: [...runners].sort((a, b) => a.no - b.no),
  }));

  races.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return races;
}

function rowForAssessment(
  assessmentKey: string,
  raceId: string,
  raceTitle: string,
  r: Runner | null,
  a: Assessment | undefined,
): string[] {
  const pos = a
    ? Object.values(a.positive).reduce((sum, v) => sum + Math.max(0, v ?? 0), 0)
    : 0;
  const neg = a
    ? Object.values(a.negative).reduce((sum, v) => sum + Math.abs(Math.min(0, v ?? 0)), 0)
    : 0;
  return [
    assessmentKey,
    raceId,
    raceTitle,
    r ? String(r.no) : "",
    r?.horse ?? "",
    r ? String(r.br) : "",
    r?.trainer ?? "",
    r?.jockey ?? "",
    r?.odds ?? "",
    a ? JSON.stringify(a.positive) : "",
    a ? JSON.stringify(a.negative) : "",
    a ? JSON.stringify(a.gear) : "",
    a?.notes ?? "",
    String(pos),
    String(neg),
    String(pos - neg),
    a?.updatedAt ?? "",
  ];
}

/** One row per runner in `races`, plus any orphan assessment keys not in that set. */
export function buildAssessmentsExportCsv(
  races: Race[],
  assessments: Record<string, Assessment>,
): string {
  const headers = [
    "assessment_key",
    "race_id",
    "race_title",
    "runner_no",
    "horse",
    "barrier",
    "trainer",
    "jockey",
    "odds",
    "positive_json",
    "negative_json",
    "gear_json",
    "notes",
    "total_positive",
    "total_negative",
    "net",
    "updated_at",
  ];

  const lines: string[][] = [headers];
  const emitted = new Set<string>();

  for (const race of races) {
    for (const r of race.runners) {
      const assessmentKey = makeKey(race.id, r.no);
      emitted.add(assessmentKey);
      const a = assessments[assessmentKey];
      lines.push(rowForAssessment(assessmentKey, race.id, race.title, r, a));
    }
  }

  for (const k of Object.keys(assessments).sort()) {
    if (emitted.has(k)) continue;
    const a = assessments[k];
    lines.push(rowForAssessment(k, "", "", null, a));
  }

  return Papa.unparse(lines);
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
