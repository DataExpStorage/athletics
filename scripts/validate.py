"""Check the hand-written and agent-written files before they are built, published or sent.

These files (config/prize_money.json, config/agencies.json, data/entries, data/reports,
data/team, newsletters) are written from web research, so their content is treated as
untrusted: the dashboard must never receive markup, non-web links or
malformed values from them.

The files the fetch scripts store from World Athletics are checked by the same rules.

Usage: python scripts/validate.py              run every check
       python scripts/validate.py reports team run only the named checks
Exits 1 and lists every problem if any is found.
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
        c.date(data.get("searched"), "searched", required=False)
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


def check_news(c):
    """data/news/<ISO week>.json: the week's news items, each with a source."""
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "news", "*"))):
        name = os.path.basename(path)
        c.where = "data/news/" + name
        if not re.match(r"^\d{4}-W\d{2}\.json$", name):
            c.fail("unexpected file name (expected e.g. 2026-W47.json)")
            continue
        data = load(c, path)
        if not isinstance(data, dict):
            continue
        if data.get("week") != name[:-5]:
            c.fail("week does not match the file name")
        c.date(data.get("checked"), "checked")
        items = data.get("items")
        if not isinstance(items, list):
            c.fail("items must be a list")
            continue
        if len(items) > 30:
            c.fail("more than 30 items")
        for it in items:
            if not isinstance(it, dict):
                c.fail("an item is not an object")
                continue
            what = "item %r" % (it.get("headline"),)
            c.text(it.get("headline"), "headline", required=True)
            c.text(it.get("summary"), "%s summary" % what, required=True)
            c.date(it.get("date"), "%s date" % what)
            c.choice(it.get("reliability"), RELIABILITY, "%s reliability" % what)
            c.url(it.get("source"), "%s source" % what, required=True)
            for key in ("athletes", "races"):
                if it.get(key) is not None and not isinstance(it[key], list):
                    c.fail("%s %s must be a list" % (what, key))


# ---------------------------------------------------------------- fetched data
def json_files(c, *parts):
    out = []
    for path in sorted(glob.glob(os.path.join(ROOT, "data", *parts))):
        data = load(c, path)
        if isinstance(data, dict):
            out.append((path, data))
        elif data is not None:
            c.fail("must be a JSON object")
    return out


def check_fetched(c):
    """What the fetch scripts store from World Athletics: also untrusted, so the same
    rules apply (no markup, numeric ids, expected shape)."""
    for path, cal in json_files(c, "calendar", "*.json"):
        name = os.path.basename(path)
        if not re.match(r"^\d{4}\.json$", name) or str(cal.get("season")) != name[:-5]:
            c.fail("season does not match the file name")
        races = cal.get("races")
        if not isinstance(races, list):
            c.fail("races must be a list")
            continue
        for r in races:
            if not isinstance(r, dict) or not isinstance(r.get("id"), int) or isinstance(r.get("id"), bool):
                c.fail("a race has no numeric id")
                continue
            c.text(r.get("name"), "race %s name" % r["id"], required=True)
            c.date(r.get("startDate"), "race %s startDate" % r["id"])
            c.date(r.get("endDate"), "race %s endDate" % r["id"])
            c.text(r.get("tier"), "race %s tier" % r["id"], required=True)
            if not isinstance(r.get("distance"), str) or not re.match(r"^[a-z0-9-]{1,20}$", r["distance"]):
                c.fail("race %s distance is not a plain code: %r" % (r["id"], r.get("distance")))
    for path, res in json_files(c, "results", "*.json"):
        if not re.match(r"^\d{1,12}\.json$", os.path.basename(path)) or str(res.get("id")) != os.path.basename(path)[:-5]:
            c.fail("id does not match the file name")
        c.url(res.get("source"), "source", required=True)
        for ev in res.get("events") or []:
            if not isinstance(ev, dict) or ev.get("gender") not in ("W", "M", "X"):
                c.fail("an event has no valid gender")
                continue
            seen = set()
            for row in ev.get("results") or []:
                if row.get("athleteId") is not None:
                    c.digits(row["athleteId"], "athleteId of %r" % (row.get("name"),))
                # one athlete, one row: a repeat means two lists of the same race were merged
                who = row.get("athleteId") or (row.get("name"), row.get("mark"))
                if who in seen:
                    c.fail("%s lists %r twice" % (ev.get("event"), row.get("name")))
                seen.add(who)
    for path, top in json_files(c, "toplists", "*", "*.json"):
        c.url(top.get("source"), "source", required=True)
        for row in top.get("rows") or []:
            if row.get("athleteId") is not None:
                c.digits(row["athleteId"], "athleteId of %r" % (row.get("name"),))
    for path, prof in json_files(c, "athletes", "*.json"):
        name = os.path.basename(path)
        if not re.match(r"^[1-9]\d{0,11}\.json$", name) or str(prof.get("id")) != name[:-5]:
            c.fail("id does not match the file name, or has a leading zero")
        c.url(prof.get("source"), "source", required=True)
        rep = prof.get("representative")
        if rep is not None:
            # privacy: only the name, country and business website of a representative are kept
            if not isinstance(rep, dict) or not set(rep) <= set(("name", "country", "website")):
                c.fail("representative holds more than name, country and website")
        if re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", json.dumps(prof)):
            c.fail("contains an e-mail address")


def check_links(c):
    """Researched files must point at races and athletes that exist in the fetched data."""
    race_ids, athlete_ids = set(), set()
    for path in glob.glob(os.path.join(ROOT, "data", "calendar", "*.json")):
        try:
            with open(path, encoding="utf-8") as f:
                race_ids.update(str(r.get("id")) for r in json.load(f).get("races", []) if isinstance(r, dict))
        except (ValueError, OSError):
            pass
    for path in glob.glob(os.path.join(ROOT, "data", "athletes", "*.json")):
        athlete_ids.add(os.path.basename(path)[:-5])
    for folder in ("reports", "entries"):
        for path in glob.glob(os.path.join(ROOT, "data", folder, "*.json")):
            if os.path.basename(path)[:-5] not in race_ids:
                c.where = "data/%s/%s" % (folder, os.path.basename(path))
                c.fail("no race with this id in any calendar")
    path = os.path.join(ROOT, "config", "prize_money.json")
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                prize = json.load(f)
        except (ValueError, OSError):
            prize = {}
        c.where = "config/prize_money.json"
        for rid in (prize.get("races") or {}) if isinstance(prize, dict) else {}:
            if str(rid) not in race_ids:
                c.fail("race %s is not in any calendar" % rid)
    for path in glob.glob(os.path.join(ROOT, "data", "team", "*.json")):
        if os.path.basename(path)[:-5] not in athlete_ids:
            c.where = "data/team/" + os.path.basename(path)
            c.fail("no athlete profile with this id")


def check_focus(c):
    """data/focus/<season>.json: the yearly lists of athletes in focus. A closed list
    must never change again."""
    import subprocess
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "focus", "*"))):
        name = os.path.basename(path)
        c.where = "data/focus/" + name
        if not re.match(r"^\d{4}\.json$", name):
            c.fail("unexpected file name (expected e.g. 2026.json)")
            continue
        doc = load(c, path)
        if not isinstance(doc, dict):
            continue
        if str(doc.get("season")) != name[:-5]:
            c.fail("season does not match the file name")
        if not isinstance(doc.get("closed"), bool):
            c.fail("closed must be true or false")
        athletes = doc.get("athletes")
        if not isinstance(athletes, dict):
            c.fail("athletes must be an object")
            continue
        for aid, e in athletes.items():
            if not re.match(r"^[1-9]\d{0,11}$", aid):
                c.fail("athlete id %r is not a number without leading zero" % aid)
            if not isinstance(e, dict) or not isinstance(e.get("reasons"), list) or not e["reasons"]:
                c.fail("athlete %s has no reasons" % aid)
                continue
            for r in e["reasons"] + (e.get("finalReasons") or []):
                if not isinstance(r, dict) or r.get("kind") not in ("race", "toplist"):
                    c.fail("athlete %s has a reason of unknown kind" % aid)
                elif r["kind"] == "race" and not isinstance(r.get("raceId"), int):
                    c.fail("athlete %s has a race reason without a race id" % aid)
        if doc.get("closed"):
            final = doc.get("final")
            if not isinstance(final, list) or not set(final) <= set(athletes):
                c.fail("a closed list needs a final list drawn from its athletes")
            rel = "data/focus/" + name
            try:
                old = subprocess.run(["git", "show", "HEAD:" + rel], cwd=ROOT, stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE)
            except OSError:
                continue  # no git here: cannot compare
            if old.returncode == 0:
                try:
                    before = json.loads(old.stdout.decode("utf-8"))
                except ValueError:
                    before = None
                if isinstance(before, dict) and before.get("closed") and before != doc:
                    c.fail("this list was closed and must not change")


CHECKS = {
    "prize_money": check_prize_money,
    "agencies": check_agencies,
    "entries": check_entries,
    "reports": check_reports,
    "team": check_team,
    "news": check_news,
    "newsletters": check_newsletters,
    "fetched": check_fetched,
    "links": check_links,
    "focus": check_focus,
}
ORDER = ("fetched", "focus", "prize_money", "agencies", "entries", "reports", "team", "news", "newsletters", "links")


def check(kinds=None):
    """Run the named checks (all of them by default) and return the list of problems."""
    c = Checker()
    for kind in (kinds or ORDER):
        CHECKS[kind](c)
    return c.errors


def main():
    kinds = [a for a in sys.argv[1:] if not a.startswith("-")]
    unknown = [k for k in kinds if k not in CHECKS]
    if unknown:
        sys.exit("Unknown check: %s (available: %s)" % (", ".join(unknown), ", ".join(ORDER)))
    errors = check(kinds or None)
    if errors:
        sys.stdout.buffer.write(("Validation failed (%d):\n  " % len(errors) + "\n  ".join(errors) + "\n").encode("utf-8", "replace"))
        sys.exit(1)
    print("Valid: %s." % (", ".join(kinds) if kinds else "all checks passed"))


if __name__ == "__main__":
    main()
