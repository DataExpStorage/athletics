"""Shared helpers for reading data from the World Athletics website.

Everything that knows how the WA pages are built lives here, so a change on
their side needs fixing in one place only. Standard library only.
"""
import datetime
import hashlib
import html as htmllib
import json
import os
import re
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(ROOT, ".cache")
BASE = "https://worldathletics.org"
USER_AGENT = "Mozilla/5.0 (compatible; personal-athletics-tracker)"
MIN_INTERVAL = 1.0  # seconds between requests

_last_request = [0.0]


class Refused(RuntimeError):
    """The site asked us to stop (rate limit or bot check)."""


def fetch(path, max_age_hours=0):
    """Return the text of a WA page. Uses the on-disk cache when fresh enough."""
    url = path if path.startswith("http") else BASE + path
    os.makedirs(CACHE, exist_ok=True)
    cache_file = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + ".html")
    if max_age_hours and os.path.exists(cache_file):
        age = (time.time() - os.path.getmtime(cache_file)) / 3600.0
        if age < max_age_hours:
            with open(cache_file, encoding="utf-8") as f:
                return f.read()
    last_error = None
    for attempt in range(4):
        wait = MIN_INTERVAL - (time.time() - _last_request[0])
        if wait > 0:
            time.sleep(wait)
        _last_request[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as resp:
                status = resp.getcode()
                text = resp.read().decode("utf-8", errors="replace")
            if status != 200 or not text.strip():
                # The site answers 202 with an empty page when it wants automated
                # requests to stop. Respect that: no retry, the caller ends the run.
                raise Refused("World Athletics declined the request (status %s) for %s" % (status, url))
            with open(cache_file, "w", encoding="utf-8") as f:
                f.write(text)
            return text
        except Refused:
            raise
        except urllib.error.HTTPError as e:
            last_error = e
            if e.code in (403, 429):
                raise Refused("World Athletics declined the request (status %s) for %s" % (e.code, url))
            if e.code == 404:
                break
        except Exception as e:  # network hiccup: retry
            last_error = e
        time.sleep(3 * (attempt + 1))
    raise RuntimeError("Could not fetch %s: %s" % (url, last_error))


def page_props(text):
    """Extract the pageProps object embedded in a WA page."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', text, re.S)
    if not m:
        raise RuntimeError("Page has no embedded data (site layout changed?)")
    return json.loads(m.group(1))["props"]["pageProps"]


def athlete_id(href_or_slug):
    """'/athletes/kenya/name-14989897' or '/athletes/athlete=14758189' -> '14989897'.

    World Athletics writes the same number with a leading zero in some places
    ('...-014989897') and without it in others, so leading zeros are dropped: one
    athlete, one id."""
    if not href_or_slug:
        return None
    m = re.search(r"(\d{6,})\s*$", str(href_or_slug).strip().rstrip("/"))
    return (m.group(1).lstrip("0") or None) if m else None


def clean(fragment):
    """HTML fragment -> plain text."""
    text = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", htmllib.unescape(text)).strip()


def parse_date(text):
    """'06 DEC 2026' -> '2026-12-06' (returns the input if it does not parse)."""
    try:
        return datetime.datetime.strptime(text.strip().title(), "%d %b %Y").strftime("%Y-%m-%d")
    except (ValueError, AttributeError):
        return text


def mark_seconds(mark):
    """'2:06:01' -> 7561.0, '28:58' -> 1738.0. None when not a time."""
    if not mark:
        return None
    m = re.match(r"^(\d+(?::\d+){0,2})(\.\d+)?", mark.strip())
    if not m:
        return None
    total = 0
    for part in m.group(1).split(":"):
        total = total * 60 + int(part)
    return total + float(m.group(2) or 0)


def distance_from_name(name):
    """Best guess of a road distance from a race or event name."""
    n = name.lower()
    if re.search(r"half|medio mar|mitja|semi|21\b|bangsaen21|21k", n):
        return "half-marathon"
    if re.search(r"marath|marat", n):
        return "marathon"
    if re.search(r"\b10\s?k|10 kilomet", n):
        return "10km"
    if re.search(r"\b25\s?k", n):
        return "25km"
    if re.search(r"\b5\s?k|5 kilomet", n):
        return "5km"
    if re.search(r"mile", n):
        return "mile"
    return "other"


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write("\n")


DISCIPLINE = os.environ.get("ATHLETICS_DISCIPLINE", "road-running")


def config():
    """Settings of the discipline being worked on (config/disciplines/<discipline>.json).
    Road running is the default; set ATHLETICS_DISCIPLINE to work on another."""
    if not re.match(r"^[a-z0-9-]{1,40}$", DISCIPLINE):
        raise RuntimeError("Bad discipline name: %r" % DISCIPLINE)
    cfg = load_json(os.path.join(ROOT, "config", "disciplines", DISCIPLINE + ".json"))
    if cfg is None:
        raise RuntimeError("No settings file config/disciplines/%s.json" % DISCIPLINE)
    return cfg


def today_date():
    """Today, or the date in ATHLETICS_TODAY (YYYY-MM-DD) to try the rules on another day."""
    override = os.environ.get("ATHLETICS_TODAY")
    if override:
        return datetime.datetime.strptime(override, "%Y-%m-%d").date()
    return datetime.date.today()


def today():
    return today_date().isoformat()


def active_seasons(cfg=None):
    """Seasons worth fetching today: from the October before a season (its calendar is
    published in advance and January races need attention in December) until the end of
    the following January (late results and corrections)."""
    cfg = cfg or config()
    now = today()
    return [s for s in cfg["seasons"] if "%d-10-01" % (s - 1) <= now <= "%d-01-31" % (s + 1)]


def calendar_path(season):
    return os.path.join(DATA, "calendar", "%s.json" % season)


def calendars():
    """Every stored season calendar, oldest first: [(season, calendar dict)]."""
    out = []
    folder = os.path.join(DATA, "calendar")
    for name in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        if name.endswith(".json"):
            out.append((int(name[:-5]), load_json(os.path.join(folder, name))))
    return out


def all_races():
    """Priority races of every stored season, each with its 'season'."""
    races = []
    for season, cal in calendars():
        for r in cal["races"]:
            races.append(dict(r, season=season))
    return races
