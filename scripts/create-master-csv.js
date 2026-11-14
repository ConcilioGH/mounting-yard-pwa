#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const Papa = require("papaparse");

const OUTPUT_COLUMNS = [
  "race_id",
  "track",
  "race_no",
  "race_title",
  "distance",
  "grade",
  "going",
  "rail",
  "weather",
  "penetrometer",
  "track_information",
  "runner_no",
  "no",
  "horse",
  "horse_name",
  "name",
  "barrier",
  "trainer",
  "jockey",
  "odds",
  "w_ir",
  "source",
];

const WARNING_COLUMNS = ["race_no", "runner_no", "horse", "warning_type", "detail"];
const UNMATCHED_SPEEDPROXY_COLUMNS = ["race_no", "no", "horse", "w_ir"];

/** Racenet legend suffix letters; must match pdf_to_csv.py _LEGEND_SUFFIX_CHARS. */
const LEGEND_SUFFIX_CHARS = new Set([..."tdhbosc"]);

const RACE_CAPTION_META_RE = /race\s+No\.?\s*(\d+)\s*:\s*(\d+)\s*m;\s*(.+)$/i;

function firstNonEmpty(...values) {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function cleanHtmlText(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanRacenetHorseName(horse) {
  let s = String(horse ?? "").trim();
  if (!s) return s;
  const parenTail = /\s*\([^)]*\)\s*$/;
  while (parenTail.test(s)) {
    s = s.replace(parenTail, "").trim();
  }
  let changed = true;
  while (changed) {
    changed = false;
    const m = s.match(/^(.+?)\s+([A-Za-z]+)$/);
    if (!m) break;
    const right = m[2];
    // Racenet legend markers are lower-case. Preserve genuine horse-name words
    // such as "DO" and "SHOOT", which happen to use only legend letters.
    if (right !== right.toLowerCase()
      || !/^[a-z]+$/.test(right)
      || ![...right].every((c) => LEGEND_SUFFIX_CHARS.has(c))) {
      break;
    }
    if (right.length === 2 && right.toLowerCase() === "ho") {
      break;
    }
    s = m[1].trim();
    changed = true;
  }
  return s.trim();
}

function formatTrackName(slug) {
  const raw = String(slug || "")
    .trim()
    .replace(/[_-]+/g, " ");
  if (!raw) return "";
  return raw
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function extractDistanceFromRaceTitle(raceTitle) {
  const match = String(raceTitle || "").match(/\b\d{3,4}m\b/i);
  return match ? match[0] : "";
}

function extractGradeFromRaceTitle(raceTitle) {
  const title = String(raceTitle || "").trim();
  if (!title) return "";
  let match = title.match(/\bBM\s*(\d+)\b/i);
  if (match) return `BM${match[1]}`;
  match = title.match(/\bBenchmark\s*(\d+)\b/i);
  if (match) return `BM${match[1]}`;
  if (/\bMaiden\b/i.test(title) || /\bMDN\b/i.test(title)) return "Maiden";
  match = title.match(/\bClass\s*(\d+)\b/i);
  if (match) return `Class ${match[1]}`;
  if (/\bListed\b/i.test(title)) return "Listed";
  match = title.match(/\bGroup\s*(\d+)\b/i);
  if (match) return `Group ${match[1]}`;
  if (/\bHandicap\b/i.test(title)) return "Handicap";
  return "";
}

function normalizeGradeLabel(raw) {
  const text = String(raw || "")
    .replace(/-/g, " ")
    .trim();
  if (!text) return "";
  let match = text.match(/\bBM\s*(\d+)\b/i);
  if (match) return `BM${match[1]}`;
  match = text.match(/\bBenchmark\s*(\d+)\b/i);
  if (match) return `BM${match[1]}`;
  if (/\bMaiden\b/i.test(text) || /\bMDN\b/i.test(text)) return "Maiden";
  match = text.match(/\bClass\s*(\d+)\b/i);
  if (match) return `Class ${match[1]}`;
  if (/\bListed\b/i.test(text)) return "Listed";
  match = text.match(/\bGroup\s*(\d+)\b/i);
  if (match) return `Group ${match[1]}`;
  if (/\bHandicap\b/i.test(text)) return "Handicap";
  return text;
}

function parseSpeedproxyMeetingTable(html) {
  const rows = [];
  const tables = [...html.matchAll(/(<table[\s\S]*?<\/table>)/gi)].map((m) => m[1]);
  for (const table of tables) {
    const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
      cleanHtmlText(m[1]).toLowerCase(),
    );
    const trackIdx = headers.indexOf("track");
    const goingIdx = headers.indexOf("track_condition");
    const distIdx = headers.indexOf("distance_rounded");
    if (trackIdx < 0 || goingIdx < 0 || distIdx < 0) continue;
    const rowBlocks = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
    for (const rowBlock of rowBlocks) {
      const cells = [...rowBlock.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanHtmlText(m[1]));
      if (cells.length <= Math.max(trackIdx, goingIdx, distIdx)) continue;
      const distRaw = cells[distIdx].trim();
      if (!/^\d+$/.test(distRaw)) continue;
      rows.push({
        track: cells[trackIdx].trim(),
        going: cells[goingIdx].trim(),
        distance: `${distRaw}m`,
      });
    }
    if (rows.length) break;
  }
  return rows;
}

function parseSpeedproxyRaceMeta(html) {
  const meetingRows = parseSpeedproxyMeetingTable(html);
  const metaByRace = new Map();
  const tables = [...html.matchAll(/(<table[\s\S]*?<\/table>)/gi)].map((m) => m[1]);
  for (const table of tables) {
    const captionMatch = table.match(/<caption>([\s\S]*?)<\/caption>/i);
    if (!captionMatch) continue;
    const caption = cleanHtmlText(captionMatch[1]);
    const raceMatch = caption.match(RACE_CAPTION_META_RE);
    if (!raceMatch) continue;
    const raceNo = raceMatch[1];
    const distance = `${raceMatch[2]}m`;
    const grade = normalizeGradeLabel(raceMatch[3]);
    const distM = raceMatch[2];
    const meetingRow =
      meetingRows.find((row) => row.distance.replace(/m$/i, "") === distM) || {};
    const track = meetingRow.track || "";
    const going = meetingRow.going || "";
    if (!metaByRace.has(raceNo)) {
      metaByRace.set(raceNo, { track, going, distance, grade, rail: "" });
    } else {
      const entry = metaByRace.get(raceNo);
      if (!entry.track && track) entry.track = track;
      if (!entry.going && going) entry.going = going;
      if (!entry.grade && grade) entry.grade = grade;
      if (!entry.distance && distance) entry.distance = distance;
    }
  }
  return metaByRace;
}

function meetingMetaFromRacenetRows(rows) {
  let going = "";
  let rail = "";
  let track = "";
  for (const row of rows) {
    if (!going && row.going) going = String(row.going).trim();
    if (!rail && row.rail) rail = String(row.rail).trim();
    if (!track && row.track) track = String(row.track).trim();
    if (going && rail && track) break;
  }
  return { going, rail, track };
}

function resolveRaceFields(racenetRow, spMeta, meetingMeta, folderTrack) {
  const raceTitle = String(racenetRow.race_name || "").trim();
  const distance = firstNonEmpty(
    racenetRow.distance,
    spMeta?.distance,
    extractDistanceFromRaceTitle(raceTitle),
  );
  const grade = firstNonEmpty(racenetRow.grade, spMeta?.grade, extractGradeFromRaceTitle(raceTitle));
  const going = firstNonEmpty(racenetRow.going, meetingMeta.going, spMeta?.going);
  const rail = firstNonEmpty(racenetRow.rail, meetingMeta.rail, spMeta?.rail);
  const track = firstNonEmpty(racenetRow.track, meetingMeta.track, spMeta?.track, formatTrackName(folderTrack));
  return { raceTitle, distance, grade, going, rail, track };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseFolderMeta(folderPath) {
  const folderName = path.basename(path.resolve(folderPath));
  const m = folderName.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!m) {
    return { date: "unknown-date", track: "meeting" };
  }
  const [, date, rawTrack] = m;
  const track = String(rawTrack || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "meeting";
  return { date, track };
}

function parseCsvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse error (${filePath}): ${parsed.errors[0].message}`);
  }
  return parsed.data;
}

function parseSpeedproxyHtml(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const tableBlocks = [...html.matchAll(/(<table[\s\S]*?<\/table>)/gi)].map((m) => m[1]);
  const rows = [];

  for (const table of tableBlocks) {
    const captionMatch = table.match(/<caption>([\s\S]*?)<\/caption>/i);
    if (!captionMatch) continue;
    const captionText = cleanHtmlText(captionMatch[1]);
    const raceMatch = captionText.match(/race\s+No\.\s*(\d+)/i);
    if (!raceMatch) continue;
    const raceNo = raceMatch[1];

    const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => cleanHtmlText(m[1]).toLowerCase());
    const nameIdx = headers.indexOf("name");
    const wirIdx = headers.indexOf("w_ir");
    if (nameIdx < 0 || wirIdx < 0) continue;

    const rowBlocks = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
    for (const rowBlock of rowBlocks) {
      const cells = [...rowBlock.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanHtmlText(m[1]));
      if (!cells.length || cells.length <= Math.max(nameIdx, wirIdx)) continue;
      const nameRaw = cells[nameIdx];
      const nameParts = nameRaw.match(/^\s*(\d+)[eE]?\.(.+)$/);
      const no = nameParts ? nameParts[1] : "";
      const horse = cleanHtmlText(nameParts ? nameParts[2].replace(/\(\d+\)\s*$/, "") : nameRaw);
      const wIr = String(cells[wirIdx] || "").trim();
      if (!horse) continue;
      rows.push({ race_no: raceNo, no, horse, w_ir: wIr });
    }
  }

  return rows;
}

function runnerKey(raceNo, runnerNo) {
  const r = String(raceNo || "").trim();
  // Racing Australia marks emergencies as 18e while Speedproxy uses 18.
  const n = String(runnerNo || "").trim().replace(/[eE]$/, "").replace(/^0+/, "") || "0";
  return `${r}::${n}`;
}

function normalizeHorseNameForMatch(horse) {
  return String(horse || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function sameHorse(a, b) {
  const left = normalizeHorseNameForMatch(a);
  const right = normalizeHorseNameForMatch(b);
  return Boolean(left && right && left === right);
}

function horseMatchKey(raceNo, horse) {
  const r = String(raceNo || "").trim();
  return `${r}::${normalizeHorseNameForMatch(horse)}`;
}

function cleanFieldHorseName(horse, source) {
  const raw = String(horse || "").trim();
  if (!raw) return raw;
  return source === "racenet" ? cleanRacenetHorseName(raw) : raw;
}

function collectFieldParseWarnings(rows) {
  const warnings = [];
  const horsesByRace = new Map();

  for (const row of rows) {
    const raceNo = String(row.race_no || "").trim();
    const runnerNo = String(row.no || "").trim();
    const horse = String(row.horse || "").trim();
    if (!raceNo || !horse) continue;

    if (!horsesByRace.has(raceNo)) horsesByRace.set(raceNo, new Map());
    const raceHorses = horsesByRace.get(raceNo);
    const horseKey = normalizeHorseNameForMatch(horse);
    if (!raceHorses.has(horseKey)) raceHorses.set(horseKey, []);
    raceHorses.get(horseKey).push(runnerNo);

    if (!String(row.barrier || "").trim()) {
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNo,
        horse,
        warning_type: "missing_barrier",
        detail: "Barrier is empty",
      });
    }
    if (!String(row.jockey || "").trim()) {
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNo,
        horse,
        warning_type: "missing_jockey",
        detail: "Jockey is empty",
      });
    }
    if (!String(row.trainer || "").trim()) {
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNo,
        horse,
        warning_type: "missing_trainer",
        detail: "Trainer is empty",
      });
    }
    if (String(row.scratched || "").toLowerCase() === "true") {
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNo,
        horse,
        warning_type: "scratched_runner",
        detail: "Runner marked scratched",
      });
    }
    if (String(row.emergency || "").toLowerCase() === "true") {
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNo,
        horse,
        warning_type: "emergency_runner",
        detail: "Emergency acceptor",
      });
    }
  }

  for (const [raceNo, horseMap] of horsesByRace) {
    for (const [horseKey, runnerNos] of horseMap) {
      if (runnerNos.length <= 1) continue;
      warnings.push({
        race_no: raceNo,
        runner_no: runnerNos.join("/"),
        horse: horseKey,
        warning_type: "duplicate_horse_name",
        detail: `Duplicate horse in race ${raceNo}: runner_no ${runnerNos.join(", ")}`,
      });
    }
  }

  return warnings;
}

function writeValidationCsv(filePath, fields, rows) {
  const csv = Papa.unparse({ fields, data: rows });
  fs.writeFileSync(filePath, csv, "utf8");
}

function resolveFieldPdfSource(targetFolder, options = {}) {
  const racenetPath = path.join(targetFolder, "racenet.pdf");
  const risaPath = path.join(targetFolder, "risa.pdf");
  const existingRacenetCsv = path.join(targetFolder, "_racenet_extracted.csv");
  if (options.useExistingFieldCsv && fs.existsSync(existingRacenetCsv)) {
    return {
      source: "racenet",
      pdfPath: racenetPath,
      extractedCsvName: "_racenet_extracted.csv",
      useExistingFieldCsv: true,
    };
  }
  if (fs.existsSync(racenetPath)) {
    return { source: "racenet", pdfPath: racenetPath, extractedCsvName: "_racenet_extracted.csv" };
  }
  if (fs.existsSync(risaPath)) {
    return { source: "risa", pdfPath: risaPath, extractedCsvName: "_risa_extracted.csv" };
  }
  throw new Error("No supported field PDF found. Expected racenet.pdf or risa.pdf.");
}

function extractFieldRows(root, pdfSource) {
  const extractedCsvPath = path.join(path.dirname(pdfSource.pdfPath), pdfSource.extractedCsvName);
  if (pdfSource.useExistingFieldCsv) {
    return parseCsvFile(extractedCsvPath);
  }
  const scriptName = pdfSource.source === "risa" ? "scripts/parse_risa_pdf.py" : "scripts/pdf_to_csv.py";
  const bundledPython = path.join(
    os.homedir(),
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
  );
  const pythonExe = process.env.RACE_PYTHON || (fs.existsSync(bundledPython) ? bundledPython : "python");
  const sitePackages = path.join(root, "race-file-processor/.venv/Lib/site-packages");
  const childEnv = { ...process.env };
  if (fs.existsSync(sitePackages)) {
    childEnv.PYTHONPATH = [sitePackages, childEnv.PYTHONPATH].filter(Boolean).join(path.delimiter);
  }
  const pyRun = spawnSync(pythonExe, [scriptName, pdfSource.pdfPath, "-o", extractedCsvPath], {
    cwd: root,
    encoding: "utf8",
    env: childEnv,
  });
  if (pyRun.status !== 0) {
    const stderr = pyRun.stderr?.trim();
    const stdout = pyRun.stdout?.trim();
    throw new Error(`${scriptName} failed.\n${stderr || stdout || "Unknown error"}`);
  }
  return parseCsvFile(extractedCsvPath);
}

function mergeRows(fieldRows, speedproxyRows, spMetaByRace, meetingMeta, folderTrack, options = {}) {
  const { source = "racenet", matchByHorse = false } = options;
  const speedByRunnerKey = new Map();
  const speedByHorseKey = new Map();
  for (const row of speedproxyRows) {
    const raceNo = String(row.race_no || "").trim();
    const no = String(row.no || "").trim().replace(/^0+/, "") || "0";
    const horse = cleanHtmlText(String(row.horse || "").trim());
    if (!raceNo || !no) continue;
    speedByRunnerKey.set(runnerKey(raceNo, no), row);
    if (horse) speedByHorseKey.set(horseMatchKey(raceNo, horse), row);
  }

  const merged = [];
  const missingWir = [];
  const matchedSpeedproxyKeys = new Set();

  for (const row of fieldRows) {
    const raceNo = String(row.race_no || "").trim();
    const horseClean = cleanFieldHorseName(String(row.horse || "").trim(), source);
    const runnerNo = String(row.no || "").trim().replace(/^0+/, "") || "0";
    const numberedCandidate = speedByRunnerKey.get(runnerKey(raceNo, runnerNo));
    let sp = numberedCandidate && sameHorse(numberedCandidate.horse, horseClean)
      ? numberedCandidate
      : speedByHorseKey.get(horseMatchKey(raceNo, horseClean));
    if (!sp && (matchByHorse || source === "risa")) {
      sp = speedByHorseKey.get(horseMatchKey(raceNo, horseClean));
    }
    const wIr = sp ? String(sp.w_ir || "").trim() : "";
    if (sp) {
      matchedSpeedproxyKeys.add(runnerKey(String(sp.race_no || "").trim(), sp.no));
      matchedSpeedproxyKeys.add(horseMatchKey(String(sp.race_no || "").trim(), sp.horse));
    }
    const spMeta = spMetaByRace.get(raceNo) || {};
    const fields = resolveRaceFields(row, spMeta, meetingMeta, folderTrack);

    if (!wIr) {
      missingWir.push({ race_no: raceNo, runner_no: runnerNo, horse: horseClean });
    }

    merged.push({
      race_id: `R${raceNo}`,
      track: fields.track,
      race_no: raceNo,
      race_title: fields.raceTitle,
      distance: fields.distance,
      grade: fields.grade,
      going: fields.going,
      rail: fields.rail,
      weather: String(row.weather || "").trim(),
      penetrometer: String(row.penetrometer || "").trim(),
      track_information: String(row.track_information || "").trim(),
      runner_no: runnerNo,
      no: runnerNo,
      horse: horseClean,
      horse_name: horseClean,
      name: horseClean,
      barrier: String(row.barrier || "").trim(),
      trainer: String(row.trainer || "").trim(),
      jockey: String(row.jockey || "").trim(),
      odds: String(row.odds || "").trim(),
      w_ir: wIr,
      source,
    });
  }

  const fieldRunnerKeys = new Set(fieldRows.map((r) => runnerKey(r.race_no, r.no)));
  const fieldHorseKeys = new Set(
    fieldRows.map((r) => horseMatchKey(r.race_no, cleanFieldHorseName(String(r.horse || "").trim(), source))),
  );
  const unmatchedSeen = new Set();
  const unmatchedSpeedproxy = [];
  for (const row of speedproxyRows) {
    const raceNo = String(row.race_no || "").trim();
    const no = String(row.no || "").trim().replace(/^0+/, "") || "0";
    const horse = cleanHtmlText(String(row.horse || "").trim());
    if (!raceNo || !no) continue;
    const runnerMatchKey = runnerKey(raceNo, no);
    const horseKey = horseMatchKey(raceNo, horse);
    const matchedField =
      fieldRunnerKeys.has(runnerMatchKey) ||
      (source === "risa" && fieldHorseKeys.has(horseKey)) ||
      matchedSpeedproxyKeys.has(runnerMatchKey) ||
      matchedSpeedproxyKeys.has(horseKey);
    if (!matchedField && !unmatchedSeen.has(runnerMatchKey)) {
      unmatchedSeen.add(runnerMatchKey);
      unmatchedSpeedproxy.push({
        race_no: raceNo,
        no,
        horse,
        w_ir: String(row.w_ir || "").trim(),
      });
    }
  }

  return { merged, missingWir, unmatchedSpeedproxy };
}

function validateSpeedproxyMeeting(fieldRows, speedproxyRows, spMetaByRace) {
  const distancesCompatible = (fieldDistance, proxyDistance) => {
    if (fieldDistance === proxyDistance) return true;
    const fieldMetres = Number.parseInt(fieldDistance, 10);
    const proxyMetres = Number.parseInt(proxyDistance, 10);
    return Number.isFinite(fieldMetres) && Number.isFinite(proxyMetres)
      && Math.abs(fieldMetres - proxyMetres) <= 25;
  };
  const fieldRaceMeta = new Map();
  for (const row of fieldRows) {
    const raceNo = String(row.race_no || "").trim();
    const distance = String(row.distance || "").trim().toLowerCase();
    if (raceNo && distance && !fieldRaceMeta.has(raceNo)) fieldRaceMeta.set(raceNo, distance);
  }

  const distanceErrors = [];
  for (const [raceNo, expected] of fieldRaceMeta) {
    const actual = String(spMetaByRace.get(raceNo)?.distance || "").trim().toLowerCase();
    if (!actual || !distancesCompatible(expected, actual)) {
      distanceErrors.push(`R${raceNo}: field ${expected || "unknown"}, speedproxy ${actual || "missing"}`);
    }
  }
  if (distanceErrors.length) {
    throw new Error(`Speedproxy race-distance validation failed: ${distanceErrors.join("; ")}`);
  }

  const proxyHorseKeys = new Set(
    speedproxyRows.map((row) => horseMatchKey(row.race_no, row.horse)),
  );
  // Coverage is field identity only. A matched horse with blank w_ir is valid
  // (for example, a first starter or an entire debutant race).
  const totals = new Map();
  let matched = 0;
  let withWir = 0;
  for (const row of fieldRows) {
    const raceNo = String(row.race_no || "").trim();
    if (!totals.has(raceNo)) totals.set(raceNo, { total: 0, matched: 0 });
    const bucket = totals.get(raceNo);
    bucket.total += 1;
    const horse = cleanFieldHorseName(String(row.horse || "").trim(), "racenet");
    if (proxyHorseKeys.has(horseMatchKey(raceNo, horse))) {
      bucket.matched += 1;
      matched += 1;
      const speedRow = speedproxyRows.find(
        (candidate) => horseMatchKey(candidate.race_no, candidate.horse) === horseMatchKey(raceNo, horse),
      );
      if (String(speedRow?.w_ir || "").trim()) withWir += 1;
    }
  }

  const overallCoverage = fieldRows.length ? matched / fieldRows.length : 0;
  const weakRaces = [...totals.entries()]
    .filter(([, count]) => count.matched / count.total < 0.5)
    .map(([raceNo, count]) => `R${raceNo} ${count.matched}/${count.total}`);
  if (overallCoverage < 0.75 || weakRaces.length) {
    throw new Error(
      `Speedproxy field-identity validation failed: ${matched}/${fieldRows.length} horses present ` +
      `(${(overallCoverage * 100).toFixed(1)}%); weak races: ${weakRaces.join(", ") || "none"}`,
    );
  }
  return { matched, total: fieldRows.length, withWir, overallCoverage };
}

function countByRace(rows, raceField, runnerField) {
  const map = new Map();
  for (const row of rows) {
    const raceNo = String(row[raceField] || "").trim();
    if (!raceNo) continue;
    if (!map.has(raceNo)) map.set(raceNo, { count: 0, runners: [] });
    const bucket = map.get(raceNo);
    bucket.count += 1;
    if (runnerField) {
      const rn = String(row[runnerField] || "").trim().replace(/^0+/, "") || "0";
      bucket.runners.push(rn);
    }
  }
  return map;
}

function printRaceValidation(fieldActiveRows, mergedRows, sourceLabel) {
  const expected = countByRace(fieldActiveRows, "race_no", "no");
  const actual = countByRace(mergedRows, "race_no", "runner_no");
  const raceNos = [...new Set([...expected.keys(), ...actual.keys()])].sort((a, b) => Number(a) - Number(b));

  console.log("");
  console.log(`Per-race validation (expected = active ${sourceLabel} runners, actual = master CSV rows)`);
  let totalExpected = 0;
  let totalActual = 0;
  for (const raceNo of raceNos) {
    const exp = expected.get(raceNo);
    const act = actual.get(raceNo);
    const expCount = exp?.count ?? 0;
    const actCount = act?.count ?? 0;
    totalExpected += expCount;
    totalActual += actCount;
    const expSet = new Set(exp?.runners ?? []);
    const actSet = new Set(act?.runners ?? []);
    const missingFromMaster = [...expSet].filter((n) => !actSet.has(n)).sort((a, b) => Number(a) - Number(b));
    const extraInMaster = [...actSet].filter((n) => !expSet.has(n)).sort((a, b) => Number(a) - Number(b));
    const ok = expCount === actCount && missingFromMaster.length === 0 && extraInMaster.length === 0;
    console.log(
      `  R${raceNo}: expected ${expCount}, actual ${actCount}${ok ? " OK" : " MISMATCH"}`,
    );
    if (missingFromMaster.length) {
      console.log(`    missing runner_no in master: ${missingFromMaster.join(", ")}`);
    }
    if (extraInMaster.length) {
      console.log(`    extra runner_no in master: ${extraInMaster.join(", ")}`);
    }
  }
  console.log(`  TOTAL: expected ${totalExpected}, actual ${totalActual}${totalExpected === totalActual ? " OK" : " MISMATCH"}`);
}

function printRaceMetadataSummary(mergedRows) {
  const byRace = new Map();
  for (const row of mergedRows) {
    if (!byRace.has(row.race_no)) {
      byRace.set(row.race_no, {
        race_no: row.race_no,
        race_title: row.race_title,
        track: row.track,
        distance: row.distance,
        grade: row.grade,
        going: row.going,
        rail: row.rail,
      });
    }
  }
  console.log("");
  console.log("Race metadata on master CSV");
  for (const raceNo of [...byRace.keys()].sort((a, b) => Number(a) - Number(b))) {
    const meta = byRace.get(raceNo);
    console.log(
      `  R${raceNo}: distance=${meta.distance || "(empty)"} grade=${meta.grade || "(empty)"} going=${meta.going || "(empty)"} rail=${meta.rail || "(empty)"} track=${meta.track || "(empty)"}`,
    );
  }
}

/**
 * Compress live barrier numbers after scratchings. Example: if barriers 2 and
 * 5 are withdrawn, original barrier 7 becomes live barrier 5.
 */
function adjustBarriersForScratchings(allRows, activeRows) {
  const scratchedByRace = new Map();
  for (const row of allRows) {
    if (String(row.scratched || "").toLowerCase() !== "true") continue;
    const barrier = Number.parseInt(String(row.barrier || ""), 10);
    if (!Number.isFinite(barrier) || barrier < 1) continue;
    const raceNo = String(row.race_no || "").trim();
    if (!scratchedByRace.has(raceNo)) scratchedByRace.set(raceNo, []);
    scratchedByRace.get(raceNo).push(barrier);
  }
  return activeRows.map((row) => {
    const original = Number.parseInt(String(row.barrier || ""), 10);
    if (!Number.isFinite(original) || original < 1) return row;
    const withdrawnInside = (scratchedByRace.get(String(row.race_no || "").trim()) || [])
      .filter((barrier) => barrier < original).length;
    return { ...row, barrier: String(original - withdrawnInside) };
  });
}

function applyOfficialScratchings(targetFolder, fieldRows) {
  const officialPath = path.join(targetFolder, "official-scratchings.json");
  if (!fs.existsSync(officialPath)) return fieldRows;
  const official = JSON.parse(fs.readFileSync(officialPath, "utf8"));
  if (!Array.isArray(official.scratchings)) {
    throw new Error(`Invalid official scratchings file: ${officialPath}`);
  }
  const scratchedKeys = new Set(
    official.scratchings.map((item) =>
      `${String(item.raceNo || "").trim()}|${String(item.runnerNo || "").replace(/^0+/, "") || "0"}`,
    ),
  );
  const lateRiders = new Map(
    (Array.isArray(official.lateRiders) ? official.lateRiders : []).map((item) => [
      `${String(item.raceNo || "").trim()}|${String(item.runnerNo || "").replace(/^0+/, "") || "0"}`,
      String(item.rider || "").trim(),
    ]),
  );
  const applied = fieldRows.map((row) => ({
    ...row,
    scratched: scratchedKeys.has(
      `${String(row.race_no || "").trim()}|${String(row.no || "").replace(/^0+/, "") || "0"}`,
    ) ? "true" : "false",
    going: String(official.trackRating || row.going || "").trim(),
    rail: String(official.rail || row.rail || "").trim(),
    weather: String(official.weather || "").trim(),
    penetrometer: String(official.penetrometer || "").trim(),
    track_information: String(official.trackInformation || "").trim(),
    jockey: lateRiders.get(
      `${String(row.race_no || "").trim()}|${String(row.no || "").replace(/^0+/, "") || "0"}`,
    ) || row.jockey,
  }));
  const matched = applied.filter((row) => String(row.scratched).toLowerCase() === "true").length;
  if (matched !== scratchedKeys.size) {
    const officialStarterCount = Number.parseInt(String(official.totalStarters || ""), 10);
    const preScratchedField = matched === 0
      && Number.isFinite(officialStarterCount)
      && fieldRows.length === officialStarterCount;
    if (preScratchedField) {
      console.log(
        `official fields already exclude ${scratchedKeys.size} scratchings; `
        + `${officialStarterCount} starters retained`,
      );
      return applied;
    }
    throw new Error(
      `Official scratchings did not match the Racenet field: expected ${scratchedKeys.size}, matched ${matched}`,
    );
  }
  console.log(`official Racing Australia scratchings applied: ${matched}`);
  return applied;
}

function main() {
  const root = process.cwd();
  const folderArg = process.argv[2];
  const targetFolder = folderArg ? path.resolve(root, folderArg) : path.join(root, "input");
  ensureDir(targetFolder);

  const htmlPath = path.join(targetFolder, "speedproxy.html");
  const { date, track: folderTrack } = parseFolderMeta(targetFolder);
  const outputPath = path.join(targetFolder, `${folderTrack}_${date}_master.csv`);
  const warningsPath = path.join(targetFolder, "parse_warnings.csv");
  const unmatchedPath = path.join(targetFolder, "unmatched_speedproxy.csv");

  const useExistingFieldCsv = process.argv.includes("--use-existing-field-csv");
  const pdfSource = resolveFieldPdfSource(targetFolder, { useExistingFieldCsv });
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Missing input HTML: ${htmlPath}`);
  }

  const extractedFieldRows = extractFieldRows(root, pdfSource);
  const rawFieldRows = applyOfficialScratchings(targetFolder, extractedFieldRows);
  const parseWarnings = collectFieldParseWarnings(rawFieldRows);
  const activeFieldRows = rawFieldRows.filter(
    (r) => String(r.scratched || "").toLowerCase() !== "true",
  );
  const fieldRows = adjustBarriersForScratchings(rawFieldRows, activeFieldRows);
  const speedproxyHtml = fs.readFileSync(htmlPath, "utf8");
  const spMetaByRace = parseSpeedproxyRaceMeta(speedproxyHtml);
  const meetingMeta = meetingMetaFromRacenetRows(fieldRows);
  const speedproxyRows = parseSpeedproxyHtml(htmlPath);
  const coverage = validateSpeedproxyMeeting(fieldRows, speedproxyRows, spMetaByRace);
  console.log(
    `speedproxy identity coverage: ${coverage.matched}/${coverage.total} ` +
    `(${(coverage.overallCoverage * 100).toFixed(1)}%); numeric w_ir: ${coverage.withWir}/${coverage.total}`,
  );
  const { merged, missingWir, unmatchedSpeedproxy } = mergeRows(
    fieldRows,
    speedproxyRows,
    spMetaByRace,
    meetingMeta,
    folderTrack,
    { source: pdfSource.source, matchByHorse: pdfSource.source === "risa" },
  );

  const csv = Papa.unparse({ fields: OUTPUT_COLUMNS, data: merged });
  fs.writeFileSync(outputPath, csv, "utf8");
  writeValidationCsv(warningsPath, WARNING_COLUMNS, parseWarnings);
  writeValidationCsv(unmatchedPath, UNMATCHED_SPEEDPROXY_COLUMNS, unmatchedSpeedproxy);

  const raceCount = new Set(merged.map((r) => r.race_no)).size;
  const matchedWir = merged.filter((r) => String(r.w_ir || "").trim() !== "").length;
  const sourceLabel = pdfSource.source === "risa" ? "RISA" : "Racenet";

  printRaceValidation(fieldRows, merged, sourceLabel);
  printRaceMetadataSummary(merged);

  console.log("");
  console.log("Master CSV created");
  console.log(`field PDF source: ${pdfSource.source} (${path.basename(pdfSource.pdfPath)})`);
  console.log(`number of races: ${raceCount}`);
  console.log(`number of runners: ${merged.length}`);
  console.log(`number matched with w_ir: ${matchedWir}`);
  console.log(`runners without speedproxy w_ir (blank / NA still included in CSV): ${missingWir.length}`);
  if (missingWir.length) {
    const byRace = new Map();
    for (const row of missingWir) {
      if (!byRace.has(row.race_no)) byRace.set(row.race_no, []);
      byRace.get(row.race_no).push(row.runner_no);
    }
    const sortedRaces = [...byRace.keys()].sort((a, b) => Number(a) - Number(b));
    for (const raceNo of sortedRaces) {
      const nos = [...byRace.get(raceNo)].sort((a, b) => Number(a) - Number(b));
      console.log(`  - R${raceNo} missing w_ir runner_no: ${nos.join(", ")}`);
    }
  }
  console.log(`speedproxy rows with no field runner match: ${unmatchedSpeedproxy.length}`);
  if (unmatchedSpeedproxy.length) {
    for (const row of unmatchedSpeedproxy) {
      console.log(`  - race ${row.race_no} runner ${row.no}: ${row.horse}`);
    }
  }
  console.log(`parse warnings: ${parseWarnings.length} (see ${warningsPath})`);
  console.log(`unmatched speedproxy report: ${unmatchedPath}`);
  console.log(`output file path: ${outputPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = {
  mergeRows,
  normalizeHorseNameForMatch,
  parseSpeedproxyRaceMeta,
  validateSpeedproxyMeeting,
};
