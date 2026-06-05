#!/usr/bin/env python3
"""Merge Racenet PDF rows with speedproxy HTML rows."""

from __future__ import annotations

import csv
import difflib
import html
import re
from pathlib import Path

MERGED_HEADERS = [
    "race_no",
    "race_name",
    "start_time",
    "distance",
    "track",
    "grade",
    "going",
    "rail",
    "no",
    "horse",
    "barrier",
    "w_ir",
    "trainer",
    "jockey",
    "weight",
    "odds",
    "scratched",
    "merge_status",
]

MASTER_CSV_HEADERS = [
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
]

RACE_CAPTION_META_RE = re.compile(
    r"race\s+No\.?\s*(\d+)\s*:\s*(\d+)\s*m;\s*(.+)$",
    re.IGNORECASE,
)
START_TIME_IN_NAME_RE = re.compile(r"\b(\d{1,2}:\d{2}\s*(?:am|pm))\b", re.IGNORECASE)

SPEEDPROXY_MATCH_THRESHOLD = 0.9
RACE_CAPTION_RE = re.compile(r"race\s+No\.\s*(\d+)", re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")
MULTISPACE_RE = re.compile(r"\s+")


def normalize_scratched(value: str) -> str:
    normalized = (value or "").strip().lower()
    if normalized in {"true", "1", "scr", "scratched", "yes", "y"}:
        return "true"
    return "false"


def normalize_horse_name(name: str) -> str:
    text = name.lower()
    # Remove bracketed gear/suffix markers like (HT), (D/A), etc.
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\[[^\]]*\]", " ", text)
    # Remove trailing marker letters/symbols often attached after horse names.
    text = re.sub(r"\b[obdsht]+\b$", " ", text)
    text = re.sub(r"\b(?:ht|d\s*/\s*a)\b", " ", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = MULTISPACE_RE.sub(" ", text).strip()
    return text


def clean_html_text(value: str) -> str:
    value = html.unescape(value)
    value = TAG_RE.sub(" ", value)
    return MULTISPACE_RE.sub(" ", value).strip()


def parse_speedproxy_name_cell(value: str) -> tuple[str, str]:
    # Example: "4.pressiaire(2)" -> no=4, horse=pressiaire
    match = re.match(r"^\s*(\d+)\.(.+)$", value)
    if not match:
        return "", clean_html_text(value)
    no = match.group(1)
    horse = re.sub(r"\(\d+\)\s*$", "", match.group(2)).strip()
    return no, horse


def normalize_grade_label(raw: str) -> str:
    text = clean_html_text(raw).replace("-", " ").strip()
    if not text:
        return ""
    bm = re.search(r"\bBM\s*(\d+)\b", text, re.IGNORECASE)
    if bm:
        return f"BM{bm.group(1)}"
    bm = re.search(r"\bbenchmark\s*(\d+)\b", text, re.IGNORECASE)
    if bm:
        return f"BM{bm.group(1)}"
    if re.search(r"\bmaiden\b", text, re.IGNORECASE) or re.search(r"\bMDN\b", text):
        return "Maiden"
    cls = re.search(r"\bclass\s*(\d+)\b", text, re.IGNORECASE)
    if cls:
        return f"Class {cls.group(1)}"
    if re.search(r"\blisted\b", text, re.IGNORECASE):
        return "Listed"
    grp = re.search(r"\bgroup\s*(\d+)\b", text, re.IGNORECASE)
    if grp:
        return f"Group {grp.group(1)}"
    if re.search(r"\bhandicap\b", text, re.IGNORECASE):
        return "Handicap"
    return text


def parse_speedproxy_meeting_table(html_content: str) -> list[dict[str, str]]:
    """Rows from speedproxy summary table: track, track_condition, distance_rounded."""
    rows: list[dict[str, str]] = []
    for table in re.findall(r"(<table[\s\S]*?</table>)", html_content, flags=re.IGNORECASE):
        headers = [clean_html_text(x).lower() for x in re.findall(r"<th[^>]*>([\s\S]*?)</th>", table, flags=re.IGNORECASE)]
        if "track" not in headers or "track_condition" not in headers or "distance_rounded" not in headers:
            continue
        track_i = headers.index("track")
        going_i = headers.index("track_condition")
        dist_i = headers.index("distance_rounded")
        for row_block in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", table, flags=re.IGNORECASE):
            cells = [
                clean_html_text(c)
                for c in re.findall(r"<td[^>]*>([\s\S]*?)</td>", row_block, flags=re.IGNORECASE)
            ]
            if len(cells) <= max(track_i, going_i, dist_i):
                continue
            dist_raw = cells[dist_i].strip()
            if not dist_raw.isdigit():
                continue
            rows.append(
                {
                    "track": cells[track_i].strip(),
                    "going": cells[going_i].strip(),
                    "distance": f"{dist_raw}m",
                }
            )
        if rows:
            break
    return rows


def parse_speedproxy_race_meta(html_path: Path) -> dict[str, dict[str, str]]:
    content = html_path.read_text(encoding="utf-8", errors="replace")
    meeting_rows = parse_speedproxy_meeting_table(content)
    meta_by_race: dict[str, dict[str, str]] = {}

    for table in re.findall(r"(<table[\s\S]*?</table>)", content, flags=re.IGNORECASE):
        caption_match = re.search(r"<caption>([\s\S]*?)</caption>", table, flags=re.IGNORECASE)
        if not caption_match:
            continue
        caption = clean_html_text(caption_match.group(1))
        race_match = RACE_CAPTION_META_RE.search(caption)
        if not race_match:
            continue
        race_no = race_match.group(1)
        dist_m = race_match.group(2)
        distance = f"{dist_m}m"
        grade = normalize_grade_label(race_match.group(3))
        meeting_row = next(
            (row for row in meeting_rows if row.get("distance", "").replace("m", "") == dist_m),
            {},
        )
        track = meeting_row.get("track", "")
        going = meeting_row.get("going", "")
        if race_no not in meta_by_race:
            meta_by_race[race_no] = {
                "track": track,
                "going": going,
                "distance": distance,
                "grade": grade,
            }
        else:
            entry = meta_by_race[race_no]
            if not entry.get("track") and track:
                entry["track"] = track
            if not entry.get("going") and going:
                entry["going"] = going
            if not entry.get("grade") and grade:
                entry["grade"] = grade
    return meta_by_race


def start_time_from_race_name(race_name: str) -> str:
    match = START_TIME_IN_NAME_RE.search(race_name or "")
    return match.group(1).strip() if match else ""


def parse_speedproxy_html(html_path: Path) -> list[dict[str, str]]:
    content = html_path.read_text(encoding="utf-8", errors="replace")
    table_blocks = re.findall(r"(<table[\s\S]*?</table>)", content, flags=re.IGNORECASE)
    rows: list[dict[str, str]] = []
    for table in table_blocks:
        caption_match = re.search(r"<caption>([\s\S]*?)</caption>", table, flags=re.IGNORECASE)
        if not caption_match:
            continue
        caption_text = clean_html_text(caption_match.group(1))
        race_match = RACE_CAPTION_RE.search(caption_text)
        if not race_match:
            continue
        race_no = race_match.group(1)

        headers = [clean_html_text(x).lower() for x in re.findall(r"<th[^>]*>([\s\S]*?)</th>", table, flags=re.IGNORECASE)]
        if "name" not in headers or "w_ir" not in headers:
            continue
        name_idx = headers.index("name")
        w_ir_idx = headers.index("w_ir")

        row_blocks = re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", table, flags=re.IGNORECASE)
        for row_block in row_blocks:
            cells = [clean_html_text(c) for c in re.findall(r"<td[^>]*>([\s\S]*?)</td>", row_block, flags=re.IGNORECASE)]
            if not cells or len(cells) <= max(name_idx, w_ir_idx):
                continue
            no, horse = parse_speedproxy_name_cell(cells[name_idx])
            w_ir = cells[w_ir_idx]
            if not horse:
                continue
            payload = {"race_no": race_no, "no": no, "horse": horse, "w_ir": w_ir}
            for idx, header in enumerate(headers):
                if idx < len(cells):
                    payload[header] = cells[idx]
            rows.append(payload)
    return rows


def load_racenet_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def merge_rows(
    racenet_rows: list[dict[str, str]],
    speedproxy_rows: list[dict[str, str]],
    race_meta_by_no: dict[str, dict[str, str]] | None = None,
) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]], dict[str, int]]:
    race_meta_by_no = race_meta_by_no or {}
    speedproxy_by_race: dict[str, list[dict[str, str]]] = {}
    for row in speedproxy_rows:
        speedproxy_by_race.setdefault(row.get("race_no", ""), []).append(row)

    consumed: set[tuple[str, int]] = set()
    merged: list[dict[str, str]] = []
    missing_wir_debug: list[dict[str, str]] = []
    matched = 0
    missing = 0

    for row in racenet_rows:
        race_no = row.get("race_no", "")
        horse = row.get("horse", "")
        normalized = normalize_horse_name(horse)
        candidates = speedproxy_by_race.get(race_no, [])

        exact_index = -1
        for idx, candidate in enumerate(candidates):
            if (race_no, idx) in consumed:
                continue
            candidate_normalized = normalize_horse_name(candidate.get("horse", ""))
            if candidate_normalized == normalized:
                exact_index = idx
                break

        selected_idx = exact_index
        if selected_idx < 0 and candidates:
            best_ratio = 0.0
            best_idx = -1
            for idx, candidate in enumerate(candidates):
                if (race_no, idx) in consumed:
                    continue
                candidate_normalized = normalize_horse_name(candidate.get("horse", ""))
                ratio = difflib.SequenceMatcher(
                    None,
                    normalized,
                    candidate_normalized,
                ).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_idx = idx
            if best_ratio >= SPEEDPROXY_MATCH_THRESHOLD:
                selected_idx = best_idx

        if selected_idx >= 0:
            consumed.add((race_no, selected_idx))
            w_ir = candidates[selected_idx].get("w_ir", "").strip()
            merged_status = "matched" if w_ir else "missing_w_ir"
            if w_ir:
                matched += 1
            else:
                missing += 1
                missing_wir_debug.append(
                    {
                        "race_no": race_no,
                        "racenet_horse": horse,
                        "racenet_horse_normalized": normalized,
                        "reason": "matched_runner_missing_w_ir",
                    }
                )
        else:
            w_ir = ""
            merged_status = "missing_w_ir"
            missing += 1
            missing_wir_debug.append(
                {
                    "race_no": race_no,
                    "racenet_horse": horse,
                    "racenet_horse_normalized": normalized,
                    "reason": "no_speedproxy_match",
                }
            )

        race_meta = race_meta_by_no.get(race_no, {})
        race_name = row.get("race_name", "")
        distance = row.get("distance", "") or race_meta.get("distance", "")
        start_time = row.get("start_time", "") or start_time_from_race_name(race_name)
        track = race_meta.get("track", "") or row.get("track", "")
        grade = race_meta.get("grade", "") or row.get("grade", "")
        going = race_meta.get("going", "") or row.get("going", "")
        rail = row.get("rail", "")
        merged.append(
            {
                "race_no": race_no,
                "race_name": race_name,
                "start_time": start_time,
                "distance": distance,
                "track": track,
                "grade": grade,
                "going": going,
                "rail": rail,
                "no": row.get("no", ""),
                "horse": horse,
                "barrier": row.get("barrier", ""),
                "w_ir": w_ir,
                "trainer": row.get("trainer", ""),
                "jockey": row.get("jockey", ""),
                "weight": row.get("weight", ""),
                "odds": row.get("odds", ""),
                "scratched": normalize_scratched(row.get("scratched", "")),
                "merge_status": merged_status,
            }
        )

    unmatched_speedproxy: list[dict[str, str]] = []
    for race_no, candidates in speedproxy_by_race.items():
        for idx, candidate in enumerate(candidates):
            if (race_no, idx) not in consumed:
                unmatched_speedproxy.append(candidate)

    stats = {
        "total_runners": len(merged),
        "matched_runners": matched,
        "missing_w_ir": missing,
        "unmatched_speedproxy": len(unmatched_speedproxy),
    }
    return merged, missing_wir_debug, unmatched_speedproxy, stats


def merged_rows_to_master_csv(merged_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """Speed Map master CSV: race metadata columns repeated on every runner row."""
    master_rows: list[dict[str, str]] = []
    for row in merged_rows:
        race_no = row.get("race_no", "").strip()
        horse = row.get("horse", "").strip()
        runner_no = row.get("no", "").strip()
        master_rows.append(
            {
                "race_id": f"R{race_no}" if race_no else "",
                "track": row.get("track", ""),
                "race_no": race_no,
                "race_title": row.get("race_name", ""),
                "distance": row.get("distance", ""),
                "grade": row.get("grade", ""),
                "going": row.get("going", ""),
                "rail": row.get("rail", ""),
                "runner_no": runner_no,
                "no": runner_no,
                "horse": horse,
                "horse_name": horse,
                "name": horse,
                "barrier": row.get("barrier", ""),
                "trainer": row.get("trainer", ""),
                "jockey": row.get("jockey", ""),
                "odds": row.get("odds", ""),
                "w_ir": row.get("w_ir", ""),
            }
        )
    return master_rows


def write_csv(path: Path, rows: list[dict[str, str]], headers: list[str]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)
    return path
