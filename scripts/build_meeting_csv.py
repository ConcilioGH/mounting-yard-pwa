#!/usr/bin/env python3
"""Build merged meeting CSV from Racenet PDF + speedproxy HTML."""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

import pdfplumber

from merge_speedproxy import (
    MERGED_HEADERS,
    MASTER_CSV_HEADERS,
    load_racenet_csv,
    merge_rows,
    merged_rows_to_master_csv,
    parse_speedproxy_html,
    parse_speedproxy_race_meta,
    write_csv,
)
from pdf_to_csv import extract_racenet_rows, write_racenet_csv


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def infer_meeting_name(pdf_path: Path) -> str:
    stem = pdf_path.stem
    prefix = stem.split(" - ")[0] if " - " in stem else stem
    prefix = re.sub(r"(?i)^racenet\s*", "", prefix)
    prefix = prefix.replace("(", " ").replace(")", " ")
    return slugify(prefix) or "meeting"


def infer_meeting_date_from_pdf(pdf_path: Path) -> str:
    with pdfplumber.open(pdf_path) as pdf:
        first_page = pdf.pages[0].extract_text() or ""
    # Example: "Wyong - Thursday, 7 May 2026"
    match = re.search(r"\b(\d{1,2}\s+[A-Za-z]+\s+20\d{2})\b", first_page)
    if not match:
        return "unknown-date"
    parsed = datetime.strptime(match.group(1), "%d %B %Y")
    return parsed.strftime("%Y-%m-%d")


def infer_meeting_date(html_path: Path, pdf_path: Path) -> str:
    match = re.search(r"(20\d{2})[-_](\d{2})[-_](\d{2})", html_path.stem)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
    return infer_meeting_date_from_pdf(pdf_path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Merge Racenet PDF and speedproxy HTML into meeting CSV.")
    parser.add_argument("racenet_pdf", help="Racenet PDF path")
    parser.add_argument("speedproxy_html", help="speedproxy HTML path")
    parser.add_argument("--output", help="Optional merged output CSV path")
    parser.add_argument("--master-output", help="Optional Speed Map master CSV path (race metadata columns per runner)")
    parser.add_argument("--racenet-output", help="Optional intermediate Racenet CSV output path")
    args = parser.parse_args()

    pdf_path = Path(args.racenet_pdf)
    html_path = Path(args.speedproxy_html)
    if not pdf_path.is_absolute():
        pdf_path = Path.cwd() / pdf_path
    if not html_path.is_absolute():
        html_path = Path.cwd() / html_path
    if not pdf_path.exists():
        print(f"Error: PDF not found: {pdf_path}", file=sys.stderr)
        return 1
    if not html_path.exists():
        print(f"Error: HTML not found: {html_path}", file=sys.stderr)
        return 1

    exports_dir = Path.cwd() / "exports"
    meeting_name = infer_meeting_name(pdf_path)
    meeting_date = infer_meeting_date(html_path, pdf_path)
    merged_output = Path(args.output) if args.output else exports_dir / f"{meeting_name}_{meeting_date}_speed_map.csv"
    if not merged_output.is_absolute():
        merged_output = Path.cwd() / merged_output

    racenet_output = Path(args.racenet_output) if args.racenet_output else exports_dir / f"{pdf_path.stem}.racenet.csv"
    if not racenet_output.is_absolute():
        racenet_output = Path.cwd() / racenet_output

    try:
        racenet_rows = extract_racenet_rows(pdf_path)
        write_racenet_csv(racenet_rows, racenet_output)
        speedproxy_rows = parse_speedproxy_html(html_path)
        race_meta_by_no = parse_speedproxy_race_meta(html_path)
        merged_rows, missing_wir_rows, unmatched_rows, stats = merge_rows(
            racenet_rows,
            speedproxy_rows,
            race_meta_by_no,
        )
        write_csv(merged_output, merged_rows, MERGED_HEADERS)
        master_output = Path(args.master_output) if args.master_output else None
        if master_output:
            if not master_output.is_absolute():
                master_output = Path.cwd() / master_output
            write_csv(master_output, merged_rows_to_master_csv(merged_rows), MASTER_CSV_HEADERS)
        missing_wir_output = exports_dir / "missing_wir_debug.csv"
        missing_wir_headers = sorted({k for row in missing_wir_rows for k in row.keys()}) or [
            "race_no",
            "racenet_horse",
            "racenet_horse_normalized",
            "reason",
        ]
        write_csv(missing_wir_output, missing_wir_rows, missing_wir_headers)
        unmatched_headers = sorted({k for row in unmatched_rows for k in row.keys()}) or ["race_no", "no", "horse", "w_ir"]
        unmatched_output = exports_dir / "unmatched_speedproxy.csv"
        write_csv(unmatched_output, unmatched_rows, unmatched_headers)
    except Exception as exc:  # noqa: BLE001
        print(f"Build failed: {exc}", file=sys.stderr)
        return 1

    print(f"Merged CSV: {merged_output}")
    if args.master_output:
        print(f"Master CSV: {master_output}")
    print(f"Racenet CSV: {racenet_output}")
    print(f"Missing w_ir debug CSV: {missing_wir_output}")
    print(f"Unmatched speedproxy CSV: {unmatched_output}")
    print("")
    print("Summary")
    print(f"total runners: {stats['total_runners']}")
    print(f"matched runners: {stats['matched_runners']}")
    print(f"missing w_ir: {stats['missing_w_ir']}")
    print(f"unmatched speedproxy runners: {stats['unmatched_speedproxy']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
