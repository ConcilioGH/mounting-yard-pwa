import Papa from "papaparse";
import type { Race, Runner, Assessment } from "./types";
import { makeKey } from "./utils";
import { wetBodyLabel, wetFeetLabel } from "./wet";
import {
  inferMeetingDateFromFileName,
  inferMeetingTrackFromFileName,
} from "@/lib/meeting-export";
import { isRunnerRowScratched } from "@/lib/speed-map";

/** Skip scratched rows for Yard and Speed Map (Racenet `scratched` column and odds SCR). */
function isMeetingCsvRowScratched(raw: Record<string, unknown>): boolean {
  return isRunnerRowScratched(
    raw.scratched ?? raw.Scratched ?? raw.scratch ?? raw.Scratch,
    raw.odds ?? raw.Odds,
  );
}

function normalizeRaceNo(value: string): string {
  const trimmed = String(value ?? "").trim();
  const match = /^R?(\d+)$/i.exec(trimmed);
  if (match) return match[1]!;
  return trimmed;
}

export type MeetingCsvMeta = {
  trackName: string;
  date: string;
  going: string;
  rail: string;
};

export type MeetingCsvSpeedRunner = {
  no: number;
  horse: string;
  barrier: number;
  wIrRaw?: unknown;
};

export type MeetingCsvSpeedRace = {
  raceNo: string;
  raceName: string;
  distance?: string;
  grade?: string;
  going?: string;
  rail?: string;
  track?: string;
  runners: MeetingCsvSpeedRunner[];
};

export type MeetingCsvParseResult = {
  races: Race[];
  meta: MeetingCsvMeta;
  speedMapRaces: MeetingCsvSpeedRace[];
};

export type RaceImportRow = {
  race_id: string;
  race_title?: string;
  runner_no: string | number;
  horse: string;
  barrier: string | number;
  trainer: string;
  jockey: string;
  odds: string;
};

export type RaceImportRowExtended = RaceImportRow & { race?: string | number };

const REQUIRED: (keyof RaceImportRow)[] = [
  "race_id",
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
    const rawWithRace = raw as RaceImportRowExtended;
    const raceId = String(rawWithRace.race_id ?? rawWithRace.race ?? "").trim();
    const titleRaw = String(rawWithRace.race_title ?? "").trim();
    const title = titleRaw || `R${raceId}`;
    if (!raceId) continue;

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

function readMetaCell(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const variants = [key, key.toLowerCase(), key.replace(/\s+/g, "_")];
    for (const variant of variants) {
      const value = row[variant];
      if (value === null || value === undefined) continue;
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return "";
}

function readOptionalDate(row: Record<string, unknown>): string {
  const raw = readMetaCell(row, [
    "meeting_date",
    "meetingDate",
    "date",
    "race_date",
    "raceDate",
  ]);
  const match = raw.match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

/** Parse mounting-yard meeting CSV (races + optional track/date/speed metadata). */
export function parseMeetingCsv(text: string, fileName?: string): MeetingCsvParseResult {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
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

  let trackName = "";
  let date = "";
  let going = "";
  let rail = "";

  const byRace = new Map<string, { title: string; runners: Runner[] }>();
  const speedByRace = new Map<string, MeetingCsvSpeedRace>();

  for (const raw of rows) {
    if (isMeetingCsvRowScratched(raw)) continue;

    if (!trackName) {
      trackName = readMetaCell(raw, ["track", "meeting_track", "venue", "venue_name", "meeting"]);
    }
    if (!date) date = readOptionalDate(raw);
    if (!going) going = readMetaCell(raw, ["going", "track_condition", "condition"]);
    if (!rail) rail = readMetaCell(raw, ["rail", "rail_position"]);

    const raceId = String(raw.race_id ?? raw.race ?? "").trim();
    const titleRaw = String(raw.race_title ?? "").trim();
    const title = titleRaw || `R${raceId}`;
    if (!raceId) continue;

    const runner: Runner = {
      no: num(raw.runner_no as string | number, "runner_no"),
      horse: String(raw.horse ?? "").trim(),
      br: num(raw.barrier as string | number, "barrier"),
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
    if (bucket.title !== title) bucket.title = title;
    bucket.runners.push(runner);

    const raceNo = normalizeRaceNo(String(raw.race_no ?? raceId));
    let speedRace = speedByRace.get(raceNo);
    if (!speedRace) {
      speedRace = {
        raceNo,
        raceName: title,
        distance: readMetaCell(raw, ["distance", "dist", "race_distance"]),
        grade: readMetaCell(raw, ["grade", "class", "race_class"]),
        going: readMetaCell(raw, ["going", "track_condition", "condition"]),
        rail: readMetaCell(raw, ["rail", "rail_position"]),
        track: readMetaCell(raw, ["track", "meeting_track", "venue"]),
        runners: [],
      };
      speedByRace.set(raceNo, speedRace);
    }
    speedRace.runners.push({
      no: runner.no,
      horse: runner.horse,
      barrier: runner.br,
      wIrRaw: raw.w_ir ?? raw.wir ?? raw.speed,
    });
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

  const speedMapRaces = [...speedByRace.values()].sort((a, b) =>
    a.raceNo.localeCompare(b.raceNo, undefined, { numeric: true }),
  );

  const fileTrack = fileName ? inferMeetingTrackFromFileName(fileName) : "";
  const fileDate = fileName ? inferMeetingDateFromFileName(fileName) : "";

  return {
    races,
    meta: {
      trackName: trackName || fileTrack,
      date: date || fileDate,
      going,
      rail,
    },
    speedMapRaces,
  };
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
    wetBodyLabel(a?.wet?.bodyType) || "",
    wetFeetLabel(a?.wet?.feet) || "",
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
    "wet_body_type",
    "wet_feet",
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
