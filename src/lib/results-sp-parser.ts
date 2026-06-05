import { normalizeRaceNo } from "@/lib/meeting-coordination";

export type ParsedRaceResult = {
  raceNo: string;
  finishPosition: 1 | 2 | 3 | 4;
  horseName?: string;
  sp: number;
};

/** Results grouped by race (return shape of `parseResultsSpFromHtml`). */
export type ParsedRaceResults = {
  raceNo: string;
  results: Array<{
    finishPosition: 1 | 2 | 3 | 4;
    horseName?: string;
    sp: number;
  }>;
};

export type ParseResultsSpMeta = {
  parserId: string;
  races: ParsedRaceResults[];
};

function isFinishPosition(n: number): n is 1 | 2 | 3 | 4 {
  return n >= 1 && n <= 4;
}

/** Parse decimal SP from text ($12.50, 12.5, etc.). */
export function parseDecimalSp(raw: string): number | null {
  const cleaned = String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[$£€]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned || /^[-—–]$/.test(cleaned)) return null;
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number.parseFloat(match[1]!);
  if (!Number.isFinite(n) || n <= 0 || n > 9999) return null;
  return Math.round(n * 100) / 100;
}

function groupResultsByRace(flat: ParsedRaceResult[]): ParsedRaceResults[] {
  const byRace = new Map<string, ParsedRaceResults["results"]>();
  for (const row of flat) {
    const raceNo = normalizeRaceNo(row.raceNo);
    if (!raceNo) continue;
    if (!byRace.has(raceNo)) byRace.set(raceNo, []);
    const bucket = byRace.get(raceNo)!;
    const existing = bucket.find((r) => r.finishPosition === row.finishPosition);
    const entry = {
      finishPosition: row.finishPosition,
      horseName: row.horseName,
      sp: row.sp,
    };
    if (existing) {
      existing.sp = entry.sp;
      if (entry.horseName) existing.horseName = entry.horseName;
    } else {
      bucket.push(entry);
    }
  }
  return [...byRace.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([raceNo, results]) => ({
      raceNo,
      results: results.sort((a, b) => a.finishPosition - b.finishPosition),
    }));
}

function scoreGrouped(races: ParsedRaceResults[]): number {
  return races.reduce((sum, race) => sum + race.results.length, 0);
}

function parseHtmlDocument(html: string): Document | null {
  if (typeof DOMParser === "undefined") return null;
  try {
    return new DOMParser().parseFromString(html, "text/html");
  } catch {
    return null;
  }
}

function detectResultsSite(html: string): "racenet" | "racingnsw" | "tab" | "generic" {
  const lower = html.toLowerCase();
  if (lower.includes("racenet.com.au") || lower.includes("racenet")) return "racenet";
  if (lower.includes("racingnsw.com.au") || lower.includes("racing nsw")) return "racingnsw";
  if (lower.includes("tab.com.au") || lower.includes("tab.nz")) return "tab";
  return "generic";
}

/** Extract embedded JSON blobs (Next.js, etc.) from HTML. */
function extractScriptJsonTexts(html: string): string[] {
  const texts: string[] = [];
  const nextData = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextData?.[1]) texts.push(nextData[1]);
  const scriptRe = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    if (m[1]?.trim()) texts.push(m[1]);
  }
  return texts;
}

function parseFromEmbeddedJson(html: string): ParsedRaceResult[] {
  const found: ParsedRaceResult[] = [];
  const texts = extractScriptJsonTexts(html);
  texts.push(html);

  const raceNoKeys = ["eventNumber", "raceNumber", "raceNo", "race_no", "raceNumber"];
  const positionKeys = ["finishPosition", "finishingPosition", "place", "position", "finish"];
  const spKeys = ["startingPrice", "startPrice", "sp", "starting_price", "decimalSp", "price"];
  const nameKeys = ["horseName", "horse", "name", "runnerName"];

  const objectChunkRe = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;

  for (const text of texts) {
    for (const chunk of text.match(objectChunkRe) ?? []) {
      if (chunk.length > 4000) continue;
      let raceNo = "";
      for (const key of raceNoKeys) {
        const rm = new RegExp(`"${key}"\\s*:\\s*"?([Rr]?\\d+)"?`, "i").exec(chunk);
        if (rm) {
          raceNo = normalizeRaceNo(rm[1]!);
          break;
        }
      }
      if (!raceNo) {
        const header = /Race\s*(\d+)/i.exec(chunk);
        if (header) raceNo = normalizeRaceNo(header[1]!);
      }

      let finishPosition = 0;
      for (const key of positionKeys) {
        const pm = new RegExp(`"${key}"\\s*:\\s*([1-4])`, "i").exec(chunk);
        if (pm) {
          finishPosition = Number(pm[1]);
          break;
        }
      }
      if (!isFinishPosition(finishPosition)) continue;

      let sp: number | null = null;
      for (const key of spKeys) {
        const sm = new RegExp(`"${key}"\\s*:\\s*([\\d.]+)`, "i").exec(chunk);
        if (sm) {
          sp = parseDecimalSp(sm[1]!);
          if (sp != null) break;
        }
      }
      if (sp == null) continue;

      let horseName: string | undefined;
      for (const key of nameKeys) {
        const hm = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i").exec(chunk);
        if (hm?.[1]) {
          horseName = hm[1].trim();
          break;
        }
      }

      if (!raceNo) continue;
      found.push({ raceNo, finishPosition, horseName, sp });
    }
  }

  return found;
}

function parseResultsFromTableRows(doc: Document): ParsedRaceResult[] {
  const found: ParsedRaceResult[] = [];
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
    const placeIdx = headerCells.findIndex((h) => /^(pl|pos|position|place|fin)$/.test(h) || h.includes("pos"));
    const spIdx = headerCells.findIndex(
      (h) => h.includes("sp") || h.includes("start") || h.includes("price") || h === "$",
    );
    const nameIdx = headerCells.findIndex((h) => h.includes("horse") || h.includes("runner") || h === "name");

    if (placeIdx < 0 || spIdx < 0) continue;

    for (const row of rows.slice(1)) {
      const cells = [...row.querySelectorAll("td,th")];
      if (cells.length <= Math.max(placeIdx, spIdx)) continue;
      const placeRaw = (cells[placeIdx]?.textContent ?? "").trim();
      const place = Number.parseInt(placeRaw.replace(/\D/g, ""), 10);
      if (!isFinishPosition(place)) continue;
      const sp = parseDecimalSp(cells[spIdx]?.textContent ?? "");
      if (sp == null) continue;
      const horseName =
        nameIdx >= 0 ? (cells[nameIdx]?.textContent ?? "").trim().replace(/\s+/g, " ") : undefined;
      const rowRace =
        row.closest("[data-race-number],[data-race-no],[data-event-number]")?.getAttribute("data-race-number") ??
        row.closest("[data-race-number],[data-race-no],[data-event-number]")?.getAttribute("data-race-no") ??
        row.closest("[data-race-number],[data-race-no],[data-event-number]")?.getAttribute("data-event-number");
      const raceNo = rowRace ? normalizeRaceNo(rowRace) : currentRaceNo;
      if (!raceNo) continue;
      found.push({ raceNo, finishPosition: place, horseName: horseName || undefined, sp });
    }
  }

  return found;
}

function parseRaceSectionsFromText(html: string): ParsedRaceResult[] {
  const found: ParsedRaceResult[] = [];
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const sections = stripped.split(/(?=Race\s*\d+\b)/gi);

  for (const section of sections) {
    const raceMatch = /Race\s*(\d+)/i.exec(section);
    if (!raceMatch) continue;
    const raceNo = normalizeRaceNo(raceMatch[1]!);
    const rowRe =
      /(?:^|[\s>])([1-4])(?:st|nd|rd|th)?[\s\S]{0,120}?(?:\$|SP\s*)?(\d+(?:\.\d+)?)(?:\s*<|\s|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(section)) !== null) {
      const place = Number(m[1]);
      if (!isFinishPosition(place)) continue;
      const sp = parseDecimalSp(m[2]!);
      if (sp == null) continue;
      found.push({ raceNo, finishPosition: place, sp });
    }
  }

  return found;
}

/** Racenet — JSON payloads + results tables. */
export function parseRacenetResultsHtml(html: string, doc?: Document | null): ParsedRaceResult[] {
  const fromJson = parseFromEmbeddedJson(html);
  const docParsed = doc ?? parseHtmlDocument(html);
  const fromTables = docParsed ? parseResultsFromTableRows(docParsed) : [];
  const fromText = parseRaceSectionsFromText(html);
  return [...fromJson, ...fromTables, ...fromText];
}

/** Racing NSW — panel-style results markup. */
export function parseRacingNswResultsHtml(html: string, doc?: Document | null): ParsedRaceResult[] {
  const found: ParsedRaceResult[] = [];
  const docParsed = doc ?? parseHtmlDocument(html);
  if (docParsed) {
    const raceNames = [...docParsed.querySelectorAll("span[id$='lblResultsRaceName'], .race-name, [class*='race-name']")];
    for (const el of raceNames) {
      const raceMatch = /Race\s*(\d+)/i.exec(el.textContent ?? "");
      if (!raceMatch) continue;
      const raceNo = normalizeRaceNo(raceMatch[1]!);
      const container =
        el.closest("div[id*='tabRace'], .race-results, section, table") ?? el.parentElement?.parentElement;
      if (!container) continue;
      const rows = [...container.querySelectorAll("tr")];
      for (const row of rows) {
        const cells = [...row.querySelectorAll("td")];
        if (cells.length < 3) continue;
        const place = Number.parseInt((cells[0]?.textContent ?? "").replace(/\D/g, ""), 10);
        if (!isFinishPosition(place)) continue;
        const spCell = cells.find((c) => /sp|price|start/i.test(c.textContent ?? "") || /\$\d/.test(c.textContent ?? ""));
        const sp = parseDecimalSp(spCell?.textContent ?? cells[cells.length - 1]?.textContent ?? "");
        if (sp == null) continue;
        const horseName = (cells[1]?.textContent ?? "").trim().replace(/\s+/g, " ") || undefined;
        found.push({ raceNo, finishPosition: place, horseName, sp });
      }
    }
    found.push(...parseResultsFromTableRows(docParsed));
  }
  found.push(...parseFromEmbeddedJson(html), ...parseRaceSectionsFromText(html));
  return found;
}

/** TAB results pages. */
export function parseTabResultsHtml(html: string, doc?: Document | null): ParsedRaceResult[] {
  const found: ParsedRaceResult[] = [];
  const docParsed = doc ?? parseHtmlDocument(html);
  if (docParsed) {
    const raceBlocks = docParsed.querySelectorAll(
      "[data-race-number], [data-event-id], [class*='race-card'], [class*='RaceCard']",
    );
    for (const block of raceBlocks) {
      const raceAttr =
        block.getAttribute("data-race-number") ??
        block.getAttribute("data-race-no") ??
        /Race\s*(\d+)/i.exec(block.querySelector("h2,h3,h4")?.textContent ?? "")?.[1];
      const raceNo = raceAttr ? normalizeRaceNo(String(raceAttr)) : "";
      if (!raceNo) continue;
      for (const row of block.querySelectorAll("tr, [class*='runner'], [class*='Runner']")) {
        const text = (row.textContent ?? "").replace(/\s+/g, " ");
        const placeMatch = /(?:^|\s)([1-4])(?:st|nd|rd|th)?(?:\s|$)/i.exec(text);
        if (!placeMatch) continue;
        const place = Number(placeMatch[1]);
        if (!isFinishPosition(place)) continue;
        const spMatch = /(?:SP|Start(?:ing)?\s*Price|\$)\s*(\d+(?:\.\d+)?)/i.exec(text);
        const sp = parseDecimalSp(spMatch?.[1] ?? "");
        if (sp == null) continue;
        found.push({ raceNo, finishPosition: place, sp });
      }
    }
    found.push(...parseResultsFromTableRows(docParsed));
  }
  found.push(...parseFromEmbeddedJson(html), ...parseRaceSectionsFromText(html));
  return found;
}

/** Fallback heuristics for unknown results HTML. */
export function parseGenericResultsHtml(html: string, doc?: Document | null): ParsedRaceResult[] {
  const docParsed = doc ?? parseHtmlDocument(html);
  const found: ParsedRaceResult[] = [];
  if (docParsed) found.push(...parseResultsFromTableRows(docParsed));
  found.push(...parseFromEmbeddedJson(html), ...parseRaceSectionsFromText(html));
  return found;
}

function pickBestParser(html: string, doc: Document | null): ParseResultsSpMeta {
  const site = detectResultsSite(html);
  const attempts: Array<{ parserId: string; flat: ParsedRaceResult[] }> = [
    { parserId: "racenet", flat: parseRacenetResultsHtml(html, doc) },
    { parserId: "racingnsw", flat: parseRacingNswResultsHtml(html, doc) },
    { parserId: "tab", flat: parseTabResultsHtml(html, doc) },
    { parserId: "generic", flat: parseGenericResultsHtml(html, doc) },
  ];

  if (site === "racenet") attempts.sort((a) => (a.parserId === "racenet" ? -1 : 1));
  if (site === "racingnsw") attempts.sort((a) => (a.parserId === "racingnsw" ? -1 : 1));
  if (site === "tab") attempts.sort((a) => (a.parserId === "tab" ? -1 : 1));

  let best: ParseResultsSpMeta = { parserId: "generic", races: [] };
  let bestScore = 0;
  for (const attempt of attempts) {
    const grouped = groupResultsByRace(attempt.flat);
    const score = scoreGrouped(grouped);
    if (score > bestScore) {
      bestScore = score;
      best = { parserId: attempt.parserId, races: grouped };
    }
  }
  return best;
}

/**
 * Parse results HTML and extract top-4 SPs per race.
 * Tries site-specific parsers (Racenet, Racing NSW, TAB) then generic heuristics.
 */
export function parseResultsSpFromHtml(html: string): ParsedRaceResults[] {
  const trimmed = html.trim();
  if (!trimmed) return [];
  const doc = parseHtmlDocument(trimmed);
  return pickBestParser(trimmed, doc).races;
}

export function parseResultsSpFromHtmlWithMeta(html: string): ParseResultsSpMeta {
  const trimmed = html.trim();
  if (!trimmed) return { parserId: "none", races: [] };
  const doc = parseHtmlDocument(trimmed);
  return pickBestParser(trimmed, doc);
}

/** Fetch results page HTML (may fail due to CORS on some sites). */
export async function fetchResultsHtmlFromUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Invalid URL.");
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error("URL must start with http:// or https://");
  }
  const res = await fetch(parsed.toString(), {
    method: "GET",
    credentials: "omit",
    mode: "cors",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!res.ok) {
    throw new Error(
      `Could not fetch page (${res.status}). Save the results page as HTML and upload it, or paste the page source.`,
    );
  }
  const text = await res.text();
  if (!text.trim()) throw new Error("Fetched page was empty.");
  return text;
}

export function flattenParsedRaceResults(grouped: ParsedRaceResults[]): ParsedRaceResult[] {
  return grouped.flatMap((race) =>
    race.results.map((r) => ({
      raceNo: race.raceNo,
      finishPosition: r.finishPosition,
      horseName: r.horseName,
      sp: r.sp,
    })),
  );
}
