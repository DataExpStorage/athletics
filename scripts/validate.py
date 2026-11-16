"""Check the hand-written and agent-written files before they are built, published or sent.

These files (config/prize_money.json, config/agencies.json, data/entries, data/reports,
data/team, newsletters) are written from web research, so their content is treated as
untrusted: the dashboard and Telegram must never receive markup, non-web links or
malformed values from them.

Usage: python scripts/validate.py      exits 1 and lists every problem if any is found
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RELIABILITY = ("official", "reported", "unconfirmed")
CONFIDENCE = ("high", "medium", "low")
EVENT_TYPES = ("announced", "confirmed", "withdrawn")
MAX_TEXT = 2000
MAX_NEWSLETTER_BYTES = 20000

URL = re.compile(r"^https?://[^\s<>\"']+$")
DIGITS = re.compile(r"^\d{1,12}$")
DATE = re.compile(r"^\d{4}(-\d{2}){0,2}$")
MARKUP = re.compile(r"<\s*[A-Za-z/!]")


class Checker(object):
    def __init__(self):
        self.errors = []
        self.where = ""

    def fail(self, message):
        self.errors.append("%s: %s" % (self.where, message))

    def text(self, value, label, required=False, allow_none=True):
        if value is None:
            if required or not allow_none:
                self.fail("%s is missing" % label)
            return
        if not isinstance(value, str):
            self.fail("%s must be text, not %s" % (label, type(value).__name__))
        elif required and not value.strip():
            self.fail("%s is empty" % label)

    def url(self, value, label, required=False):
        if value is None:
            if required:
                self.fail("%s is missing" % label)
            return
        if not isinstance(value, str) or not URL.match(value):
            self.fail("%s is not a plain http(s) link: %r" % (label, value))

    def choice(self, value, options, label, required=True):
        if value is None and not required:
            return
        if value not in options:
            self.fail("%s must be one of %s, not %r" % (label, ", ".join(options), value))

    def digits(self, value, label):
        if not isinstance(value, (str, int)) or isinstance(value, bool) or not DIGITS.match(str(value)):
            self.fail("%s must be a number: %r" % (label, value))

    def date(self, value, label, required=True):
        if value is None and not required:
            return
        if not isinstance(value, str) or not DATE.match(value):
            self.fail("%s must look like 2026-11-13 (or 2026-11, or 2026): %r" % (label, value))

    def no_markup(self, obj, path=""):
        """No HTML anywhere, no oversized strings, no unexpected value types."""
        if isinstance(obj, dict):
            for k, v in obj.items():
                if not isinstance(k, str) or MARKUP.search(k):
                    self.fail("bad key %r" % (k,))
                self.no_markup(v, "%s.%s" % (path, k))
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                self.no_markup(v, "%s[%d]" % (path, i))
        elif isinstance(obj, str):
            if MARKUP.search(obj):
                self.fail("%s contains HTML markup" % path)
            if len(obj) > MAX_TEXT:
                self.fail("%s is longer than %d characters" % (path, MAX_TEXT))
        elif obj is not None and not isinstance(obj, (int, float, bool)):
            self.fail("%s has an unexpected value type" % path)


def load(c, path):
    c.where = os.path.relpath(path, ROOT).replace("\\", "/")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (ValueError, OSError) as e:
        c.fail("cannot be read as JSON (%s)" % e)
        return None
    c.no_markup(data)
    return data


def check_prize_money(c):
    path = os.path.join(ROOT, "config", "prize_money.json")
    data = load(c, path) if os.path.exists(path) else None
    if not isinstance(data, dict):
        return
    rates = data.get("usd_rates") or {}
    for cur, rate in rates.items():
        if not re.match(r"^[A-Z]{3}$", str(cur)) or not isinstance(rate, (int, float)) or isinstance(rate, bool) or rate <= 0:
            c.fail("usd_rates entry %r is not a currency code with a positive rate" % (cur,))
    for rid, entry in (data.get("races") or {}).items():
        label = "race %s" % rid
        c.digits(rid, "race id")
        if not isinstance(entry, dict):
            c.fail("%s is not an object" % label)
            continue
        cur = entry.get("currency")
        if not isinstance(cur, str) or not re.match(r"^[A-Z]{3}$", cur):
            c.fail("%s: currency must be a three-letter code: %r" % (label, cur))
        elif cur not in rates:
            c.fail("%s: currency %s has no rate in usd_rates" % (label, cur))
        places = entry.get("places")
        tables = list(places.values()) if isinstance(places, dict) else [places]
        if isinstance(places, dict) and not set(places) <= set(("W", "M")):
            c.fail("%s: places may only be split into W and M" % label)
        for table in tables:
            if not isinstance(table, list) or not table or not all(
                    isinstance(x, (int, float)) and not isinstance(x, bool) and 0 <= x <= 10000000 for x in table):
                c.fail("%s: places must be a list of amounts" % label)
        for b in entry.get("awarded_bonuses") or []:
            if not isinstance(b, dict) or b.get("gender") not in ("W", "M") or not isinstance(b.get("place"), int) \
                    or not isinstance(b.get("amount"), (int, float)) or isinstance(b.get("amount"), bool):
                c.fail("%s: an awarded bonus needs gender (W/M), place and amount" % label)
        c.choice(entry.get("confidence"), CONFIDENCE, "%s confidence" % label)
        c.date(entry.get("checked"), "%s checked" % label)
        sources = entry.get("sources")
        if not isinstance(sources, list) or not sources:
            c.fail("%s: at least one source is needed" % label)
        for s in sources if isinstance(sources, list) else []:
            c.url(s, "%s source" % label, required=True)


def check_agencies(c):
    path = os.path.join(ROOT, "config", "agencies.json")
    data = load(c, path) if os.path.exists(path) else None
    if not isinstance(data, dict):
        return
    for site, name in (data.get("by_website") or {}).items():
        if not re.match(r"^[a-z0-9.-]+\.[a-z]{2,}$", str(site)):
            c.fail("by_website key %r is not a plain domain name" % (site,))
        c.text(name, "agency for %s" % site, required=True)
    for rep, m in (data.get("by_representative") or {}).items():
        if not isinstance(m, dict):
            c.fail("by_representative %r is not an object" % (rep,))
            continue
        c.text(m.get("agency"), "agency for %s" % rep, required=True)
        c.choice(m.get("reliability"), RELIABILITY, "reliability for %s" % rep)
        c.url(m.get("source"), "source for %s" % rep, required=True)


def numbered_files(c, folder):
    """JSON files of a data folder whose names must be '<number>.json'."""
    out = []
    for path in sorted(glob.glob(os.path.join(ROOT, "data", folder, "*"))):
        name = os.path.basename(path)
        c.where = "data/%s/%s" % (folder, name)
        if not re.match(r"^\d{1,12}\.json$", name):
            c.fail("unexpected file name")
            continue
        data = load(c, path)
        if isinstance(data, dict):
            out.append((name[:-5], data))
        elif data is not None:
            c.fail("must be a JSON object")
    return out


def check_entries(c):
    for rid, data in numbered_files(c, "entries"):
        if str(data.get("raceId")) != rid:
            c.fail("raceId does not match the file name")
        c.date(data.get("checked"), "checked")
        entries = data.get("entries")
        if not isinstance(entries, list):
            c.fail("entries must be a list")
            continue
        for e in entries:
            if not isinstance(e, dict):
                c.fail("an entry is not an object")
                continue
            who = "entry %r" % (e.get("name"),)
            c.text(e.get("name"), "%s name" % who, required=True)
            c.choice(e.get("gender"), ("W", "M"), "%s gender" % who)
            if e.get("athleteId") is not None:
                c.digits(e["athleteId"], "%s athleteId" % who)
            history = e.get("history")
            if not isinstance(history, list) or not history:
                c.fail("%s needs a history with at least one event" % who)
                continue
            for h in history:
                if not isinstance(h, dict):
                    c.fail("%s has a history event that is not an object" % who)
                    continue
                c.choice(h.get("type"), EVENT_TYPES, "%s event type" % who)
                c.choice(h.get("reliability"), RELIABILITY, "%s reliability" % who)
                c.date(h.get("date"), "%s event date" % who)
                c.url(h.get("source"), "%s source" % who, required=True)
                if h.get("type") == "withdrawn":
                    c.text(h.get("reason"), "%s withdrawal reason" % who, required=True)


def check_reports(c):
    for rid, data in numbered_files(c, "reports"):
        if str(data.get("raceId")) != rid:
            c.fail("raceId does not match the file name")
        c.text(data.get("title"), "title", required=True)
        c.url(data.get("source"), "source", required=True)
        c.text(data.get("weather"), "weather")
        story = data.get("story") or {}
        if not isinstance(story, dict) or not set(story) <= set(("W", "M")):
            c.fail("story may only have W and M")
        for key in ("performances", "dnf"):
            items = data.get(key, [])
            if not isinstance(items, list):
                c.fail("%s must be a list" % key)
                continue
            for p in items:
                if not isinstance(p, dict):
                    c.fail("%s has an item that is not an object" % key)
                    continue
                c.text(p.get("name"), "%s name" % key, required=True)
                c.choice(p.get("gender"), ("W", "M"), "%s gender for %r" % (key, p.get("name")))
                c.text(p.get("note"), "%s note for %r" % (key, p.get("name")), required=True)
                if p.get("athleteId") is not None:
                    c.digits(p["athleteId"], "%s athleteId" % key)


def check_team(c):
    for aid, data in numbered_files(c, "team"):
        if str(data.get("athleteId")) != aid:
            c.fail("athleteId does not match the file name")
        c.date(data.get("checked"), "checked", required=False)
        for role in ("coach", "shoe", "manager", "agency"):
            item = data.get(role)
            if item is None:
                continue
            if not isinstance(item, dict):
                c.fail("%s must be an object" % role)
                continue
            c.text(item.get("value"), "%s value" % role)
            c.url(item.get("source"), "%s source" % role, required=bool(item.get("value")))
            if item.get("value") or item.get("reliability") is not None:
                c.choice(item.get("reliability"), RELIABILITY, "%s reliability" % role)
            if "verified" in item and not isinstance(item["verified"], bool):
                c.fail("%s verified must be true or false" % role)


def check_newsletters(c):
    for path in sorted(glob.glob(os.path.join(ROOT, "newsletters", "*"))):
        name = os.path.basename(path)
        c.where = "newsletters/" + name
        if not re.match(r"^\d{4}-W\d{2}\.md$", name):
            c.fail("unexpected file name (expected e.g. 2026-W47.md)")
            continue
        if os.path.getsize(path) > MAX_NEWSLETTER_BYTES:
            c.fail("larger than %d bytes" % MAX_NEWSLETTER_BYTES)
        try:
            with open(path, encoding="utf-8") as f:
                text = f.read()
        except (ValueError, OSError) as e:
            c.fail("cannot be read as UTF-8 text (%s)" % e)
            continue
        if MARKUP.search(text):
            c.fail("contains HTML markup")
        for target in re.findall(r"\]\(([^)]*)\)", text):
            if not URL.match(target):
                c.fail("link target is not a plain http(s) link: %r" % target)


def check():
    c = Checker()
    for step in (check_prize_money, check_agencies, check_entries, check_reports, check_team, check_newsletters):
        step(c)
    return c.errors


def main():
    errors = check()
    if errors:
        sys.stdout.buffer.write(("Validation failed (%d):\n  " % len(errors) + "\n  ".join(errors) + "\n").encode("utf-8", "replace"))
        sys.exit(1)
    print("Researched files are valid.")


if __name__ == "__main__":
    main()
