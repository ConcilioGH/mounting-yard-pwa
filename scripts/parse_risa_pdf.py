#!/usr/bin/env python3
"""Extract Racing NSW / Racing Australia acceptances (RISA) PDF into structured CSV."""

from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import datetime
from pathlib import Path

import pdfplumber

PDF_HEADERS = [
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
    "horse_name",
    "name",
    "barrier",
    "trainer",
    "jockey",
    "weight",
    "probable_weight",
    "hcp_rating",
    "odds",
    "scratched",
    "emergency",
    "source",
]

RACE_HEADER_RE = re.compile(
    r"Race\s+(?P<race_no>\d+)\s+-\s+(?P<start_time>\d{1,2}:\d{2}[AP]M)\s+(?P<race_name>.+?)\s*\((?P<distance>\d+)\s*METRES\)",
    re.IGNORECASE,
)
MEETING_HEADER_RE = re.compile(
    r"^(?P<track>.+?):\s*.+?\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+"
    r"(?P<day>\d{1,2})\s+(?P<month>[A-Za-z]+)\s+(?P<year>\d{4})",
    re.IGNORECASE | re.MULTILINE,
)
GOING_RE = re.compile(r"Track Condition:\s*([^\n]+)", re.IGNORECASE)
RAIL_RE = re.compile(r"Rail Position:\s*([^F\n]+?)(?:\s+FinalFields|\s+Track Type:|\n|$)", re.IGNORECASE)
SCRATCHING_RE = re.compile(r"Scratching\s*\(([^)]+)\)", re.IGNORECASE)
MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


def clean_text(value: str) -> str:
    return " ".join(str(value or "").replace("\n", " ").strip().split())


def detect_risa_pdf_text(text: str) -> bool:
    upper = text.upper()
    if "ACCEPTANCES" not in upper:
        return False
    if "RACING NSW" in upper or "RACING AUSTRALIA" in upper:
        return True
    if "NSW RACES" in upper:
        return True
    return bool(RACE_HEADER_RE.search(text))


def detect_risa_pdf(pdf_path: Path) -> bool:
    with pdfplumber.open(pdf_path) as pdf:
        text = "\n".join((page.extract_text() or "") for page in pdf.pages[:2])
    return detect_risa_pdf_text(text)


def grade_from_race_title(race_name: str) -> str:
    title = race_name.strip()
    if not title:
        return ""
    bm = re.search(r"\bBM\s*(\d+)\b", title, re.IGNORECASE)
    if bm:
        return f"BM{bm.group(1)}"
    bm = re.search(r"\bbenchmark\s*(\d+)\b", title, re.IGNORECASE)
    if bm:
        return f"BM{bm.group(1)}"
    if re.search(r"\bmaiden\b", title, re.IGNORECASE):
        return "Maiden"
    cls = re.search(r"\bclass\s*(\d+)\b", title, re.IGNORECASE)
    if cls:
        return f"Class {cls.group(1)}"
    if re.search(r"\blisted\b", title, re.IGNORECASE):
        return "Listed"
    grp = re.search(r"\bgroup\s*(\d+)\b", title, re.IGNORECASE)
    if grp:
        return f"Group {grp.group(1)}"
    if re.search(r"\bhandicap\b", title, re.IGNORECASE):
        return "Handicap"
    return ""


def parse_meeting_date(text: str) -> str:
    match = MEETING_HEADER_RE.search(text)
    if not match:
        return ""
    month_name = match.group("month").lower()
    month = MONTHS.get(month_name)
    if not month:
        return ""
    day = int(match.group("day"))
    year = int(match.group("year"))
    return f"{year:04d}-{month:02d}-{day:02d}"


def extract_meeting_metadata(pdf_path: Path) -> dict[str, str]:
    with pdfplumber.open(pdf_path) as pdf:
        text = "\n".join((page.extract_text() or "") for page in pdf.pages[:3])
    track = ""
    track_match = MEETING_HEADER_RE.search(text)
    if track_match:
        track = clean_text(track_match.group("track"))
    going = ""
    going_match = GOING_RE.search(text)
    if going_match:
        going = clean_text(going_match.group(1))
    rail = ""
    rail_match = RAIL_RE.search(text)
    if rail_match:
        rail = clean_text(rail_match.group(1))
    return {
        "track": track,
        "going": going,
        "rail": rail,
        "meeting_date": parse_meeting_date(text),
    }


def normalize_horse_name(name: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", name.upper())


def scratched_horses_for_race(race_comment_text: str) -> set[str]:
    horses: set[str] = set()
    for match in SCRATCHING_RE.finditer(race_comment_text or ""):
        horses.add(normalize_horse_name(match.group(1)))
    return horses


def is_runner_table(header_row: list[str | None]) -> bool:
    joined = " ".join(clean_text(cell).lower() for cell in header_row if cell)
    return "horse" in joined and "trainer" in joined and "jockey" in joined


def is_runner_continuation_table(table: list[list[str | None]]) -> bool:
    if not table:
        return False
    first_row = table[0]
    if not first_row or not first_row[0]:
        return False
    if is_runner_table(first_row):
        return False
    first_cell = clean_text(first_row[0])
    return bool(re.match(r"^\d+e?$", first_cell, re.IGNORECASE))


def parse_runner_number(raw_no: str) -> tuple[str, bool]:
    text = clean_text(raw_no).lower()
    emergency = text.endswith("e")
    digits = re.sub(r"\D", "", text)
    return digits, emergency


def parse_runner_row(
    cells: list[str],
    *,
    forced_no: str = "",
    forced_emergency: bool = False,
) -> dict[str, str] | None:
    if not cells or not any(cells):
        return None
    runner_no, emergency = parse_runner_number(cells[0])
    if forced_no:
        runner_no = forced_no
    if forced_emergency:
        emergency = True
    horse = cells[2] if len(cells) > 2 else ""
    if not runner_no and not horse:
        return None
    if not horse:
        return None
    if not runner_no:
        return None
    trainer = cells[3] if len(cells) > 3 else ""
    jockey = cells[4] if len(cells) > 4 else ""
    barrier = cells[5] if len(cells) > 5 else ""
    weight = cells[6] if len(cells) > 6 else ""
    probable_weight = cells[7] if len(cells) > 7 else ""
    hcp_rating = cells[9] if len(cells) > 9 else ""
    return {
        "no": runner_no,
        "horse": horse,
        "trainer": trainer,
        "jockey": jockey,
        "barrier": barrier,
        "weight": weight,
        "probable_weight": probable_weight,
        "hcp_rating": hcp_rating,
        "emergency": emergency,
    }


def parse_runner_table_rows(table: list[list[str | None]]) -> list[dict[str, str | bool]]:
    if not table:
        return []
    has_header = is_runner_table(table[0])
    start_index = 1 if has_header else 0
    parsed: list[dict[str, str | bool]] = []
    pending_emergency_no = ""

    for raw_row in table[start_index:]:
        cells = [clean_text(cell) for cell in raw_row]
        if not any(cells):
            continue
        if has_header and cells[0].lower() == "no":
            continue

        runner_no, emergency = parse_runner_number(cells[0])
        horse = cells[2] if len(cells) > 2 else ""

        if runner_no and emergency and not horse:
            pending_emergency_no = runner_no
            continue

        forced_no = ""
        forced_emergency = False
        if not runner_no and horse and pending_emergency_no:
            forced_no = pending_emergency_no
            forced_emergency = True
            pending_emergency_no = ""

        row = parse_runner_row(
            cells,
            forced_no=forced_no,
            forced_emergency=forced_emergency,
        )
        if not row:
            continue
        parsed.append(row)

    return parsed


def extract_risa_rows(pdf_path: Path) -> list[dict[str, str]]:
    meeting = extract_meeting_metadata(pdf_path)
    rows: list[dict[str, str]] = []
    current_race_no = ""
    current_race_name = ""
    current_start_time = ""
    current_distance = ""
    current_scratched: set[str] = set()

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            for table in tables:
                if not table:
                    continue
                first_cell = clean_text(table[0][0] if table[0] else "")
                race_match = RACE_HEADER_RE.search(first_cell)
                if race_match:
                    current_race_no = race_match.group("race_no")
                    current_start_time = clean_text(race_match.group("start_time"))
                    title_part = clean_text(race_match.group("race_name"))
                    current_race_name = f"{current_start_time} {title_part}".strip()
                    current_distance = f"{race_match.group('distance')}m"
                    race_comment = ""
                    if len(table) > 1 and table[1]:
                        race_comment = clean_text(" ".join(str(cell or "") for cell in table[1]))
                    current_scratched = scratched_horses_for_race(race_comment)
                    continue

                if is_runner_table(table[0]) or is_runner_continuation_table(table):
                    if not current_race_no:
                        continue
                    for runner in parse_runner_table_rows(table):
                        scratched = normalize_horse_name(str(runner["horse"])) in current_scratched
                        rows.append(
                            {
                                "race_no": current_race_no,
                                "race_name": current_race_name,
                                "start_time": current_start_time,
                                "distance": current_distance,
                                "track": meeting.get("track", ""),
                                "grade": grade_from_race_title(current_race_name),
                                "going": meeting.get("going", ""),
                                "rail": meeting.get("rail", ""),
                                "no": str(runner["no"]),
                                "horse": str(runner["horse"]),
                                "horse_name": str(runner["horse"]),
                                "name": str(runner["horse"]),
                                "barrier": str(runner["barrier"]),
                                "trainer": str(runner["trainer"]),
                                "jockey": str(runner["jockey"]),
                                "weight": str(runner["weight"]),
                                "probable_weight": str(runner["probable_weight"]),
                                "hcp_rating": str(runner["hcp_rating"]),
                                "odds": "",
                                "scratched": "true" if scratched else "false",
                                "emergency": "true" if runner["emergency"] else "false",
                                "source": "risa",
                            }
                        )
                    continue

    if not rows:
        raise ValueError("No runner rows found in RISA PDF.")
    return rows


def write_risa_csv(rows: list[dict[str, str]], output_csv: Path) -> Path:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=PDF_HEADERS)
        writer.writeheader()
        writer.writerows(rows)
    return output_csv


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract structured RISA acceptances rows from PDF.")
    parser.add_argument("pdf", help="RISA PDF path.")
    parser.add_argument("-o", "--output", help="Optional output CSV path.")
    args = parser.parse_args()

    input_pdf = Path(args.pdf)
    if not input_pdf.is_absolute():
        input_pdf = Path.cwd() / input_pdf
    if not input_pdf.exists():
        print(f"Error: PDF not found: {input_pdf}", file=sys.stderr)
        return 1

    if not detect_risa_pdf(input_pdf):
        print("Error: PDF does not look like a RISA acceptances document.", file=sys.stderr)
        return 1

    output_csv = Path(args.output) if args.output else Path.cwd() / "exports" / f"{input_pdf.stem}.risa.csv"
    if not output_csv.is_absolute():
        output_csv = Path.cwd() / output_csv

    try:
        rows = extract_risa_rows(input_pdf)
        written = write_risa_csv(rows, output_csv)
    except Exception as exc:  # noqa: BLE001
        print(f"Conversion failed: {exc}", file=sys.stderr)
        return 1

    print(f"CSV written: {written}")
    print(f"Runners extracted: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
