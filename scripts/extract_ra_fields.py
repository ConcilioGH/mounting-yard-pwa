import argparse
import csv
import html
import re
from pathlib import Path


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def text(value):
    return clean(html.unescape(re.sub(r"<[^>]+>", " ", value or "")))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("html", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--track", required=True)
    args = parser.parse_args()

    source = args.html.read_text(encoding="utf-8", errors="replace")
    page_text = text(source)
    going_match = re.search(r"Track Condition:\s*([^,]+?)(?:\s+Weather:|\s+Rail Position:)", page_text, re.I)
    rail_match = re.search(r"Rail Position:\s*([^,]+?)(?:\s+Track Condition:|\s+Weather:)", page_text, re.I)
    going = clean(going_match.group(1)) if going_match else ""
    rail = clean(rail_match.group(1)) if rail_match else ""

    rows = []
    races = re.findall(
        r'<table[^>]+class="race-title"[^>]*>(.*?)</table>.*?'
        r'<table[^>]+class="race-strip-fields"[^>]*>(.*?)</table>',
        source, re.I | re.S,
    )
    for title, fields in races:
        heading = text(title)
        match = re.search(r"Race\s+(\d+)\s+-\s+([0-9:]+(?:AM|PM))\s+(.+?)\s+\((\d+)\s+METRES\)", heading, re.I)
        if not match:
            continue
        field_rows = re.findall(
            r"<tr\s+class=['\"]([^'\"]*(?:OddRow|EvenRow)[^'\"]*)['\"][^>]*>(.*?)</tr>",
            fields,
            re.I | re.S,
        )
        for row_class, tr in field_rows:
            def cell(cls):
                found = re.search(rf"<td[^>]+class=['\"]{cls}['\"][^>]*>(.*?)</td>", tr, re.I | re.S)
                return text(found.group(1)) if found else ""
            no, horse = cell("no"), cell("horse")
            if not no or not horse:
                continue
            rows.append({
                "race_no": match.group(1), "race_name": clean(match.group(3)),
                "start_time": match.group(2), "distance": match.group(4),
                "track": args.track, "grade": "", "going": going, "rail": rail,
                "no": no, "horse": horse, "horse_name": horse, "name": horse,
                "barrier": cell("barrier"), "trainer": cell("trainer"),
                "jockey": cell("jockey"), "weight": cell("weight"),
                "odds": "", "scratched": "true" if "scratched" in row_class.lower() else "false",
            })

    if not rows:
        raise SystemExit("No field rows found")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} runners across {len(set(r['race_no'] for r in rows))} races to {args.output}")


if __name__ == "__main__":
    main()
