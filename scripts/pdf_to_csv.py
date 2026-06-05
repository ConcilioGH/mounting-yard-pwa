#!/usr/bin/env python3
"""Extract Racenet meeting runners from PDF into structured CSV."""

from __future__ import annotations

import argparse
import csv
import re
import sys
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
    "odds",
    "scratched",
]

RACE_RE = re.compile(
    r"Race\s+(?P<race_no>\d+)\s+-\s+(?:(?P<start_time>\d{1,2}:\d{2}\s*(?:am|pm))\s+)?(?P<race_name>.+?)\((?P<distance>\d+m)\)",
    re.IGNORECASE,
)
MEETING_TRACK_RE = re.compile(
    r"^([A-Za-z][A-Za-z\s'-]+?)\s*-\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)",
    re.IGNORECASE | re.MULTILINE,
)
GOING_RE = re.compile(r"Track Condition:\s*(.+?)(?:\s+Weather:|\s+Penetrometer:|$)", re.IGNORECASE)
RAIL_RE = re.compile(r"Rail Position:\s*(.+?),\s*Track Condition:", re.IGNORECASE | re.DOTALL)
# Optional "e" suffix marks emergency acceptors (e.g. 13e.); store saddlecloth as digits only.
RUNNER_RE = re.compile(
    r"^\s*(?P<no>\d+)[eE]?\.\s+(?P<body>.+?)\s+(?P<weight>\d+(?:\.\d+)?kg)\s+(?P<career>\d+:\d+-\d+-\d+)\s+(?P<rtg>\S+)\s+(?P<odds>\S+)\s*$",
    re.IGNORECASE,
)

# Trailing gear / status legend tokens (Racenet PDF), e.g. "Bold Alliance o(HT)" -> "Bold Alliance".
# Includes "c" for concatenated codes (tcdsh, tcds) common in Racenet; parentheticals stripped first.
_LEGEND_SUFFIX_CHARS = frozenset("tdhbosc")
_PAREN_TAIL_RE = re.compile(r"\s*\([^)]*\)\s*$")


def clean_racenet_horse_name(horse: str) -> str:
    """Strip trailing Racenet parenthetical codes and legend letter suffixes from horse names."""
    s = horse.strip()
    if not s:
        return s
    while True:
        new_s = _PAREN_TAIL_RE.sub("", s).strip()
        if new_s == s:
            break
        s = new_s
    changed = True
    while changed:
        changed = False
        parts = s.rsplit(None, 1)
        if len(parts) != 2:
            break
        left, right = parts[0].strip(), parts[1]
        if not right.isalpha() or not all(c.lower() in _LEGEND_SUFFIX_CHARS for c in right):
            break
        # Avoid stripping real two-word names ending in "Ho" (e.g. "Mac Ho").
        if len(right) == 2 and right.lower() == "ho":
            break
        s = left
        changed = True
    return s.strip()


def clean_text(value: str) -> str:
    return " ".join(value.replace("\n", " ").strip().split())


def split_trainer_jockey(segment: str) -> tuple[str, str]:
    tokens = segment.split()
    if not tokens:
        return "", ""
    jockey_len = 2
    if len(tokens) >= 3 and tokens[-1].startswith("("):
        jockey_len = 3
    jockey = " ".join(tokens[-jockey_len:])
    trainer = " ".join(tokens[:-jockey_len]).strip()
    return trainer, jockey


def parse_runner_body(body: str) -> tuple[str, str, str, str]:
    tokens = body.split()
    if not tokens:
        return "", "", "", ""
    if re.search(r"\d", tokens[0]) or "x" in tokens[0].lower():
        tokens = tokens[1:]

    barrier_index = -1
    for i in range(len(tokens) - 1, -1, -1):
        if tokens[i].isdigit():
            barrier_index = i
            break

    if barrier_index < 0:
        return " ".join(tokens), "", "", ""

    horse = " ".join(tokens[:barrier_index]).strip()
    barrier = tokens[barrier_index]
    trainer_jockey = " ".join(tokens[barrier_index + 1 :]).strip()
    trainer, jockey = split_trainer_jockey(trainer_jockey)
    return horse, barrier, trainer, jockey


def extract_meeting_metadata(pdf_path: Path) -> dict[str, str]:
    with pdfplumber.open(pdf_path) as pdf:
        text = "\n".join((page.extract_text() or "") for page in pdf.pages[:4])
    track = ""
    track_match = MEETING_TRACK_RE.search(text)
    if track_match:
        track = clean_text(track_match.group(1))
    going = ""
    going_match = GOING_RE.search(text)
    if going_match:
        going = clean_text(going_match.group(1))
    rail = ""
    rail_match = RAIL_RE.search(text)
    if rail_match:
        rail = clean_text(rail_match.group(1))
    return {"track": track, "going": going, "rail": rail}


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
    if re.search(r"\bmaiden\b", title, re.IGNORECASE) or re.search(r"\bMDN\b", title):
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


def extract_racenet_rows(pdf_path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    current_race_no = ""
    current_race_name = ""
    current_start_time = ""
    current_distance = ""
    meeting = extract_meeting_metadata(pdf_path)

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for raw_line in text.splitlines():
                line = clean_text(raw_line)
                if not line:
                    continue
                race_match = RACE_RE.search(line)
                if race_match:
                    current_race_no = race_match.group("race_no")
                    start_raw = race_match.group("start_time") or ""
                    title_part = clean_text(race_match.group("race_name"))
                    current_start_time = clean_text(start_raw)
                    current_race_name = (
                        f"{current_start_time} {title_part}".strip() if current_start_time else title_part
                    )
                    current_distance = race_match.group("distance")
                    continue
                runner_match = RUNNER_RE.match(line)
                if not runner_match:
                    continue
                if not current_race_no:
                    continue
                data = runner_match.groupdict()
                horse, barrier, trainer, jockey = parse_runner_body(data["body"])
                horse_clean = clean_racenet_horse_name(horse)
                odds = data["odds"]
                scratched = "true" if odds.upper() == "SCR" else "false"
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
                        "no": data["no"],
                        "horse": horse_clean,
                        "horse_name": horse_clean,
                        "name": horse_clean,
                        "barrier": barrier,
                        "trainer": trainer,
                        "jockey": jockey,
                        "weight": data["weight"],
                        "odds": odds,
                        "scratched": scratched,
                    }
                )
    if not rows:
        raise ValueError("No runner rows found in PDF.")
    return rows


def write_racenet_csv(rows: list[dict[str, str]], output_csv: Path) -> Path:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=PDF_HEADERS)
        writer.writeheader()
        writer.writerows(rows)
    return output_csv


def default_output_path(input_pdf: Path) -> Path:
    return Path.cwd() / "exports" / f"{input_pdf.stem}.racenet.csv"


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract structured Racenet rows from PDF.")
    parser.add_argument("pdf", help="Racenet PDF path.")
    parser.add_argument("-o", "--output", help="Optional output CSV path.")
    args = parser.parse_args()

    input_pdf = Path(args.pdf)
    if not input_pdf.is_absolute():
        input_pdf = Path.cwd() / input_pdf
    if not input_pdf.exists():
        print(f"Error: PDF not found: {input_pdf}", file=sys.stderr)
        return 1

    output_csv = Path(args.output) if args.output else default_output_path(input_pdf)
    if not output_csv.is_absolute():
        output_csv = Path.cwd() / output_csv

    try:
        rows = extract_racenet_rows(input_pdf)
        written = write_racenet_csv(rows, output_csv)
    except Exception as exc:  # noqa: BLE001
        print(f"Conversion failed: {exc}", file=sys.stderr)
        return 1

    print(f"CSV written: {written}")
    print(f"Runners extracted: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
