#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
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
];

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
    if (!/^[A-Za-z]+$/.test(right) || ![...right].every((c) => LEGEND_SUFFIX_CHARS.has(c.toLowerCase()))) {
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
  const n = String(runnerNo || "").trim().replace(/^0+/, "") || "0";
  return `${r}::${n}`;
}

function mergeRows(racenetRows, speedproxyRows, spMetaByRace, meetingMeta, folderTrack) {
  const speedByKey = new Map();
  for (const row of speedproxyRows) {
    const raceNo = String(row.race_no || "").trim();
    const no = String(row.no || "").trim().replace(/^0+/, "") || "0";
    if (!raceNo || !no) continue;
    speedByKey.set(runnerKey(raceNo, no), row);
  }

  const merged = [];
  const missingWir = [];

  for (const row of racenetRows) {
    const raceNo = String(row.race_no || "").trim();
    const horseClean = cleanRacenetHorseName(String(row.horse || "").trim());
    const runnerNo = String(row.no || "").trim().replace(/^0+/, "") || "0";
    const key = runnerKey(raceNo, runnerNo);
    const sp = speedByKey.get(key);
    const wIr = sp ? String(sp.w_ir || "").trim() : "";
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
    });
  }

  const racenetKeys = new Set(racenetRows.map((r) => runnerKey(r.race_no, r.no)));
  const unmatchedSeen = new Set();
  const unmatchedSpeedproxy = [];
  for (const row of speedproxyRows) {
    const raceNo = String(row.race_no || "").trim();
    const no = String(row.no || "").trim().replace(/^0+/, "") || "0";
    if (!raceNo || !no) continue;
    const key = runnerKey(raceNo, no);
    if (!racenetKeys.has(key) && !unmatchedSeen.has(key)) {
      unmatchedSeen.add(key);
      unmatchedSpeedproxy.push(row);
    }
  }

  return { merged, missingWir, unmatchedSpeedproxy };
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

function printRaceValidation(racenetActiveRows, mergedRows) {
  const expected = countByRace(racenetActiveRows, "race_no", "no");
  const actual = countByRace(mergedRows, "race_no", "runner_no");
  const raceNos = [...new Set([...expected.keys(), ...actual.keys()])].sort((a, b) => Number(a) - Number(b));

  console.log("");
  console.log("Per-race validation (expected = active Racenet runners, actual = master CSV rows)");
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

function main() {
  const root = process.cwd();
  const folderArg = process.argv[2];
  const targetFolder = folderArg ? path.resolve(root, folderArg) : path.join(root, "input");
  ensureDir(targetFolder);

  const pdfPath = path.join(targetFolder, "racenet.pdf");
  const htmlPath = path.join(targetFolder, "speedproxy.html");
  const racenetCsvPath = path.join(targetFolder, "_racenet_extracted.csv");
  const { date, track: folderTrack } = parseFolderMeta(targetFolder);
  const outputPath = path.join(targetFolder, `${folderTrack}_${date}_master.csv`);

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Missing input PDF: ${pdfPath}`);
  }
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Missing input HTML: ${htmlPath}`);
  }

  const pyRun = spawnSync("python", ["scripts/pdf_to_csv.py", pdfPath, "-o", racenetCsvPath], {
    cwd: root,
    encoding: "utf8",
  });
  if (pyRun.status !== 0) {
    const stderr = pyRun.stderr?.trim();
    const stdout = pyRun.stdout?.trim();
    throw new Error(`pdf_to_csv.py failed.\n${stderr || stdout || "Unknown error"}`);
  }

  const rawRacenet = parseCsvFile(racenetCsvPath);
  const racenetRows = rawRacenet.filter((r) => String(r.scratched || "").toLowerCase() !== "true");
  const speedproxyHtml = fs.readFileSync(htmlPath, "utf8");
  const spMetaByRace = parseSpeedproxyRaceMeta(speedproxyHtml);
  const meetingMeta = meetingMetaFromRacenetRows(racenetRows);
  const speedproxyRows = parseSpeedproxyHtml(htmlPath);
  const { merged, missingWir, unmatchedSpeedproxy } = mergeRows(
    racenetRows,
    speedproxyRows,
    spMetaByRace,
    meetingMeta,
    folderTrack,
  );

  const csv = Papa.unparse({ fields: OUTPUT_COLUMNS, data: merged });
  fs.writeFileSync(outputPath, csv, "utf8");

  const raceCount = new Set(merged.map((r) => r.race_no)).size;
  const matchedWir = merged.filter((r) => String(r.w_ir || "").trim() !== "").length;

  printRaceValidation(racenetRows, merged);
  printRaceMetadataSummary(merged);

  console.log("");
  console.log("Master CSV created");
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
  console.log(`speedproxy rows with no Racenet runner (race_no + runner_no): ${unmatchedSpeedproxy.length}`);
  if (unmatchedSpeedproxy.length) {
    for (const row of unmatchedSpeedproxy) {
      console.log(`  - race ${row.race_no} runner ${row.no}: ${row.horse}`);
    }
  }
  console.log(`output file path: ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
