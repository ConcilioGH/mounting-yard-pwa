import { normalizeRaceNo } from "@/lib/meeting-coordination";
import { parseDecimalSp } from "@/lib/results-sp-parser";

export type ParsedFullFieldRunner = {
  finishPosition: number;
  horseName: string;
  sp: number;
  margin: string;
  resultStatus: string;
};

export type ParsedFullFieldRace = {
  raceNo: string;
  runners: ParsedFullFieldRunner[];
};

function parseHtmlDocument(html: string): Document | null {
  if (typeof DOMParser === "undefined") return null;
  try {
    return new DOMParser().parseFromString(html, "text/html");
  } catch {
    return null;
  }
}

function parseFinishPosition(raw: string): number | null {
  const cleaned = String(raw ?? "").trim();
  if (!cleaned || /scr|dnf|dq|bd/i.test(cleaned)) return null;
  const match = cleaned.match(/(\d{1,2})/);
  if (!match) return null;
  const n = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(n) || n < 1 || n > 40) return null;
  return n;
}

function resultStatusFromCell(raw: string): string {
  const text = String(raw ?? "").trim();
  if (/^scr/i.test(text)) return "scratched";
  if (/dnf/i.test(text)) return "dnf";
  if (/dq/i.test(text)) return "disqualified";
  return "resulted";
}

function parseMarginFromCells(cells: string[]): string {
  for (const cell of cells) {
    const text = String(cell ?? "").trim();
    if (!text) continue;
    if (/^(?:\d+(?:\.\d+)?\s*(?:L|len|lengths?)|Nose|Head|Neck|HD|NK|SHD)$/i.test(text)) {
      return text;
    }
    const marginMatch = text.match(/\b(\d+(?:\.\d+)?)\s*L\b/i);
    if (marginMatch) return `${marginMatch[1]}L`;
  }
  return "";
}

function parseFullFieldFromTableRows(doc: Document, targetRaceNo?: string): ParsedFullFieldRace[] {
  const found: ParsedFullFieldRace[] = [];
  const byRace = new Map<string, ParsedFullFieldRunner[]>();
  let currentRaceNo = "";
  const raceHeaderRe = /Race\s*(\d+)/i;
  const tables = [...doc.querySelectorAll("table")];

  for (const table of tables) {
    const caption = table.querySelector("caption")?.textContent ?? "";
    const headerMatch = raceHeaderRe.exec(caption);
    if (headerMatch) currentRaceNo = normalizeRaceNo(headerMatch[1]!);

    const rows = [...table.querySelectorAll("tr")];
    if (rows.length < 2) continue;

    const headerCells = [...rows[0]!.querySelectorAll("th,td")].map((c) =>
      (c.textContent ?? "").toLowerCase().replace(/\s+/g, " "),
    );
    const placeIdx = headerCells.findIndex(
      (h) => /^(pl|pos|position|place|fin)$/.test(h) || h.includes("pos") || h.includes("pl"),
    );
    const spIdx = headerCells.findIndex(
      (h) => h.includes("sp") || h.includes("start") || h.includes("price") || h === "$",
    );
    const nameIdx = headerCells.findIndex(
      (h) => h.includes("horse") || h.includes("runner") || h === "name" || h.includes("selection"),
    );
    const marginIdx = headerCells.findIndex((h) => h.includes("margin") || h.includes("beaten") || h === "marg");

    if (placeIdx < 0 || spIdx < 0) continue;

    for (const row of rows.slice(1)) {
      const cells = [...row.querySelectorAll("td,th")].map((c) =>
        (c.textContent ?? "").trim().replace(/\s+/g, " "),
      );
      if (cells.length <= Math.max(placeIdx, spIdx)) continue;

      const place = parseFinishPosition(cells[placeIdx] ?? "");
      const sp = parseDecimalSp(cells[spIdx] ?? "");
      if (place == null || sp == null) continue;

      const horseName =
        nameIdx >= 0 ? (cells[nameIdx] ?? "").trim() : (cells[1] ?? cells[0] ?? "").trim();
      if (!horseName) continue;

      const rowRace =
        row.closest("[data-race-number],[data-race-no],[data-event-number]")?.getAttribute("data-race-number") ??
        row.closest("[data-race-number],[data-race-no],[data-event-number]")?.getAttribute("data-race-no") ??
        row.closest("[data-race-number],[data-race-no],[data-event-number]")?.getAttribute("data-event-number");
      const raceNo = rowRace ? normalizeRaceNo(rowRace) : currentRaceNo;
      if (!raceNo) continue;
      if (targetRaceNo && normalizeRaceNo(targetRaceNo) !== raceNo) continue;

      const margin =
        marginIdx >= 0
          ? String(cells[marginIdx] ?? "").trim()
          : parseMarginFromCells(cells);

      if (!byRace.has(raceNo)) byRace.set(raceNo, []);
      const bucket = byRace.get(raceNo)!;
      const existing = bucket.find((r) => r.finishPosition === place);
      const entry: ParsedFullFieldRunner = {
        finishPosition: place,
        horseName,
        sp,
        margin,
        resultStatus: resultStatusFromCell(cells[placeIdx] ?? ""),
      };
      if (existing) {
        Object.assign(existing, entry);
      } else {
        bucket.push(entry);
      }
    }
  }

  for (const [raceNo, runners] of byRace) {
    found.push({
      raceNo,
      runners: [...runners].sort((a, b) => a.finishPosition - b.finishPosition),
    });
  }

  return found.sort((a, b) => a.raceNo.localeCompare(b.raceNo, undefined, { numeric: true }));
}

function parseFullFieldFromJson(html: string, targetRaceNo?: string): ParsedFullFieldRace[] {
  const byRace = new Map<string, ParsedFullFieldRunner[]>();
  const objectChunkRe = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  const raceNoKeys = ["eventNumber", "raceNumber", "raceNo", "race_no"];
  const positionKeys = ["finishPosition", "finishingPosition", "place", "position", "finish"];
  const spKeys = ["startingPrice", "startPrice", "sp", "starting_price", "decimalSp", "price"];
  const nameKeys = ["horseName", "horse", "name", "runnerName"];

  for (const chunk of html.match(objectChunkRe) ?? []) {
    if (chunk.length > 8000) continue;
    let raceNo = "";
    for (const key of raceNoKeys) {
      const rm = new RegExp(`"${key}"\\s*:\\s*"?([Rr]?\\d+)"?`, "i").exec(chunk);
      if (rm) {
        raceNo = normalizeRaceNo(rm[1]!);
        break;
      }
    }
    if (!raceNo) continue;
    if (targetRaceNo && normalizeRaceNo(targetRaceNo) !== raceNo) continue;

    let finishPosition: number | null = null;
    for (const key of positionKeys) {
      const pm = new RegExp(`"${key}"\\s*:\\s*(\\d{1,2})`, "i").exec(chunk);
      if (pm) {
        finishPosition = parseFinishPosition(pm[1]!);
        break;
      }
    }
    if (finishPosition == null) continue;

    let sp: number | null = null;
    for (const key of spKeys) {
      const sm = new RegExp(`"${key}"\\s*:\\s*([\\d.]+)`, "i").exec(chunk);
      if (sm) {
        sp = parseDecimalSp(sm[1]!);
        if (sp != null) break;
      }
    }
    if (sp == null) continue;

    let horseName = "";
    for (const key of nameKeys) {
      const hm = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i").exec(chunk);
      if (hm?.[1]) {
        horseName = hm[1].trim();
        break;
      }
    }
    if (!horseName) continue;

    if (!byRace.has(raceNo)) byRace.set(raceNo, []);
    const bucket = byRace.get(raceNo)!;
    if (!bucket.some((r) => r.finishPosition === finishPosition)) {
      bucket.push({
        finishPosition,
        horseName,
        sp,
        margin: "",
        resultStatus: "resulted",
      });
    }
  }

  return [...byRace.entries()].map(([raceNo, runners]) => ({
    raceNo,
    runners: runners.sort((a, b) => a.finishPosition - b.finishPosition),
  }));
}

/** Parse all resulted runners (with SP) for one or all races from results HTML. */
export function parseFullFieldResultsFromHtml(html: string, targetRaceNo?: string): ParsedFullFieldRace[] {
  const trimmed = html.trim();
  if (!trimmed) return [];
  const doc = parseHtmlDocument(trimmed);
  const fromTables = doc ? parseFullFieldFromTableRows(doc, targetRaceNo) : [];
  const fromJson = parseFullFieldFromJson(trimmed, targetRaceNo);

  const merged = new Map<string, ParsedFullFieldRunner[]>();
  for (const race of [...fromTables, ...fromJson]) {
    const raceNo = normalizeRaceNo(race.raceNo);
    if (!raceNo) continue;
    if (targetRaceNo && normalizeRaceNo(targetRaceNo) !== raceNo) continue;
    if (!merged.has(raceNo)) merged.set(raceNo, []);
    const bucket = merged.get(raceNo)!;
    for (const runner of race.runners) {
      if (!bucket.some((r) => r.finishPosition === runner.finishPosition)) {
        bucket.push(runner);
      }
    }
  }

  return [...merged.entries()]
    .map(([raceNo, runners]) => ({
      raceNo,
      runners: runners.sort((a, b) => a.finishPosition - b.finishPosition),
    }))
    .sort((a, b) => a.raceNo.localeCompare(b.raceNo, undefined, { numeric: true }));
}

export function isRaceOfficiallyResulted(parsed: ParsedFullFieldRace | undefined): boolean {
  if (!parsed || parsed.runners.length < 3) return false;
  const positions = new Set(parsed.runners.map((r) => r.finishPosition));
  return positions.has(1) && positions.has(2) && positions.has(3);
}
