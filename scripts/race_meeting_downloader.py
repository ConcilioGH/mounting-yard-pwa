#!/usr/bin/env python3
"""Download the scheduled NSW race meeting inputs and run the local processors."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.parse
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = (
    Path(sys.executable).resolve().parents[2]
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parents[1]
)
DEFAULT_MEETINGS_ROOT = ROOT / "meetings"
DEFAULT_SPEED_ROOT = Path(r"C:\Users\gregh\Box\speed")
BOX_DRIVE_EXE = Path(r"C:\Program Files\Box\Box\Box.exe")
BOX_REFRESH_WAIT_SECONDS = 120
BOX_REFRESH_POLL_SECONDS = 10
METRO_TRACKS = {
    "randwick", "royal randwick", "rosehill", "rosehill gardens", "warwick farm",
    "canterbury", "canterbury park", "kensington",
}
PROVINCIAL_TRACKS = {
    "gosford", "hawkesbury", "illawarra grange", "kembla grange", "newcastle", "wyong",
}
RACING_AUSTRALIA_RACENET_SLUGS = {
    "randwick": "randwick",
    "royal randwick": "randwick",
    "rosehill gardens": "rosehill-gardens",
    "warwick farm": "warwick-farm",
    "canterbury": "canterbury",
    "canterbury park": "canterbury",
    "kensington": "kensington",
    "gosford": "gosford",
    "hawkesbury": "hawkesbury",
    "illawarra grange": "illawarra-grange",
    "kembla grange": "kembla-grange",
    "newcastle": "newcastle",
    "wyong": "wyong",
}
SPEEDPROXY_TRACK_ALIASES = {
    "rosehill gardens": "rosehill",
    "royal randwick": "randwick",
    "canterbury park": "canterbury",
    "kensington": "randwick kensington",
}
RACING_AUSTRALIA_TRACK_ALIASES = {
    "canterbury": "Canterbury Park",
    "canterbury park": "Canterbury Park",
    "randwick": "Royal Randwick",
    "royal randwick": "Royal Randwick",
    "rosehill": "Rosehill Gardens",
    "rosehill gardens": "Rosehill Gardens",
    "warwick farm": "Warwick Farm",
    "kensington": "Kensington",
    "illawarra grange": "Illawarra Grange",
    "kembla grange": "Kembla Grange",
    "newcastle": "Newcastle",
    "gosford": "Gosford",
    "hawkesbury": "Hawkesbury",
    "wyong": "Wyong",
    "bathurst": "Bathurst",
    "grafton": "Grafton",
    "goulburn": "Goulburn",
    "narromine": "Narromine",
    "nowra": "Nowra",
    "muswellbrook": "Muswellbrook",
    "scone": "Scone",
    "flemington": "Flemington",
}
RACING_AUSTRALIA_TRACK_STATES = {
    "flemington": "VIC",
}


class DownloadError(RuntimeError):
    pass


def normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", html.unescape(value).lower()).strip()


def slugify(value: str) -> str:
    return normalise(value).replace(" ", "-")


@dataclass(frozen=True)
class Meeting:
    meeting_date: date
    track: str
    slug: str


def expected_kind(meeting_date: date) -> str:
    weekday = meeting_date.weekday()
    if weekday in (2, 5):
        return "metro"
    if weekday == 3:
        return "provincial"
    raise DownloadError("Only Wednesday metro, Thursday provincial and Saturday metro meetings are configured")


def extract_meeting_slugs(page: str, meeting_date: date) -> list[str]:
    compact = meeting_date.strftime("%Y%m%d")
    patterns = [
        rf"meetingSlug[\\\"'=:%20]+([a-z0-9-]+-{compact})",
        rf"([a-z0-9-]+-{compact})(?:[\\\"'&/]|$)",
    ]
    found: list[str] = []
    for pattern in patterns:
        for match in re.findall(pattern, page, flags=re.I):
            candidate = html.unescape(match).lower()
            if candidate not in found:
                found.append(candidate)
    return found


def select_meeting(slugs: list[str], meeting_date: date) -> Meeting:
    kind = expected_kind(meeting_date)
    allowed = METRO_TRACKS if kind == "metro" else PROVINCIAL_TRACKS
    matches: list[Meeting] = []
    suffix = "-" + meeting_date.strftime("%Y%m%d")
    for slug in slugs:
        track_slug = slug.removesuffix(suffix)
        track = normalise(track_slug)
        if track in allowed:
            matches.append(Meeting(meeting_date, track, slug))
    if len(matches) != 1:
        raise DownloadError(
            f"Expected exactly one NSW {kind} meeting for {meeting_date}, found "
            f"{len(matches)} ({', '.join(m.slug for m in matches) or 'none'})"
        )
    return matches[0]


def fetch_text(url: str, attempts: int = 3) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 RaceMeetingDownloader/1.0"})
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read().decode("utf-8", errors="replace")
        except Exception as exc:
            last_error = exc
            logging.warning("Fetch attempt %d/%d failed: %s", attempt, attempts, exc)
            if attempt < attempts:
                time.sleep(attempt * 3)
    raise DownloadError(f"Could not fetch {url}: {last_error}")


def extract_racing_australia_slugs(page: str, meeting_date: date) -> list[str]:
    key_date = meeting_date.strftime("%Y%b%d")
    venues = re.findall(
        rf"Key={key_date}%2CNSW%2C([^\"'&]+)",
        page,
        flags=re.I,
    )
    slugs: list[str] = []
    compact_date = meeting_date.strftime("%Y%m%d")
    for encoded_venue in venues:
        venue = normalise(urllib.parse.unquote_plus(encoded_venue))
        if venue.endswith(" trial"):
            continue
        track_slug = RACING_AUSTRALIA_RACENET_SLUGS.get(venue)
        if track_slug:
            slug = f"{track_slug}-{compact_date}"
            if slug not in slugs:
                slugs.append(slug)
    return slugs


def discover_meeting(meeting_date: date) -> Meeting:
    url = f"https://www.racenet.com.au/form-guide/horse-racing/{meeting_date.isoformat()}"
    try:
        page = fetch_text(url)
        slugs = extract_meeting_slugs(page, meeting_date)
        logging.info("Discovered %d Racenet meeting slugs", len(slugs))
        return select_meeting(slugs, meeting_date)
    except DownloadError as racenet_error:
        logging.warning(
            "Racenet meeting discovery failed (%s); using Racing Australia NSW calendar",
            racenet_error,
        )
    calendar_url = "https://racingaustralia.horse/FreeFields/Calendar.aspx?State=NSW"
    calendar = fetch_text(calendar_url)
    slugs = extract_racing_australia_slugs(calendar, meeting_date)
    logging.info("Discovered %d Racing Australia NSW meeting slugs", len(slugs))
    return select_meeting(slugs, meeting_date)


def existing_meeting(meetings_root: Path, meeting_date: date) -> Meeting | None:
    folders = [path for path in meetings_root.glob(f"{meeting_date.isoformat()}-*") if path.is_dir()]
    if len(folders) != 1:
        return None
    manifest_path = folders[0] / "download-manifest.json"
    if not manifest_path.is_file():
        return None
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        slug = str(manifest["racenetSlug"])
        track = normalise(str(manifest["track"]))
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None
    suffix = "-" + meeting_date.strftime("%Y%m%d")
    if not track or not slug.endswith(suffix):
        return None
    return Meeting(meeting_date, track, slug)


def parse_official_scratchings(page: str) -> dict[str, object]:
    sections = [
        re.search(
            r"<h3>\s*Scratchings\s*</h3>(.*?)<h3>\s*Late Scratchings\s*</h3>",
            page,
            flags=re.I | re.S,
        ),
        re.search(
            r"<h3>\s*Late Scratchings\s*</h3>(.*?)<h3>\s*Late Riders/Alterations\s*</h3>",
            page,
            flags=re.I | re.S,
        ),
    ]
    if not sections[0]:
        raise DownloadError("Official Racing Australia scratchings section was not found")
    scratchings: list[dict[str, str]] = []
    for section_match in sections:
        if not section_match:
            continue
        current_race = ""
        for row_html in re.findall(r"<tr[^>]*>(.*?)</tr>", section_match.group(1), flags=re.I | re.S):
            race_match = re.search(r"Race\s+(\d+)\s*:", row_html, flags=re.I)
            if race_match:
                current_race = race_match.group(1)
            runner_match = re.search(r"<td[^>]*>\s*(\d+)[eE]?\s+(.+?)(?:<span|</td>)", row_html, flags=re.I | re.S)
            if not current_race or not runner_match:
                continue
            horse = normalise(re.sub(r"<[^>]+>", " ", runner_match.group(2))).title()
            scratchings.append({"raceNo": current_race, "runnerNo": runner_match.group(1), "horse": horse})
    declared_match = re.search(r"Total\s+Scratchings:\s*</td>\s*<td[^>]*>\s*(\d+)", page, flags=re.I | re.S)
    declared = int(declared_match.group(1)) if declared_match else None
    if declared is not None and declared != len(scratchings):
        raise DownloadError(
            f"Official scratchings count mismatch: page says {declared}, parsed {len(scratchings)}"
        )
    starters_match = re.search(
        r"Total Number of starters for this meeting \(including emergencies\)\s*(\d+)", page, flags=re.I
    )
    published_match = re.search(r"Scratchings Last Published:</b>\s*([^<]+)", page, flags=re.I)
    def official_value(label: str) -> str:
        match = re.search(rf"<b>{re.escape(label)}:</b>\s*([^<]+)", page, flags=re.I)
        return html.unescape(match.group(1)).strip() if match else ""

    late_riders: list[dict[str, str]] = []
    late_section = re.search(
        r"<h3>\s*Late Riders/Alterations\s*</h3>(.*?)<h3>\s*Undeclared Riders\s*</h3>",
        page,
        flags=re.I | re.S,
    )
    if late_section:
        current_race = ""
        for row_html in re.findall(r"<tr[^>]*>(.*?)</tr>", late_section.group(1), flags=re.I | re.S):
            race_match = re.search(r"Race\s+(\d+)\s*:", row_html, flags=re.I)
            if race_match:
                current_race = race_match.group(1)
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, flags=re.I | re.S)
            if not current_race or len(cells) < 2:
                continue
            value = html.unescape(re.sub(r"<[^>]+>", " ", cells[-1]))
            value = " ".join(value.split()).rstrip(" ,")
            rider_match = re.match(r"(\d+)[eE]?\s+(.+?)\s+-\s+(.+)$", value)
            if rider_match:
                late_riders.append({
                    "raceNo": current_race,
                    "runnerNo": rider_match.group(1),
                    "horse": rider_match.group(2).strip(),
                    "rider": rider_match.group(3).strip(),
                })
    return {
        "scratchings": scratchings,
        "totalScratchings": len(scratchings),
        "totalStarters": int(starters_match.group(1)) if starters_match else None,
        "publishedAt": html.unescape(published_match.group(1)).strip() if published_match else "",
        "rail": official_value("Rail Position"),
        "trackRating": official_value("Track Condition"),
        "weather": official_value("Weather"),
        "penetrometer": official_value("Penetrometer"),
        "trackInformation": official_value("Track Information"),
        "lateRiders": late_riders,
    }


def fetch_official_scratchings(meeting: Meeting) -> dict[str, object]:
    normalised_track = normalise(meeting.track)
    official_track = RACING_AUSTRALIA_TRACK_ALIASES.get(normalised_track)
    if not official_track:
        raise DownloadError(f"No Racing Australia track mapping configured for {meeting.track}")
    state = RACING_AUSTRALIA_TRACK_STATES.get(normalised_track, "NSW")
    key = f"{meeting.meeting_date:%Y%b%d},{state},{official_track}"
    url = "https://racingaustralia.horse/FreeFields/Scratchings.aspx?" + urllib.parse.urlencode({"Key": key})
    page = fetch_text(url)
    result = parse_official_scratchings(page)
    result.update({"sourceUrl": url, "track": official_track, "meetingDate": meeting.meeting_date.isoformat()})
    logging.info(
        "Official scratchings fetched: published=%s scratchings=%s starters=%s",
        result.get("publishedAt"), result.get("totalScratchings"), result.get("totalStarters"),
    )
    return result


def edge_path() -> Path:
    candidates = [
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("PROGRAMFILES", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Edge/Application/msedge.exe",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    resolved = shutil.which("msedge")
    if resolved:
        return Path(resolved)
    raise DownloadError("Microsoft Edge was not found")


def atomic_replace(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_name(destination.name + ".tmp")
    shutil.copy2(source, temp)
    os.replace(temp, destination)


def render_racenet_pdf(meeting: Meeting, destination: Path) -> None:
    destination = destination.resolve()
    url = (
        "https://www.racenet.com.au/form-guide/horse-racing/print"
        f"?meetingSlug={meeting.slug}&printSlug=print-fields"
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_pdf = destination.with_name("racenet.pdf.tmp.pdf")
    if temp_pdf.exists():
        temp_pdf.unlink()
    # Edge can keep cache journals open briefly after the print worker exits.
    # The PDF is the required artifact; a delayed cache cleanup must not abort
    # an otherwise successful meeting refresh.
    with tempfile.TemporaryDirectory(
        prefix="race-meeting-edge-", ignore_cleanup_errors=True
    ) as profile:
        command = [
            str(edge_path()), "--headless=new", "--disable-gpu", "--no-first-run",
            f"--user-data-dir={profile}",
            "--disable-blink-features=AutomationControlled",
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0",
            "--virtual-time-budget=15000", f"--print-to-pdf={temp_pdf}",
            "--print-to-pdf-no-header", url,
        ]
        logging.info("Rendering Racenet print form for %s", meeting.slug)
        completed = subprocess.run(command, capture_output=True, text=True, timeout=120)
        # Edge 151 can return from its launcher before the isolated print worker
        # finishes. Keep the temporary profile alive until the PDF appears.
        deadline = time.monotonic() + 30
        while completed.returncode == 0 and not temp_pdf.exists() and time.monotonic() < deadline:
            time.sleep(0.5)
    if completed.returncode != 0 or not temp_pdf.exists():
        raise DownloadError(f"Edge PDF render failed ({completed.returncode}): {completed.stderr.strip()}")
    validate_pdf(temp_pdf)
    os.replace(temp_pdf, destination)


def find_speedproxy(speed_root: Path, track: str) -> Path:
    if not speed_root.is_dir():
        raise DownloadError(f"Speedproxy source folder does not exist: {speed_root}")
    wanted = SPEEDPROXY_TRACK_ALIASES.get(normalise(track), normalise(track))
    candidates = []
    for path in speed_root.glob("speedproxy*.html"):
        candidate_track = normalise(re.sub(r"^speedproxy", "", path.stem, flags=re.I))
        if candidate_track == wanted:
            candidates.append(path)
    if not candidates:
        raise DownloadError(f"No speedproxy HTML found for {track} in {speed_root}")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def box_drive_running() -> bool:
    completed = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq Box.exe", "/NH"],
        capture_output=True,
        text=True,
    )
    return completed.returncode == 0 and "box.exe" in completed.stdout.lower()


def ensure_box_drive_running() -> None:
    if box_drive_running():
        logging.info("Box Drive is running; waiting for its current sync to complete")
        return
    if not BOX_DRIVE_EXE.is_file():
        raise DownloadError(f"Box Drive executable was not found: {BOX_DRIVE_EXE}")
    logging.warning("Box Drive is not running; starting it before rechecking Speedproxy")
    subprocess.Popen(
        [str(BOX_DRIVE_EXE)],
        cwd=BOX_DRIVE_EXE.parent,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def find_fresh_speedproxy(speed_root: Path, meeting: Meeting, phase: str) -> Path:
    initial_error: Exception | None = None
    try:
        source = find_speedproxy(speed_root, meeting.track)
        validate_speedproxy_freshness(source, meeting, phase)
        return source
    except (DownloadError, FileNotFoundError, OSError) as exc:
        initial_error = exc
        logging.warning("Speedproxy is unavailable or stale (%s); refreshing Box connection", exc)
    ensure_box_drive_running()
    deadline = time.monotonic() + BOX_REFRESH_WAIT_SECONDS
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        time.sleep(BOX_REFRESH_POLL_SECONDS)
        try:
            source = find_speedproxy(speed_root, meeting.track)
            validate_speedproxy_freshness(source, meeting, phase)
        except (DownloadError, FileNotFoundError, OSError) as exc:
            last_error = exc
            logging.info("Waiting for Box refresh: %s", exc)
            continue
        logging.info("Box refresh supplied a valid Speedproxy file: %s", source)
        return source
    raise DownloadError(
        f"Box refresh timed out after {BOX_REFRESH_WAIT_SECONDS} seconds: {last_error or initial_error}"
    )


def validate_speedproxy_freshness(path: Path, meeting: Meeting, phase: str) -> None:
    """Require current evening data; allow a recent ratings snapshot on race morning."""
    modified = datetime.fromtimestamp(path.stat().st_mtime).astimezone().date()
    evening_date = meeting.meeting_date - timedelta(days=1)
    oldest_morning_date = meeting.meeting_date - timedelta(days=3)
    valid = (
        oldest_morning_date <= modified <= meeting.meeting_date
        if phase == "morning"
        else modified == evening_date
    )
    if not valid:
        expected = (
            f"between {oldest_morning_date} and {meeting.meeting_date}"
            if phase == "morning"
            else str(evening_date)
        )
        raise DownloadError(
            f"Stale speedproxy source for {meeting.track}: {path} was modified {modified}, "
            f"expected {expected} for the {phase} run"
        )
    if phase == "morning" and modified != meeting.meeting_date:
        logging.warning(
            "Race-day Speedproxy is unavailable; using the validated recent snapshot from %s. "
            "Refreshed Racenet fields and official Racing Australia scratchings will determine "
            "active runners and barriers; Speedproxy supplies ratings only.",
            modified,
        )


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_pdf(path: Path) -> None:
    # Current Racenet print forms are multi-page and several MB. Its rendered
    # 404/error pages can exceed 200 KB, so keep the floor safely above those.
    if path.stat().st_size < 500_000 or path.read_bytes()[:5] != b"%PDF-":
        raise DownloadError(f"Invalid or unexpectedly small PDF: {path}")


def validate_html(path: Path, track: str) -> None:
    if path.stat().st_size < 10_000:
        raise DownloadError(f"Unexpectedly small speedproxy HTML: {path}")
    content = path.read_text(encoding="utf-8", errors="replace")
    expected_track = SPEEDPROXY_TRACK_ALIASES.get(normalise(track), normalise(track))
    if "<html" not in content.lower() or expected_track not in normalise(content):
        raise DownloadError(f"Speedproxy HTML does not appear to contain the {track} meeting")


def run_checked(command: list[str], cwd: Path) -> None:
    logging.info("Running: %s", subprocess.list2cmdline(command))
    completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if completed.stdout:
        logging.info(completed.stdout.rstrip())
    if completed.returncode:
        raise DownloadError(completed.stderr.strip() or f"Command failed with exit code {completed.returncode}")


def run_capture(command: list[str], cwd: Path, *, allowed_codes: tuple[int, ...] = (0,)) -> subprocess.CompletedProcess[str]:
    logging.info("Running: %s", subprocess.list2cmdline(command))
    completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if completed.stdout:
        logging.info(completed.stdout.rstrip())
    if completed.returncode not in allowed_codes:
        raise DownloadError(completed.stderr.strip() or f"Command failed with exit code {completed.returncode}")
    return completed


def run_processors(folder: Path) -> None:
    node = shutil.which("node")
    if not node:
        raise DownloadError("Node.js was not found on PATH")
    run_checked([node, str(ROOT / "scripts/create-master-csv.js"), str(folder)], ROOT)
    master_files = list(folder.glob("*_master.csv"))
    if len(master_files) != 1:
        raise DownloadError(f"Expected one generated meeting master CSV, found {len(master_files)}")
    # This output is a race-day snapshot. Rebuild it so runners scratched since
    # the previous refresh are removed instead of surviving a merge/update.
    for stale_name in ("master_racing_data.csv", "master_racing_data_provenance.csv"):
        stale_path = folder / stale_name
        if stale_path.exists():
            stale_path.unlink()
    snapshot = folder / ".rfp_snapshots/master_racing_data.last.csv"
    if snapshot.exists():
        snapshot.unlink()
    processor_exe = ROOT / "race-file-processor/dist/RaceFileProcessor.exe"
    if processor_exe.is_file():
        command = [
            str(processor_exe), "--process-batch", str(master_files[0]),
            "--output-folder", str(folder),
        ]
    else:
        command = [
            sys.executable, str(ROOT / "race-file-processor/src/main.py"),
            "--process-batch", str(master_files[0]), "--output-folder", str(folder),
        ]
    run_checked(command, ROOT / "race-file-processor")


def publish_meeting_to_vercel(folder: Path, meeting: Meeting) -> None:
    git = shutil.which("git")
    if not git:
        raise DownloadError("Git was not found on PATH; meeting cannot be published")
    master_files = list(folder.glob("*_master.csv"))
    if len(master_files) != 1:
        raise DownloadError(f"Expected one meeting master CSV to publish, found {len(master_files)}")
    relative_master = master_files[0].resolve().relative_to(ROOT.resolve())
    relative_arg = str(relative_master).replace("\\", "/")
    branch = run_capture([git, "branch", "--show-current"], ROOT).stdout.strip()
    if branch != "main":
        raise DownloadError(f"Automatic Vercel publish requires branch main; current branch is {branch or '(detached)'}")
    run_capture([git, "fetch", "origin", "main"], ROOT)
    divergence = run_capture(
        [git, "rev-list", "--left-right", "--count", "origin/main...HEAD"], ROOT
    ).stdout.split()
    if divergence != ["0", "0"]:
        raise DownloadError(
            "Automatic publish stopped because local main and origin/main differ "
            f"(remote-only={divergence[0]}, local-only={divergence[1]})"
        )
    run_capture([git, "add", "--", relative_arg], ROOT)
    changed = subprocess.run(
        [git, "diff", "--cached", "--quiet", "--", relative_arg], cwd=ROOT
    ).returncode
    if changed == 0:
        logging.info("Meeting master is already committed; pushing current main")
    elif changed == 1:
        message = f"Add {meeting.track.title()} meeting for {meeting.meeting_date.isoformat()}"
        # --only ensures unrelated staged changes are excluded from this automated commit.
        run_capture([git, "commit", "--only", "-m", message, "--", relative_arg], ROOT)
    else:
        raise DownloadError("Could not inspect staged meeting changes")
    run_capture([git, "push", "origin", "main"], ROOT)
    logging.info("Meeting published to origin/main for Vercel deployment: %s", relative_arg)


def configure_logging(log_root: Path) -> None:
    log_root.mkdir(parents=True, exist_ok=True)
    log_path = log_root / f"race_meeting_downloader_{datetime.now():%Y%m%d}.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(log_path, encoding="utf-8"), logging.StreamHandler()],
    )


def should_process_and_publish(phase: str, retry_evening: bool) -> bool:
    """The 8pm snapshot and race-morning refresh are both production releases."""
    return phase == "morning" or retry_evening


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", required=True, choices=("evening", "morning"))
    parser.add_argument("--date", help="Override meeting date (YYYY-MM-DD), primarily for testing/manual recovery")
    parser.add_argument("--meetings-root", type=Path, default=DEFAULT_MEETINGS_ROOT)
    parser.add_argument("--speed-root", type=Path, default=DEFAULT_SPEED_ROOT)
    parser.add_argument("--meeting-slug", help="Override discovery, e.g. warwick-farm-20260715")
    parser.add_argument("--skip-processor", action="store_true")
    parser.add_argument("--skip-publish", action="store_true")
    parser.add_argument(
        "--retry-evening", action="store_true",
        help="At 8pm, validate/refresh the evening inputs, process them and publish the meeting",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    args.meetings_root = args.meetings_root.resolve()
    args.speed_root = args.speed_root.resolve()
    configure_logging(args.meetings_root / "logs")
    meeting_date = date.fromisoformat(args.date) if args.date else (
        date.today() + timedelta(days=1) if args.phase == "evening" else date.today()
    )
    logging.info("Starting phase=%s meeting_date=%s", args.phase, meeting_date)
    try:
        if args.meeting_slug:
            suffix = "-" + meeting_date.strftime("%Y%m%d")
            if not args.meeting_slug.endswith(suffix):
                raise DownloadError("Meeting slug date does not match --date")
            track = normalise(args.meeting_slug.removesuffix(suffix))
            if not track:
                raise DownloadError("Meeting slug does not contain a track")
            # An explicit slug is a manual override and may be used for an
            # out-of-schedule recovery meeting. Automatic discovery remains
            # restricted to the configured Wed/Thu/Sat meeting types.
            meeting = Meeting(meeting_date, track, args.meeting_slug)
        else:
            meeting = existing_meeting(args.meetings_root, meeting_date)
            if meeting:
                logging.info("Using existing downloaded meeting manifest: %s", meeting.slug)
            else:
                meeting = discover_meeting(meeting_date)
        folder = args.meetings_root / f"{meeting_date.isoformat()}-{slugify(meeting.track)}"
        pdf = folder / "racenet.pdf"
        speed = folder / "speedproxy.html"
        refresh_inputs = True
        speed_source: Path | None = None
        if args.retry_evening:
            if args.phase != "evening":
                raise DownloadError("--retry-evening can only be used with --phase evening")
            try:
                validate_pdf(pdf)
                validate_html(speed, meeting.track)
                current_speed_source = find_fresh_speedproxy(args.speed_root, meeting, args.phase)
                if file_sha256(current_speed_source) != file_sha256(speed):
                    raise DownloadError(
                        f"Box speedproxy changed since the earlier download: {current_speed_source}"
                    )
            except (DownloadError, FileNotFoundError, OSError):
                logging.info(
                    "8pm retry found missing, stale, or changed evening inputs; refreshing meeting"
                )
            else:
                logging.info(
                    "8pm inputs are current; proceeding to process and publish: %s",
                    folder,
                )
                refresh_inputs = False
                speed_source = current_speed_source
        if args.phase == "evening" and (pdf.exists() or speed.exists()):
            if not args.retry_evening:
                raise DownloadError(f"Evening inputs already exist; refusing to overwrite {folder}")
        if refresh_inputs:
            try:
                render_racenet_pdf(meeting, pdf)
            except DownloadError:
                # Racenet occasionally serves a small error/placeholder page to
                # the headless print request.  During the evening retry, keep a
                # previously validated 5pm form so a newly synced Speedproxy can
                # still be processed and published.
                if not args.retry_evening:
                    raise
                validate_pdf(pdf)
                logging.warning(
                    "Racenet refresh failed; retaining the validated existing PDF: %s",
                    pdf,
                    exc_info=True,
                )
            speed_source = find_fresh_speedproxy(args.speed_root, meeting, args.phase)
            atomic_replace(speed_source, speed)
        if speed_source is None:
            raise DownloadError("Speedproxy source was not resolved")
        validate_pdf(pdf)
        validate_html(speed, meeting.track)
        if args.phase == "morning":
            try:
                official = fetch_official_scratchings(meeting)
            except DownloadError:
                if meeting.meeting_date <= date.today():
                    raise
                logging.warning(
                    "Official scratchings are not published yet for the future meeting; "
                    "processing the current Racenet fields as a preview"
                )
                official = {
                    "scratchings": [],
                    "totalScratchings": 0,
                    "totalStarters": None,
                    "publishedAt": "",
                    "track": RACING_AUSTRALIA_TRACK_ALIASES[normalise(meeting.track)],
                    "meetingDate": meeting.meeting_date.isoformat(),
                    "preview": True,
                }
            (folder / "official-scratchings.json").write_text(
                json.dumps(official, indent=2), encoding="utf-8"
            )
        manifest = {
            "meetingDate": meeting_date.isoformat(), "track": meeting.track,
            "racenetSlug": meeting.slug, "phase": args.phase,
            "updatedAt": datetime.now().astimezone().isoformat(),
            "speedproxySource": str(speed_source),
            "speedproxySourceModifiedAt": datetime.fromtimestamp(
                speed_source.stat().st_mtime
            ).astimezone().isoformat(),
            "speedproxySha256": file_sha256(speed_source),
        }
        (folder / "download-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        if should_process_and_publish(args.phase, args.retry_evening) and not args.skip_processor:
            run_processors(folder)
            if not args.skip_publish:
                publish_meeting_to_vercel(folder, meeting)
        logging.info("Completed successfully: %s", folder)
        return 0
    except Exception:
        logging.exception("Race meeting download failed")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
