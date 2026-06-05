import Papa from "papaparse";
import { mapRunnerByWir } from "@/lib/mapRunnerByWir";
import {
  getTileLeftNorm,
  MAX_WIR,
  MIN_WIR,
  SPEED_MAP_TRACK_WIDTH_PX,
  VISUAL_COLUMNS,
} from "@/lib/wirTrackScale";
import { pressureFromRunnersByWirScale } from "@/lib/pressureModel";

export const POSITION_BANDS = [
  "Backmarker",
  "Midfield/Backmarker",
  "Midfield",
  "On Pace/Midfield",
  "On Pace",
  "Leader",
] as const;

export type PositionBand = (typeof POSITION_BANDS)[number];
export type PressureLabel = "Low" | "Moderate" | "High" | "Extreme";

export type RunnerFlags = {
  favourite: boolean;
  target: boolean;
  mapAdvantage: boolean;
  risk: boolean;
};

export type SpeedMapRunner = {
  id: string;
  no: number;
  horse: string;
  barrier: string;
  wIr: number;
  displayWir: string;
  hasSpeedData: boolean;
  manuallyPlaced: boolean;
  /** Active-board lane index (0 = rail); set by speed-map-board placement. DEBUG overlay prefers this over inferring from `y`. */
  lane?: number;
  x: number;
  y: number;
  modelX: number;
  modelY: number;
  flags: RunnerFlags;
};

export type RaceMeta = {
  track: string;
  race: string;
  distance: string;
  grade: string;
  going: string;
  rail: string;
};

export type SpeedMapImportDebug = {
  csvRowCountForRace: number;
  scratchedCountForRace: number;
  nonScratchedRunnerCount: number;
  parsedHorseNames: string[];
};

export type RaceHeaderFields = {
  distance?: string;
  track?: string;
  startTime?: string;
  grade?: string;
  going?: string;
  rail?: string;
  /** Raw CSV aliases merged into canonical header fields. */
  dist?: string;
  raceDistance?: string;
  trackCondition?: string;
  condition?: string;
  railPosition?: string;
};

const DISTANCE_HEADER_ALIASES = [
  "distance",
  "Distance",
  "dist",
  "Dist",
  "raceDistance",
  "race_distance",
  "RaceDistance",
  "distance_rounded",
  "Distance_Rounded",
];

const GOING_HEADER_ALIASES = [
  "going",
  "Going",
  "trackCondition",
  "track_condition",
  "TrackCondition",
  "condition",
  "Condition",
  "Track Condition",
  "track condition",
];

const RAIL_HEADER_ALIASES = [
  "rail",
  "Rail",
  "railPosition",
  "rail_position",
  "RailPosition",
  "railTrue",
  "Rail Position",
  "rail position",
];

export type RaceMapStateEntry = {
  raceName: string;
  distance: string;
  runners: SpeedMapRunner[];
  notes: string;
  importDebug?: SpeedMapImportDebug;
  /** Marks active-board placement pipeline; legacy imports omit or use assignModel. */
  placementEngine?: string;
} & RaceHeaderFields;

export type SavedMapState = {
  /** @deprecated Legacy meeting-level meta; prefer `meetingTrack`. */
  meta?: RaceMeta;
  meetingKey?: string;
  meetingTrack?: string;
  meetingGoing?: string;
  meetingRail?: string;
  races: Record<string, RaceMapStateEntry>;
  activeRaceNo: string;
};

export type RaceBucket = {
  raceNo: string;
  raceName: string;
  distance: string;
  runners: SpeedMapRunner[];
  importDebug?: SpeedMapImportDebug;
} & RaceHeaderFields;

export type ParseRunnersCsvResult = {
  races: RaceBucket[];
  meetingTrack: string;
  meetingGoing: string;
  meetingRail: string;
};

/** Empty meta field display in read-only / recording mode. */
export const RACE_META_EMPTY_DISPLAY = "—";

/** Shown when required CSV columns are missing (import UI + thrown errors). */
export const SPEED_MAP_CSV_IMPORT_HELP =
  "CSV requires race_no, runner_no, horse/name, and barrier. Optional metadata columns supported: track, race_title, distance, grade, going, rail, w_ir.";

const CSV_REQUIRED_RUNNER_FIELDS = ["race_no", "runner_no", "horse", "barrier"] as const;

const CSV_OPTIONAL_RACE_METADATA_ALIASES = [
  "track",
  "race_title",
  "race_name",
  "distance",
  "grade",
  "going",
  "rail",
  "w_ir",
  "start_time",
  "race_id",
] as const;

export function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Normalize blank metadata values for display. */
export function cleanMetaString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeMetaKey(key: string): string {
  return key.toLowerCase().replace(/[\s_]/g, "");
}

/** Fuzzy key lookup on any object (case/spacing/underscore insensitive). */
export function getField(source: unknown, aliases: string[]): string {
  if (!source || typeof source !== "object") return "";
  const record = source as Record<string, unknown>;
  const keys = Object.keys(record);
  for (const alias of aliases) {
    const foundKey = keys.find(
      (k) => normalizeMetaKey(k) === normalizeMetaKey(alias),
    );
    if (foundKey && record[foundKey] != null && String(record[foundKey]).trim() !== "") {
      return String(record[foundKey]).trim();
    }
  }
  return "";
}

/** @deprecated Use getField */
export function getMeta(obj: unknown, names: string[]): string {
  return getField(obj, names);
}

function metaFromRaceAndRunners(race: unknown, names: string[]): string {
  const fromRace = getField(race, names);
  if (fromRace) return fromRace;
  if (!race || typeof race !== "object") return "";
  const runners = (race as Record<string, unknown>).runners;
  if (!Array.isArray(runners) || !runners[0]) return "";
  return getField(runners[0], names);
}

/** Parse distance / grade from a race title (e.g. "1600m", "Benchmark 72", "Listed"). */
export function parseRaceHeaderFromTitle(raceName: string): { distance: string; grade: string } {
  const title = raceName.trim();
  const parsedDistance = title.match(/\b\d{3,4}m\b/i)?.[0] ?? "";
  let parsedGrade = "";
  const bmDirect = title.match(/\bBM\s*(\d+)\b/i);
  if (bmDirect?.[1]) {
    parsedGrade = `BM${bmDirect[1]}`;
  } else {
    const benchmark = title.match(/\bBenchmark\s*(\d+)\b/i);
    if (benchmark?.[1]) {
      parsedGrade = `BM${benchmark[1]}`;
    } else if (/\bMaiden\b/i.test(title) || /\bMDN\b/i.test(title)) {
      parsedGrade = "Maiden";
    } else {
      const cls = title.match(/\bClass\s*(\d+)\b/i);
      if (cls?.[1]) {
        parsedGrade = `Class ${cls[1]}`;
      } else if (/\bListed\b/i.test(title)) {
        parsedGrade = "Listed";
      } else {
        const grp = title.match(/\bGroup\s*(\d+)\b/i);
        if (grp?.[1]) parsedGrade = `Group ${grp[1]}`;
      }
    }
  }
  return { distance: parsedDistance, grade: parsedGrade };
}

/** @alias parseRaceHeaderFromTitle — distance from race title */
export function extractDistanceFromRaceName(raceName: string): string {
  return parseRaceHeaderFromTitle(raceName).distance;
}

/** @alias parseRaceHeaderFromTitle — grade from race title */
export function extractGradeFromRaceName(raceName: string): string {
  return parseRaceHeaderFromTitle(raceName).grade;
}

function raceNameForHeader(race: unknown): string {
  return firstNonEmpty(
    getField(race, ["raceName", "race_name", "race_title", "raceTitle"]),
    race && typeof race === "object" && "raceName" in race
      ? String((race as { raceName?: unknown }).raceName ?? "").trim()
      : "",
  );
}

/** Resolve distance / going / rail from race entry + optional meeting fallbacks. */
export function resolveRaceHeaderMetadata(
  raceNo: string,
  race: ({ distance?: string; raceName?: string } & RaceHeaderFields) | undefined,
  meeting: { track?: string; going?: string; rail?: string } = {},
): {
  raceNo: string;
  rawRace: ({ distance?: string; raceName?: string } & RaceHeaderFields) | undefined;
  distance: string;
  going: string;
  rail: string;
  track: string;
  grade: string;
} {
  const typed = race as (RaceHeaderFields & { raceName?: string }) | undefined;
  const { distance: parsedDistance, grade: parsedGrade } = parseRaceHeaderFromTitle(
    raceNameForHeader(race),
  );
  const distance = firstNonEmpty(
    metaFromRaceAndRunners(race, ["distance", "dist", "raceDistance"]),
    typed?.distance,
    typed?.dist,
    typed?.raceDistance,
    parsedDistance,
  );
  const going = firstNonEmpty(
    metaFromRaceAndRunners(race, ["going", "trackCondition", "condition"]),
    typed?.going,
    typed?.trackCondition,
    typed?.condition,
    meeting.going,
  );
  const rail = firstNonEmpty(
    metaFromRaceAndRunners(race, ["rail", "railPosition", "railTrue"]),
    typed?.rail,
    typed?.railPosition,
    meeting.rail,
  );
  return {
    raceNo,
    rawRace: race,
    distance,
    going,
    rail,
    track: firstNonEmpty(getField(race, ["track", "venue"]), typed?.track, meeting.track),
    grade: firstNonEmpty(getField(race, ["grade", "class"]), typed?.grade, parsedGrade),
  };
}

/** Header fields for the active race (empty string when missing — never stale fallbacks). */
export function buildRaceDisplayMeta(
  raceNo: string,
  race: ({ distance?: string } & RaceHeaderFields) | undefined,
  meeting: { track: string; going?: string; rail?: string },
): RaceMeta {
  const resolved = resolveRaceHeaderMetadata(raceNo, race, meeting);
  return {
    track: resolved.track,
    race: raceNo || "",
    distance: resolved.distance,
    grade: resolved.grade,
    going: resolved.going,
    rail: resolved.rail,
  };
}

export function formatRaceMetaField(value: string, readOnly: boolean): string {
  const trimmed = value.trim();
  if (trimmed) return trimmed;
  return readOnly ? RACE_META_EMPTY_DISPLAY : "";
}

/** Infer venue from common export filenames (e.g. newcastle_2026-05-19_master.csv). */
export function inferMeetingTrackFromCsvFileName(fileName: string): string {
  const base = fileName.replace(/\.csv$/i, "").split(/[/\\]/).pop() ?? "";
  const stem = base
    .replace(/_\d{4}-\d{2}-\d{2}.*/i, "")
    .replace(/_master$/i, "")
    .replace(/^racenet[-_]?/i, "")
    .replace(/[-_]speed[-_]?map.*/i, "");
  const venue = stem.split(/[_-]/).filter(Boolean)[0] ?? "";
  if (!venue || /^(export|speed|map|fields|unknown)$/i.test(venue)) return "";
  return venue.charAt(0).toUpperCase() + venue.slice(1).toLowerCase();
}

/** Build a persisted race entry; header fields come from the race bucket (set at CSV import). */
export function raceMapEntryFromBucket(
  race: RaceBucket,
  runners: SpeedMapRunner[],
  meeting: { track?: string; going?: string; rail?: string } = {},
): RaceMapStateEntry {
  const track = firstNonEmpty(race.track?.trim(), meeting.track?.trim());
  return {
    raceName: race.raceName || `Race ${race.raceNo}`,
    distance: race.distance?.trim() || "",
    track,
    startTime: race.startTime?.trim() || "",
    grade: race.grade?.trim() || "",
    going: race.going?.trim() || "",
    rail: race.rail?.trim() || "",
    dist: race.dist?.trim() || "",
    raceDistance: race.raceDistance?.trim() || "",
    trackCondition: race.trackCondition?.trim() || "",
    condition: race.condition?.trim() || "",
    railPosition: race.railPosition?.trim() || "",
    runners,
    importDebug: race.importDebug,
    notes: "",
  };
}

function extractStartTimeFromRaceName(raceName: string): string {
  const match = raceName.match(/\b(\d{1,2}:\d{2}\s*(?:am|pm))\b/i);
  return match?.[1]?.trim() ?? "";
}

function mergeRaceHeaderField(bucket: RaceBucket, field: keyof RaceHeaderFields, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (!bucket[field]?.trim()) bucket[field] = trimmed;
}

function enrichRaceHeaderFromTitle(bucket: RaceBucket) {
  const title = bucket.raceName.trim();
  if (!title) return;
  if (!bucket.startTime?.trim()) {
    bucket.startTime = extractStartTimeFromRaceName(title);
  }
  const { distance: parsedDistance, grade: parsedGrade } = parseRaceHeaderFromTitle(title);
  if (!bucket.distance?.trim() && parsedDistance) bucket.distance = parsedDistance;
  if (!bucket.grade?.trim() && parsedGrade) bucket.grade = parsedGrade;
}

function applyMeetingMetaToBuckets(
  buckets: Iterable<RaceBucket>,
  meeting: { track: string; going: string; rail: string },
) {
  for (const bucket of buckets) {
    if (!bucket.track?.trim() && meeting.track) bucket.track = meeting.track;
    if (!bucket.going?.trim() && meeting.going) bucket.going = meeting.going;
    if (!bucket.rail?.trim() && meeting.rail) bucket.rail = meeting.rail;
  }
}

/** Tile left edge as fraction of board width (96px on reference board width). */
const TILE_WIDTH_NORM = 96 / SPEED_MAP_TRACK_WIDTH_PX;
const TILE_HEIGHT_NORM = 0.1;
const BOARD_REF_HEIGHT_PX = 720;
const TILE_RENDER_HEIGHT_PX = 72;
/** Minimum 6px gap between tile edges (fraction of board width / height — asymmetric). */
const COLLISION_GAP_X_FRAC = 6 / 1280;
const COLLISION_GAP_Y_FRAC = 6 / 720;
/** Axis-aligned hit box width ≈ rendered tile (96px ref) minus ~1px border per side. */
const COLLISION_TILE_WIDTH_FRAC = TILE_WIDTH_NORM - 2 / SPEED_MAP_TRACK_WIDTH_PX;
const COLLISION_TILE_HEIGHT_FRAC = TILE_RENDER_HEIGHT_PX / BOARD_REF_HEIGHT_PX;
/** Legacy alias — overlap checks use COLLISION_* + gaps. */
const MIN_SPACING_NORM = Math.min(COLLISION_GAP_X_FRAC, COLLISION_GAP_Y_FRAC);
const MIN_X_GAP = COLLISION_GAP_X_FRAC;
const MIN_Y_GAP = COLLISION_GAP_Y_FRAC;
const STACK_GAP_2PX_Y_FRAC = 2 / BOARD_REF_HEIGHT_PX;
/** Lane spacing: at least tile + 8px running-line gap, and never less than collision separation (prevents adjacent-lane overlap). */
const LANE_GAP_8PX_NORM = 8 / 1180;
const RAIL_TOP_Y = 0.92;
const RAIL_PADDING_Y = 0.0065;
/**
 * Bottom-most legal tile centre Y (rail lane): CSS `top` uses fraction of board height — larger Y = lower on screen = nearer the rail.
 */
const RAIL_TILE_CENTER_Y = RAIL_TOP_Y - TILE_HEIGHT_NORM / 2 - RAIL_PADDING_Y;
/** @deprecated use RAIL_TILE_CENTER_Y — kept for clamps */
const MAX_TILE_CENTER_Y = RAIL_TILE_CENTER_Y;
/** Top of field (smallest Y); tiles appear higher on screen. */
const MIN_RUNNER_Y = TILE_HEIGHT_NORM / 2 + 0.012;
const BARRIER_ORDER_MIN_DELTA = 0.004;
/** Lower w_ir may sit inside (more rail / higher y) only if at least this much faster. */
const CROSS_INSIDE_WIR_MARGIN = 1.1;
const COLLISION_MIN_CENTER_SEP_Y = COLLISION_TILE_HEIGHT_FRAC + COLLISION_GAP_Y_FRAC;
const SAME_WIR_STACK_SEP_Y = COLLISION_TILE_HEIGHT_FRAC + STACK_GAP_2PX_Y_FRAC;
/** Base stack center from bottom-origin formula: mapHeight - railBand - tileHeight - 4, converted to center Y. */
const STACK_BASE_Y =
  RAIL_TOP_Y - (TILE_RENDER_HEIGHT_PX / 2 + 4) / BOARD_REF_HEIGHT_PX;
const LANE_STEP_Y = Math.max(TILE_HEIGHT_NORM + LANE_GAP_8PX_NORM, COLLISION_MIN_CENTER_SEP_Y);
/** Alias for overlap resolution / fallback scans (same as lane step). */
const LANE_BAND_Y = LANE_STEP_Y;
const DIAG_X_PER_LANE = 0.013;
const CROSSING_TOL = 0.0025;

function speedsInSamePack(wIrA: number, wIrB: number) {
  return Math.abs(wIrA - wIrB) < CROSS_INSIDE_WIR_MARGIN;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (["n/a", "na", "null", "undefined"].includes(raw.toLowerCase())) return null;
  const next = Number(raw);
  return Number.isFinite(next) ? next : null;
}

function resolveWir(parsedWir: number | null): { wIr: number; hasSpeedData: boolean; displayWir: string } {
  if (
    parsedWir !== null &&
    Number.isFinite(parsedWir) &&
    parsedWir >= MIN_WIR &&
    parsedWir <= MAX_WIR
  ) {
    return { wIr: parsedWir, hasSpeedData: true, displayWir: String(parsedWir) };
  }
  // Missing/blank/null/N/A/invalid speed → backmarker column.
  return { wIr: MAX_WIR, hasSpeedData: false, displayWir: "N/A" };
}

const W_IR_HEADER_ALIASES = ["w_ir", "W_IR", "wir", "wIr", "speed", "Speed", "wir_speed", "Wir_Speed"];

/** Restore `hasSpeedData` / `wIr` on runners from storage or legacy shapes (never strips valid speed rows). */
export function hydrateRunnerSpeedFields(runner: SpeedMapRunner): SpeedMapRunner {
  if (runner.hasSpeedData === false) {
    return {
      ...runner,
      wIr: MAX_WIR,
      hasSpeedData: false,
      displayWir: runner.displayWir?.trim() || "N/A",
    };
  }

  const legacy = runner as SpeedMapRunner & { w_ir?: unknown; raw_w_ir?: unknown };
  const parsed = toNumber(legacy.raw_w_ir ?? legacy.w_ir ?? runner.wIr);
  const resolved = resolveWir(parsed);

  return {
    ...runner,
    wIr: resolved.wIr,
    hasSpeedData: resolved.hasSpeedData,
    displayWir: resolved.displayWir,
  };
}

function runnerDebugRecord(runner: SpeedMapRunner, rawWir?: unknown) {
  return {
    no: runner.no,
    number: runner.no,
    name: runner.horse,
    w_ir: runner.wIr,
    raw_w_ir: rawWir,
    hasSpeedData: runner.hasSpeedData,
    keys: Object.keys(runner),
  };
}

function readCellFuzzy(
  row: Record<string, unknown>,
  aliases: string[],
  headerLookup: Map<string, string>,
): unknown {
  const direct = readCell(row, aliases);
  if (direct !== undefined) return direct;
  for (const alias of aliases) {
    const actualKey = headerLookup.get(normalizeFieldKey(alias));
    if (actualKey && actualKey in row) return row[actualKey];
  }
  return undefined;
}

function readWirFromRow(row: Record<string, unknown>, headerLookup: Map<string, string>) {
  const raw = readCellFuzzy(row, W_IR_HEADER_ALIASES, headerLookup);
  return { raw, parsed: toNumber(raw) };
}

function readCell(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  return undefined;
}

function readMetaString(row: Record<string, unknown>, keys: string[]): string {
  const value = readCell(row, keys);
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeFieldKey(key: string): string {
  return key
    .replace(/^\ufeff/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, "");
}

function buildHeaderLookup(rows: Record<string, unknown>[]): Map<string, string> {
  const lookup = new Map<string, string>();
  const first = rows[0];
  if (!first) return lookup;
  for (const key of Object.keys(first)) {
    const normalized = normalizeFieldKey(key);
    if (normalized && !lookup.has(normalized)) lookup.set(normalized, key);
  }
  return lookup;
}

function readMetaStringFuzzy(
  row: Record<string, unknown>,
  aliases: string[],
  headerLookup: Map<string, string>,
): string {
  for (const alias of aliases) {
    const direct = readMetaString(row, [alias]);
    if (direct) return direct;
    const actualKey = headerLookup.get(normalizeFieldKey(alias));
    if (actualKey) {
      const viaLookup = readMetaString(row, [actualKey]);
      if (viaLookup) return viaLookup;
    }
  }
  return "";
}

/** Read a CSV cell by exact header keys (case variants). */
function readRowField(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (!(key in row)) continue;
    const value = row[key];
    if (value === undefined || value === null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Log import schema; extra/unknown columns are allowed and preserved in row objects. */
function logCsvImportSchema(headers: string[]) {
  const normalized = new Set(headers.map(normalizeMetaKey));
  const optionalPresent = CSV_OPTIONAL_RACE_METADATA_ALIASES.filter((alias) =>
    normalized.has(normalizeMetaKey(alias)),
  );
  console.info("[SpeedMap CSV Import] schema", {
    required: [...CSV_REQUIRED_RUNNER_FIELDS],
    optionalDetected: optionalPresent,
    allHeaders: headers,
    unknownColumnsAllowed: true,
  });
}

function createEmptyRaceBucket(raceNo: string): RaceBucket {
  return {
    raceNo,
    raceName: "",
    distance: "",
    track: "",
    startTime: "",
    grade: "",
    going: "",
    rail: "",
    runners: [],
  };
}

/** Merge race-level CSV columns onto the race bucket (row value wins over existing race fields). */
function applyCsvRaceMetadataFromRow(
  race: RaceBucket,
  row: Record<string, unknown>,
  headerLookup: Map<string, string>,
) {
  const rowTrack = firstNonEmpty(
    readRowField(row, ["track", "Track", "TRACK", "venue", "Venue"]),
    readMetaStringFuzzy(row, ["track", "Track", "venue", "Venue"], headerLookup),
  );
  race.track = firstNonEmpty(rowTrack, race.track ?? "");

  const rowRaceTitle = firstNonEmpty(
    readRowField(row, ["race_title", "Race_Title", "raceTitle"]),
    readRowField(row, ["race_name", "Race_Name", "raceName"]),
    readMetaStringFuzzy(row, ["race_title", "Race_Title", "race_name", "Race_Name"], headerLookup),
  );
  race.raceName = firstNonEmpty(rowRaceTitle, race.raceName ?? "");

  const rowDistance = firstNonEmpty(
    readRowField(row, ["distance", "Distance", "DISTANCE"]),
    readMetaStringFuzzy(row, DISTANCE_HEADER_ALIASES, headerLookup),
  );
  race.distance = firstNonEmpty(rowDistance, race.distance ?? "");

  const rowGrade = firstNonEmpty(
    readRowField(row, ["grade", "Grade", "GRADE", "class", "Class", "CLASS"]),
    readMetaStringFuzzy(row, ["grade", "Grade", "class", "Class", "race_class", "Race_Class"], headerLookup),
  );
  race.grade = firstNonEmpty(rowGrade, race.grade ?? "");

  const rowGoing = firstNonEmpty(
    readRowField(row, ["going", "Going", "GOING"]),
    readRowField(row, ["trackCondition", "track_condition", "TrackCondition", "Track Condition"]),
    readMetaStringFuzzy(row, GOING_HEADER_ALIASES, headerLookup),
  );
  race.going = firstNonEmpty(rowGoing, race.going ?? "");

  const rowRail = firstNonEmpty(
    readRowField(row, ["rail", "Rail", "RAIL"]),
    readRowField(row, ["railPosition", "rail_position", "RailPosition", "Rail Position"]),
    readMetaStringFuzzy(row, RAIL_HEADER_ALIASES, headerLookup),
  );
  race.rail = firstNonEmpty(rowRail, race.rail ?? "");
}

function finalizeRaceHeaderFields(bucket: RaceBucket) {
  bucket.distance = firstNonEmpty(bucket.distance, bucket.dist, bucket.raceDistance);
  bucket.going = firstNonEmpty(bucket.going, bucket.trackCondition, bucket.condition);
  bucket.rail = firstNonEmpty(bucket.rail, bucket.railPosition);
  const distRounded = bucket.distance?.match(/^(\d{3,4})$/);
  if (distRounded?.[1] && !bucket.distance?.includes("m")) {
    bucket.distance = `${distRounded[1]}m`;
  }
}

function detectHeaderVariant(rows: Record<string, unknown>[]) {
  const first = rows[0] ?? {};
  const hasRaceId = "race_id" in first || "Race_ID" in first || "raceId" in first;
  const hasRunnerNo = "runner_no" in first || "Runner_No" in first || "runnerNo" in first;
  return {
    raceKey: hasRaceId ? "race_id" : "race_no",
    runnerKey: hasRunnerNo ? "runner_no" : "no",
  } as const;
}

function createRunnerId(raceNo: string, no: number, horse: string, index: number) {
  const rn = raceNo.trim() || "na";
  const slug = horse.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${rn}-${no}-${slug}-${index}`;
}

function deriveRaceNoFromRaceId(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const m = raw.match(/^R?\s*(\d+)$/i);
  if (m?.[1]) return m[1];
  const anyDigits = raw.match(/(\d+)/);
  return anyDigits?.[1] ?? raw;
}

function readRaceNo(row: Record<string, unknown>): string {
  const raceNoValue = readCell(row, [
    "race_no",
    "Race_No",
    "\ufeffrace_no",
    "raceNo",
    "race",
    "Race",
    "raceNumber",
    "RaceNumber",
  ]);
  if (typeof raceNoValue === "string" || typeof raceNoValue === "number") {
    const parsed = String(raceNoValue).trim();
    if (parsed) return parsed;
  }

  const raceIdValue = readCell(row, ["race_id", "Race_ID", "raceId"]);
  if (typeof raceIdValue === "string" || typeof raceIdValue === "number") {
    return deriveRaceNoFromRaceId(String(raceIdValue));
  }
  return "";
}

/** True when CSV `scratched` (or equivalent) marks the runner as scratched. */
export function isScratchedValue(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase();
    return raw === "true" || raw === "1" || raw === "scr" || raw === "scratched" || raw === "yes" || raw === "y";
  }
  return false;
}

/** Racenet row is scratched when `scratched` is set or odds are SCR. */
export function isRunnerRowScratched(scratchedRaw: unknown, oddsRaw?: unknown): boolean {
  if (isScratchedValue(scratchedRaw)) return true;
  return String(oddsRaw ?? "").trim().toUpperCase() === "SCR";
}

export function parseRunnersCsv(text: string): SpeedMapRunner[] {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse error: ${parsed.errors[0]?.message ?? "Unknown parsing failure."}`);
  }

  const rows = parsed.data;
  if (!rows.length) {
    throw new Error("CSV is empty.");
  }
  const headerVariant = detectHeaderVariant(rows);
  const headerLookup = buildHeaderLookup(rows);
  console.info("[SpeedMap Import Headers]", headerVariant);
  console.log("RAW IMPORT ROWS", rows.slice(0, 5));

  const runners = rows.flatMap((row, index) => {
    const scratchedRaw = readCell(row, ["scratched", "Scratched", "scratch", "Scratch"]);
    const oddsRaw = readCell(row, ["odds", "Odds"]);
    if (isRunnerRowScratched(scratchedRaw, oddsRaw)) return [];
    const raceNo = readRaceNo(row);
    const no = toNumber(readCell(row, ["no", "No", "number", "Number", "saddlecloth", "Saddlecloth", "runner_no", "Runner_No", "runnerNo"]));
    const horseValue = readCell(row, ["horse", "Horse", "name", "Name"]);
    const barrierValue = readCell(row, ["barrier", "Barrier", "br", "Br", "gate", "Gate"]);
    const { parsed: parsedWir } = readWirFromRow(row, headerLookup);
    const horse = typeof horseValue === "string" ? horseValue.trim() : "";
    const barrier = typeof barrierValue === "string" || typeof barrierValue === "number" ? String(barrierValue).trim() : "";

    if (!raceNo || !no || !horse || !barrier) {
      throw new Error(SPEED_MAP_CSV_IMPORT_HELP);
    }
    const { wIr, hasSpeedData, displayWir } = resolveWir(parsedWir);

    return [{
      id: createRunnerId(raceNo, no, horse, index),
      no,
      horse,
      barrier,
      wIr,
      displayWir,
      hasSpeedData,
      manuallyPlaced: false,
      x: 0,
      y: 0,
      modelX: 0,
      modelY: 0,
      flags: { favourite: false, target: false, mapAdvantage: false, risk: false },
    } satisfies SpeedMapRunner];
  });

  if (!runners.length) {
    throw new Error("No non-scratched runners found in CSV.");
  }

  console.info("[SpeedMap Import] starting placement", {
    runnerCount: runners.length,
    raceCount: 1,
  });
  const placed = assignModelPositions(runners);
  console.info("[SpeedMap Import] placement complete", {
    runnerCount: placed.length,
    raceCount: 1,
    placementComplete: true,
  });
  return placed;
}

export function parseRunnersCsvByRace(text: string): ParseRunnersCsvResult {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse error: ${parsed.errors[0]?.message ?? "Unknown parsing failure."}`);
  }

  const rows = parsed.data;
  if (!rows.length) {
    throw new Error("CSV is empty.");
  }
  const headerVariant = detectHeaderVariant(rows);
  const headerLookup = buildHeaderLookup(rows);
  const csvHeaders = Object.keys(rows[0] || {});
  logCsvImportSchema(csvHeaders);
  console.log("CSV HEADERS", csvHeaders);
  console.log("FIRST CSV ROW", rows[0]);
  console.info("[SpeedMap Import Headers]", headerVariant, [...headerLookup.keys()]);
  console.log("RAW IMPORT ROWS", rows.slice(0, 5));

  let filteredScratched = 0;
  let validRunners = 0;
  let meetingTrack = "";
  let meetingGoing = "";
  let meetingRail = "";
  for (const row of rows) {
    if (!meetingTrack) {
      meetingTrack = readMetaStringFuzzy(
        row,
        ["meeting_track", "Meeting_Track", "meeting", "Meeting", "venue_name", "Venue_Name", "venue", "Venue", "track", "Track"],
        headerLookup,
      );
    }
    if (!meetingGoing) {
      meetingGoing = readMetaStringFuzzy(
        row,
        ["meeting_going", "Meeting_Going", ...GOING_HEADER_ALIASES],
        headerLookup,
      );
    }
    if (!meetingRail) {
      meetingRail = readMetaStringFuzzy(
        row,
        ["meeting_rail", "Meeting_Rail", ...RAIL_HEADER_ALIASES],
        headerLookup,
      );
    }
    if (meetingTrack && meetingGoing && meetingRail) break;
  }
  const grouped = new Map<string, RaceBucket>();
  const raceStats = new Map<string, { csvRowCountForRace: number; scratchedCountForRace: number; parsedHorseNames: string[] }>();

  const bumpRaceStat = (raceNo: string, patch: Partial<{ row: boolean; scratched: boolean; name: string }>) => {
    if (!raceStats.has(raceNo)) {
      raceStats.set(raceNo, { csvRowCountForRace: 0, scratchedCountForRace: 0, parsedHorseNames: [] });
    }
    const st = raceStats.get(raceNo)!;
    if (patch.row) st.csvRowCountForRace += 1;
    if (patch.scratched) st.scratchedCountForRace += 1;
    if (patch.name) st.parsedHorseNames.push(patch.name);
  };

  rows.forEach((row, index) => {
    const raceNoEarly = readRaceNo(row);
    if (raceNoEarly) bumpRaceStat(raceNoEarly, { row: true });

    const scratchedRaw = readCell(row, ["scratched", "Scratched", "scratch", "Scratch"]);
    const oddsRaw = readCell(row, ["odds", "Odds"]);
    if (isRunnerRowScratched(scratchedRaw, oddsRaw)) {
      filteredScratched += 1;
      if (raceNoEarly) bumpRaceStat(raceNoEarly, { scratched: true });
      return;
    }
    const no = toNumber(readCell(row, ["no", "No", "number", "Number", "saddlecloth", "Saddlecloth", "runner_no", "Runner_No", "runnerNo"]));
    const horseValue = readCell(row, ["horse", "Horse", "name", "Name"]);
    const barrierValue = readCell(row, ["barrier", "Barrier", "br", "Br", "gate", "Gate"]);
    const { raw: wIrRaw, parsed: parsedWir } = readWirFromRow(row, headerLookup);
    const raceNo = readRaceNo(row);
    const startTimeValue = readMetaStringFuzzy(
      row,
      ["start_time", "Start_Time", "startTime", "StartTime", "race_time", "Race_Time"],
      headerLookup,
    );
    const horse = typeof horseValue === "string" ? horseValue.trim() : "";
    const barrier = typeof barrierValue === "string" || typeof barrierValue === "number" ? String(barrierValue).trim() : "";
    if (!raceNo || !no || !horse || !barrier) {
      throw new Error(SPEED_MAP_CSV_IMPORT_HELP);
    }

    if (!grouped.has(raceNo)) {
      grouped.set(raceNo, createEmptyRaceBucket(raceNo));
    }
    const bucket = grouped.get(raceNo)!;
    applyCsvRaceMetadataFromRow(bucket, row, headerLookup);
    mergeRaceHeaderField(bucket, "startTime", startTimeValue);

    const { wIr, hasSpeedData, displayWir } = resolveWir(parsedWir);
    validRunners += 1;

    bumpRaceStat(raceNo, { name: horse });

    grouped.get(raceNo)!.runners.push({
      id: createRunnerId(raceNo, no, horse, index),
      no,
      horse,
      barrier,
      wIr,
      displayWir,
      hasSpeedData,
      manuallyPlaced: false,
      x: 0,
      y: 0,
      modelX: 0,
      modelY: 0,
      flags: { favourite: false, target: false, mapAdvantage: false, risk: false },
    });
  });

  if (grouped.size === 0) {
    throw new Error("No non-scratched runners found in CSV.");
  }

  for (const bucket of grouped.values()) {
    enrichRaceHeaderFromTitle(bucket);
    finalizeRaceHeaderFields(bucket);
  }
  applyMeetingMetaToBuckets(grouped.values(), {
    track: meetingTrack,
    going: meetingGoing,
    rail: meetingRail,
  });
  for (const bucket of grouped.values()) {
    finalizeRaceHeaderFields(bucket);
  }
  if (!meetingTrack) {
    const rowTracks = [...grouped.values()]
      .map((b) => b.track?.trim())
      .filter((t): t is string => Boolean(t));
    const uniqueTracks = [...new Set(rowTracks)];
    if (uniqueTracks.length === 1) meetingTrack = uniqueTracks[0]!;
  }

  console.info("[SpeedMap Import]", {
    parsedRows: rows.length,
    validRunners,
    filteredScratched,
    detectedRaces: grouped.size,
  });
  console.info("[SpeedMap Import] starting placement", {
    runnerCount: validRunners,
    raceCount: grouped.size,
  });

  for (const bucket of grouped.values()) {
    console.log(
      "PARSED RUNNERS",
      bucket.runners.map((r) => runnerDebugRecord(r)),
    );
  }

  const raceBuckets = [...grouped.values()].map((bucket) => {
    const st = raceStats.get(bucket.raceNo);
    const importDebug: SpeedMapImportDebug | undefined = st
      ? {
          csvRowCountForRace: st.csvRowCountForRace,
          scratchedCountForRace: st.scratchedCountForRace,
          nonScratchedRunnerCount: bucket.runners.length,
          parsedHorseNames: [...st.parsedHorseNames],
        }
      : undefined;
    const placed = assignModelPositions(bucket.runners.map(hydrateRunnerSpeedFields));
    if (placed.length !== bucket.runners.length) {
      console.error("[SpeedMap] assignModelPositions dropped runners", {
        raceNo: bucket.raceNo,
        before: bucket.runners.length,
        after: placed.length,
      });
    }
    return {
      ...bucket,
      importDebug,
      runners: placed,
    };
  });
  raceBuckets.sort((a, b) => {
    const an = Number(a.raceNo);
    const bn = Number(b.raceNo);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.raceNo.localeCompare(b.raceNo);
  });
  const totalPlacedRunners = raceBuckets.reduce((sum, bucket) => sum + bucket.runners.length, 0);
  console.info("[SpeedMap Import] placement complete", {
    runnerCount: totalPlacedRunners,
    raceCount: raceBuckets.length,
    placementComplete: true,
  });
  console.log(
    "PARSED RACES",
    raceBuckets.map((r) => ({
      raceNo: r.raceNo,
      raceName: r.raceName,
      track: r.track,
      distance: r.distance,
      grade: r.grade,
      going: r.going,
      rail: r.rail,
      firstRunner: r.runners?.[0],
    })),
  );
  return { races: raceBuckets, meetingTrack, meetingGoing, meetingRail };
}

export function zoneIndexFromX(x: number): number {
  const clamped = Math.max(0, Math.min(0.999999, x));
  return Math.floor(clamped * POSITION_BANDS.length);
}

export function pressureFromRunners(runners: SpeedMapRunner[]): { score: number; label: PressureLabel } {
  return pressureFromRunnersByWirScale(runners);
}

function barrierScore(runner: SpeedMapRunner) {
  const b = Number(runner.barrier);
  return Number.isFinite(b) && b > 0 ? b : 999;
}

function roundedWirKey(wIr: number) {
  return Number((Math.round(wIr * 10) / 10).toFixed(1));
}

function inSameWirGroup(aWir: number, bWir: number) {
  return roundedWirKey(aWir) === roundedWirKey(bWir);
}

/** True if axis-aligned hit boxes overlap — requires full 6px horizontal + vertical separation between edges. */
function tilesOverlapStrict(a: SpeedMapRunner, b: SpeedMapRunner) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const sepX = COLLISION_TILE_WIDTH_FRAC + COLLISION_GAP_X_FRAC;
  const sepY = inSameWirGroup(a.wIr, b.wIr) ? SAME_WIR_STACK_SEP_Y : COLLISION_TILE_HEIGHT_FRAC + COLLISION_GAP_Y_FRAC;
  return dx < sepX && dy < sepY;
}

function canCrossInsideMove(runnerWir: number, insideRunnerWir: number) {
  return (
    runnerWir <= insideRunnerWir - CROSS_INSIDE_WIR_MARGIN ||
    runnerWir >= insideRunnerWir + CROSS_INSIDE_WIR_MARGIN
  );
}

function canCrossInsideRail(runner: SpeedMapRunner, insideRunner: SpeedMapRunner) {
  if (speedsInSamePack(runner.wIr, insideRunner.wIr)) return false;
  return canCrossInsideMove(runner.wIr, insideRunner.wIr);
}

function clampXForWir(wIr: number, x: number) {
  const targetLeft = getTileLeftNorm(wIr ?? 12);
  const colWidth = 1 / VISUAL_COLUMNS;
  const minX = Math.max(0, targetLeft - colWidth * 2.45);
  const maxX = Math.min(1 - TILE_WIDTH_NORM, targetLeft + colWidth * 0.72);
  return Math.min(maxX, Math.max(minX, x));
}

function clampRunnerToColumn(runner: SpeedMapRunner) {
  runner.x = clampXForWir(runner.wIr, runner.x);
  runner.y = Math.min(RAIL_TILE_CENTER_Y, Math.max(MIN_RUNNER_Y, runner.y));
}

function probeOverlapsXY(px: number, py: number, o: SpeedMapRunner) {
  const dx = Math.abs(px - o.x);
  const dy = Math.abs(py - o.y);
  const sepX = COLLISION_TILE_WIDTH_FRAC + COLLISION_GAP_X_FRAC;
  // Probe overlaps for pre-placement use global strict threshold; same-w_ir tightening is applied in stack pass.
  const sepY = COLLISION_TILE_HEIGHT_FRAC + COLLISION_GAP_Y_FRAC;
  return dx < sepX && dy < sepY;
}

/**
 * Crossing rule when |Δw_ir| ≥ 1.1 — cross in front or cross behind.
 * Same-speed pack must not cross inside; preserve barrier order instead.
 */
function probeCrossingOkXY(px: number, py: number, wIr: number, o: SpeedMapRunner) {
  if (Math.abs(py - o.y) <= CROSSING_TOL) return true;
  const probeInside = py > o.y + CROSSING_TOL;
  const otherInside = o.y > py + CROSSING_TOL;
  if (!probeInside && !otherInside) return true;
  if (speedsInSamePack(wIr, o.wIr)) return false;
  if (probeInside) return canCrossInsideMove(wIr, o.wIr);
  if (otherInside) return canCrossInsideMove(o.wIr, wIr);
  return true;
}

/**
 * Lower barrier → more rail (higher y). Higher barrier may only sit inside lower if w_ir crossing allows.
 */
function probeBarrierOrderOk(py: number, probeBar: number, probeWir: number, o: SpeedMapRunner) {
  const oBar = barrierScore(o);
  if (probeBar >= 500 || oBar >= 500) return true;
  if (Math.abs(py - o.y) <= CROSSING_TOL) return true;

  if (speedsInSamePack(probeWir, o.wIr)) {
    if (probeBar < oBar) return py >= o.y - CROSSING_TOL;
    if (probeBar > oBar) return py <= o.y + CROSSING_TOL;
    return true;
  }

  if (probeBar < oBar) {
    if (py >= o.y - CROSSING_TOL) return true;
    return py > o.y + CROSSING_TOL && canCrossInsideMove(o.wIr, probeWir);
  }
  if (probeBar > oBar) {
    if (py <= o.y + CROSSING_TOL) return true;
    return py > o.y + CROSSING_TOL && canCrossInsideMove(probeWir, o.wIr);
  }
  return true;
}

function fitsAt(px: number, py: number, candidate: SpeedMapRunner, placed: SpeedMapRunner[]) {
  const probeBar = barrierScore(candidate);
  for (const p of placed) {
    if (probeOverlapsXY(px, py, p)) return false;
    if (!probeCrossingOkXY(px, py, candidate.wIr, p)) return false;
    if (!probeBarrierOrderOk(py, probeBar, candidate.wIr, p)) return false;
  }
  return true;
}

function buildXSearchOffsets() {
  const out: number[] = [0];
  for (let i = 1; i <= 22; i += 1) {
    out.push(-DIAG_X_PER_LANE * i * 0.52);
    out.push(-DIAG_X_PER_LANE * i * 0.32);
  }
  return out;
}

/**
 * Lane numbers are 1-based per spec: 1 = rail (bottom-most Y), 2 = one-off rail, … Larger lane number ⇒ smaller Y ⇒ higher on screen.
 * laneY = railY - (laneNumber - 1) * (tileHeight + 8px gap).
 */
function laneYFromLaneNumber(laneNumber: number) {
  const railY = RAIL_TILE_CENTER_Y;
  const y = railY - (laneNumber - 1) * LANE_STEP_Y;
  return Math.min(RAIL_TILE_CENTER_Y, Math.max(MIN_RUNNER_Y, y));
}

function maxLaneNumber() {
  return Math.max(2, Math.ceil((RAIL_TILE_CENTER_Y - MIN_RUNNER_Y) / LANE_STEP_Y) + 2);
}

/** Which discrete lane (1=rail) the centre Y is closest to. */
function laneNumberFromY(y: number) {
  const raw = (RAIL_TILE_CENTER_Y - y) / LANE_STEP_Y + 1;
  return Math.max(1, Math.round(raw));
}

function applySameWirVerticalStacks(runners: SpeedMapRunner[]) {
  const groups = new Map<number, SpeedMapRunner[]>();
  for (const r of runners) {
    const key = roundedWirKey(r.wIr);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  for (const [wirKey, group] of groups.entries()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => {
      const ba = barrierScore(a);
      const bb = barrierScore(b);
      if (ba !== bb) return ba - bb;
      return a.no - b.no;
    });

    const baseX = mapRunnerByWir(wirKey).x;
    for (const r of group) {
      r.x = clampXForWir(r.wIr, baseX);
      r.modelX = r.x;
    }

    // Build from running rail upward using bottom-origin formula:
    // y = baseY - index * (tileHeight + 2px), where baseY is just above rail.
    const availableHeight = Math.max(0, RAIL_TILE_CENTER_Y - MIN_RUNNER_Y);
    const sep = group.length <= 1 ? SAME_WIR_STACK_SEP_Y : Math.min(SAME_WIR_STACK_SEP_Y, availableHeight / (group.length - 1));
    const baseY = Math.min(RAIL_TILE_CENTER_Y, Math.max(MIN_RUNNER_Y, STACK_BASE_Y));
    const yValues = group.map((_, idx) => baseY - idx * sep);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    let shift = 0;
    if (maxY > RAIL_TILE_CENTER_Y) shift -= maxY - RAIL_TILE_CENTER_Y;
    if (minY + shift < MIN_RUNNER_Y) shift += MIN_RUNNER_Y - (minY + shift);
    for (let i = 0; i < group.length; i += 1) {
      const y = Math.min(RAIL_TILE_CENTER_Y, Math.max(MIN_RUNNER_Y, yValues[i]! + shift));
      group[i]!.y = y;
      group[i]!.modelY = y;
    }
  }
}

function resolveOverlapsStrict(all: SpeedMapRunner[]) {
  const laneCap = maxLaneNumber() + 28;
  const pickMover = (a: SpeedMapRunner, b: SpeedMapRunner) => {
    const ba = barrierScore(a);
    const bb = barrierScore(b);
    if (bb > ba) return b;
    if (ba > bb) return a;
    return a.wIr >= b.wIr ? a : b;
  };

  for (let iter = 0; iter < 520; iter += 1) {
    let anyOverlap = false;
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i]!;
        const b = all[j]!;
        if (!tilesOverlapStrict(a, b)) continue;

        anyOverlap = true;
        const mover = pickMover(a, b);
        const sameWirGroup = inSameWirGroup(a.wIr, b.wIr);
        const ln = laneNumberFromY(mover.y);
        let cleared = false;
        for (let bump = 1; bump <= 28; bump += 1) {
          mover.y = laneYFromLaneNumber(Math.min(laneCap, ln + bump));
          mover.modelY = mover.y;
          clampRunnerToColumn(mover);
          if (!tilesOverlapStrict(a, b)) {
            cleared = true;
            break;
          }
        }
        if (cleared) continue;

        if (sameWirGroup) continue;

        for (let t = 0; t < 22; t += 1) {
          const nx = clampXForWir(mover.wIr, mover.x - 0.0036 - t * 0.0016);
          if (nx >= mover.x - 1e-9) break;
          mover.x = nx;
          mover.modelX = mover.x;
          if (!tilesOverlapStrict(a, b)) break;
        }
      }
    }
    if (!anyOverlap) break;
  }
}

/** Last resort: discrete lanes from rail upward, then overlap-only — runner is always appended to `placed`. */
function placeGuaranteedWide(runner: SpeedMapRunner, placed: SpeedMapRunner[], baseX: number) {
  const xOff = buildXSearchOffsets();
  const laneMax = maxLaneNumber();
  for (let laneNum = 1; laneNum <= laneMax; laneNum += 1) {
    const yLane = laneYFromLaneNumber(laneNum);
    for (let oi = 0; oi < xOff.length; oi += 1) {
      const x = clampXForWir(runner.wIr, baseX + xOff[oi]!);
      if (fitsAt(x, yLane, runner, placed)) {
        runner.x = x;
        runner.y = yLane;
        runner.modelX = x;
        runner.modelY = yLane;
        runner.manuallyPlaced = false;
        placed.push(runner);
        return;
      }
    }
  }
  let x = clampXForWir(runner.wIr, baseX);
  /** Start at rail (lane 1); if still overlapping, step to higher lanes (smaller Y = up the screen). */
  let laneNum = 1;
  let y = laneYFromLaneNumber(laneNum);
  for (let e = 0; e < 900; e += 1) {
    let overlap = false;
    for (const p of placed) {
      if (probeOverlapsXY(x, y, p)) {
        overlap = true;
        break;
      }
    }
    if (!overlap) break;
    const nx = clampXForWir(runner.wIr, x - 0.0038);
    if (nx < x - 1e-9) {
      x = nx;
      continue;
    }
    x = clampXForWir(runner.wIr, baseX);
    laneNum += 1;
    if (laneNum <= laneMax) {
      y = laneYFromLaneNumber(laneNum);
    } else {
      y = Math.max(MIN_RUNNER_Y, y - LANE_STEP_Y * 0.35);
    }
  }
  runner.x = x;
  runner.y = Math.min(RAIL_TILE_CENTER_Y, Math.max(MIN_RUNNER_Y, y));
  runner.modelX = runner.x;
  runner.modelY = runner.y;
  runner.manuallyPlaced = false;
  placed.push(runner);
}

/**
 * Rail-first: try lane 1 (rail, largest Y), then lane 2, 3, … (each step subtracts lane height → moves tile up).
 */
function placeRailFirst(runner: SpeedMapRunner, placed: SpeedMapRunner[], baseX: number): boolean {
  const xOffsets = buildXSearchOffsets();
  const laneMax = maxLaneNumber();

  for (let laneNum = 1; laneNum <= laneMax; laneNum += 1) {
    const y = laneYFromLaneNumber(laneNum);
    for (const dx of xOffsets) {
      const x = clampXForWir(runner.wIr, baseX + dx);
      if (fitsAt(x, y, runner, placed)) {
        runner.x = x;
        runner.y = y;
        runner.modelX = x;
        runner.modelY = y;
        runner.manuallyPlaced = false;
        placed.push(runner);
        return true;
      }
    }
  }
  return false;
}

/**
 * Preserve barrier depth without collapsing everyone to the rail: prefer widening the higher barrier first.
 */
function repairBarrierOrderViolations(all: SpeedMapRunner[]) {
  const widen = LANE_STEP_Y * 0.35;
  const railNudge = LANE_STEP_Y * 0.28;

  for (let pass = 0; pass < 70; pass += 1) {
    let changed = false;
    for (let i = 0; i < all.length; i += 1) {
      for (let j = 0; j < all.length; j += 1) {
        if (i === j) continue;
        const a = all[i]!;
        const b = all[j]!;
        const ba = barrierScore(a);
        const bb = barrierScore(b);
        if (ba >= 500 || bb >= 500) continue;

        // Lower barrier (ba) must be ≥ as rail-ward (y) as higher barrier (bb) when ba < bb.
        if (ba < bb && a.y < b.y + BARRIER_ORDER_MIN_DELTA) {
          const newBY = Math.max(MIN_RUNNER_Y, b.y - widen);
          if (newBY < b.y - 1e-9) {
            b.y = newBY;
            b.modelY = b.y;
            changed = true;
          } else {
            const newAY = Math.min(MAX_TILE_CENTER_Y, a.y + railNudge);
            if (newAY > a.y + 1e-9) {
              a.y = newAY;
              a.modelY = a.y;
              changed = true;
            }
          }
        }

        if (bb < ba && b.y < a.y + BARRIER_ORDER_MIN_DELTA) {
          const newAY = Math.max(MIN_RUNNER_Y, a.y - widen);
          if (newAY < a.y - 1e-9) {
            a.y = newAY;
            a.modelY = a.y;
            changed = true;
          } else {
            const newBY = Math.min(MAX_TILE_CENTER_Y, b.y + railNudge);
            if (newBY > b.y + 1e-9) {
              b.y = newBY;
              b.modelY = b.y;
              changed = true;
            }
          }
        }

        if (ba > bb && a.y > b.y + CROSSING_TOL && !canCrossInsideRail(a, b)) {
          const ny = Math.max(MIN_RUNNER_Y, b.y - BARRIER_ORDER_MIN_DELTA);
          if (ny < a.y - 1e-9) {
            a.y = ny;
            a.modelY = a.y;
            changed = true;
          }
        }
        if (bb > ba && b.y > a.y + CROSSING_TOL && !canCrossInsideRail(b, a)) {
          const ny = Math.max(MIN_RUNNER_Y, a.y - BARRIER_ORDER_MIN_DELTA);
          if (ny < b.y - 1e-9) {
            b.y = ny;
            b.modelY = b.y;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}

function repairCrossingViolations(all: SpeedMapRunner[]) {
  for (let pass = 0; pass < 45; pass += 1) {
    let changed = false;
    for (let i = 0; i < all.length; i += 1) {
      for (let j = 0; j < all.length; j += 1) {
        if (i === j) continue;
        const a = all[i]!;
        const b = all[j]!;
        if (speedsInSamePack(a.wIr, b.wIr)) continue;
        if (Math.abs(a.y - b.y) <= CROSSING_TOL) continue;
        if (a.y > b.y + CROSSING_TOL && !canCrossInsideRail(a, b)) {
          const nextY = Math.max(MIN_RUNNER_Y, b.y - BARRIER_ORDER_MIN_DELTA);
          if (nextY < a.y) {
            a.y = nextY;
            a.modelY = a.y;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}

/** Layout: rail band, tile, bottom gap (px on BOARD_REF_HEIGHT_PX). */
const IMPORT_RAIL_BAND_PX = 52;
const IMPORT_BOTTOM_MARGIN_PX = 2;
const IMPORT_TILE_WIDTH_PX = 96;
const IMPORT_TILE_HEIGHT_PX = 56;
const IMPORT_GAP_PX = 2;
/** Horizontal collision: horses conflict if same lane and centers closer than this (fraction of board width). */
const IMPORT_X_CONFLICT_FRAC = (IMPORT_TILE_WIDTH_PX * 0.8) / 1280;

function safeImportX(x: number) {
  const halfW = (IMPORT_TILE_WIDTH_PX / 1280) / 2;
  const fallback = 0.5;
  const next = Number.isFinite(x) ? x : fallback;
  return Math.max(halfW, Math.min(1 - halfW, next));
}

function safeImportY(y: number, railY: number) {
  return Number.isFinite(y) ? y : railY;
}

function exactXFromWir(wIr: number) {
  // Continuous leader(right) -> backmarker(left) scale across full board width.
  const minWir = 0;
  const maxWir = 12;
  const clampedWir = Number.isFinite(wIr) ? Math.max(minWir, Math.min(maxWir, wIr)) : 6;
  const halfW = (IMPORT_TILE_WIDTH_PX / 1280) / 2;
  const rightBound = 1 - halfW;
  const leftBound = halfW;
  const t = (clampedWir - minWir) / (maxWir - minWir);
  const x = rightBound - t * (rightBound - leftBound);
  return Math.max(leftBound, Math.min(rightBound, x));
}

function laneTopFromRail(railTopNorm: number, lane: number, laneStepNorm: number) {
  return railTopNorm - lane * laneStepNorm;
}

function laneCenterYFromRail(railTopNorm: number, lane: number, laneStepNorm: number) {
  const halfH = (IMPORT_TILE_HEIGHT_PX / BOARD_REF_HEIGHT_PX) / 2;
  return laneTopFromRail(railTopNorm, lane, laneStepNorm) + halfH;
}

/** Reference board size for normalized x/y → px debug overlay (matches placement math). */
export const SPEED_MAP_REF_WIDTH_PX = 1280;
export const SPEED_MAP_REF_HEIGHT_PX = BOARD_REF_HEIGHT_PX;

/**
 * Lane index from normalized tile center Y (inverse of lane-center placement geometry).
 * Debug/display only — does not affect placement.
 */
export function laneIndexFromRunnerCenterYNorm(yNorm: number): number {
  const mapH = BOARD_REF_HEIGHT_PX;
  const railTopNorm =
    (mapH - IMPORT_RAIL_BAND_PX - IMPORT_TILE_HEIGHT_PX - IMPORT_BOTTOM_MARGIN_PX) / mapH;
  const laneStepNorm = (IMPORT_TILE_HEIGHT_PX + IMPORT_GAP_PX) / mapH;
  const halfH = (IMPORT_TILE_HEIGHT_PX / mapH) / 2;
  const raw = (railTopNorm + halfH - yNorm) / laneStepNorm;
  return Math.max(0, Math.round(raw));
}

function laneConflictAtX(x: number, lane: number, occupied: Array<{ x: number; lane: number }>) {
  return occupied.some((o) => o.lane === lane && Math.abs(x - o.x) < IMPORT_X_CONFLICT_FRAC);
}

export function assignModelPositions(runners: SpeedMapRunner[]): SpeedMapRunner[] {
  if (!runners.length) return [];
  const withSpeedData = runners.filter((runner) => runner.hasSpeedData);
  const withoutSpeedData = runners.filter((runner) => !runner.hasSpeedData);

  const mapH = BOARD_REF_HEIGHT_PX;
  const railTopNorm =
    (mapH - IMPORT_RAIL_BAND_PX - IMPORT_TILE_HEIGHT_PX - IMPORT_BOTTOM_MARGIN_PX) / mapH;
  const laneStepNorm = (IMPORT_TILE_HEIGHT_PX + IMPORT_GAP_PX) / mapH;
  const railCenterY = laneCenterYFromRail(railTopNorm, 0, laneStepNorm);

  const ordered = [...withSpeedData].sort((a, b) => {
    if (a.wIr !== b.wIr) return a.wIr - b.wIr;
    const ba = barrierScore(a);
    const bb = barrierScore(b);
    if (ba !== bb) return ba - bb;
    return a.no - b.no;
  });

  /** Inward-seeking: same lane conflicts only when horizontal separation is under 0.8× tile width. */
  const occupied: Array<{ x: number; lane: number }> = [];
  const maxLanes = Math.max(24, ordered.length + 6);

  for (const runner of ordered) {
    const xBase = safeImportX(exactXFromWir(runner.wIr));
    // preferredLane = max(0, barrier - 1) is ordering bias only, not a placement slot (scan from rail).
    let chosenLane = maxLanes;
    for (let lane = 0; lane <= maxLanes; lane += 1) {
      if (!laneConflictAtX(xBase, lane, occupied)) {
        chosenLane = lane;
        break;
      }
    }
    const y = safeImportY(laneCenterYFromRail(railTopNorm, chosenLane, laneStepNorm), railCenterY);
    runner.x = xBase;
    runner.y = Math.max(MIN_RUNNER_Y, y);
    runner.modelX = runner.x;
    runner.modelY = runner.y;
    runner.manuallyPlaced = false;
    occupied.push({ x: runner.x, lane: chosenLane });
  }

  withoutSpeedData.forEach((runner, idx) => {
    const t = withoutSpeedData.length <= 1 ? 0.5 : (idx + 1) / (withoutSpeedData.length + 1);
    const adjustedY = safeImportY(
      laneCenterYFromRail(railTopNorm, Math.round(t * 2), laneStepNorm),
      railCenterY,
    );
    runner.x = safeImportX(exactXFromWir(12));
    runner.y = safeImportY(Math.max(MIN_RUNNER_Y, adjustedY), railCenterY);
    runner.modelX = runner.x;
    runner.modelY = runner.y;
    runner.manuallyPlaced = false;
    runner.wIr = 12;
    runner.hasSpeedData = false;
    runner.displayWir = "N/A";
  });

  const all = [...withSpeedData, ...withoutSpeedData];

  for (const runner of all) {
    runner.y = safeImportY(Math.max(MIN_RUNNER_Y, Math.min(railCenterY, runner.y)), railCenterY);
    runner.x = safeImportX(runner.x);
    runner.modelY = runner.y;
    runner.modelX = runner.x;
  }

  if (runners.length !== all.length) {
    console.error("[SpeedMap] assignModelPositions length mismatch", {
      input: runners.length,
      output: all.length,
    });
  }

  return all;
}

export function resetToModel(runners: SpeedMapRunner[]): SpeedMapRunner[] {
  const base = runners.map((runner) => ({
    ...runner,
    manuallyPlaced: false,
  }));
  return assignModelPositions(base);
}
