"""Merge everything in data/ and newsletters/ into the files the site loads.

Output: site/data/site.json, site/data/athletes/{id}.json
"""
import glob
import os
import re
import shutil
import unicodedata

import wa

SITE_DATA = os.path.join(wa.ROOT, "site", "data")


def add_prize_money(race, entry, rates):
    """Attach place prizes and reported bonuses (in US dollars too) to a race's result rows."""
    rate = rates.get(entry["currency"])
    race["prize"] = {
        "currency": entry["currency"],
        "usdRate": rate,
        "placesNote": entry.get("places_note"),
        "bonusRules": entry.get("bonus_rules"),
        "confidence": entry.get("confidence"),
        "checked": entry.get("checked"),
        "sources": entry.get("sources", []),
        "first": None,
    }
    for ev in race.get("events", []):
        places = entry["places"]
        if isinstance(places, dict):
            places = places.get(ev["gender"], [])
        if race["prize"]["first"] is None and places:
            race["prize"]["first"] = places[0]
        for r in ev["results"]:
            if not r["place"].isdigit():
                continue
            n = int(r["place"])
            amount = places[n - 1] if n <= len(places) else 0
            bonus, notes = 0, []
            for b in entry.get("awarded_bonuses", []):
                if b["gender"] == ev["gender"] and b["place"] == n:
                    bonus += b["amount"]
                    notes.append(b.get("note", "Bonus"))
            if amount or bonus:
                r["prize"] = amount
                if bonus:
                    r["bonus"] = bonus
                    r["bonusNote"] = "; ".join(notes)
                if rate:
                    r["usd"] = int(round((amount + bonus) * rate))


RELIABILITY_ORDER = {"official": 0, "reported": 1, "unconfirmed": 2}


def name_tokens(name):
    text = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    return frozenset(re.findall(r"[a-z]+", text))


def build_name_index():
    """(gender, name tokens) -> athlete id, for every athlete seen in results and top lists."""
    index = {}

    def add(gender, name, aid):
        if aid and name:
            index.setdefault(gender, {})[name_tokens(name)] = aid

    for f in glob.glob(os.path.join(wa.DATA, "results", "*.json")):
        for ev in wa.load_json(f)["events"]:
            for r in ev["results"]:
                add(ev["gender"], r["name"], r["athleteId"])
    for f in glob.glob(os.path.join(wa.DATA, "toplists", "*", "*.json")):
        t = wa.load_json(f)
        for r in t["rows"]:
            add("W" if t["gender"] == "women" else "M", r["name"], r["athleteId"])
    return index


def find_athlete(index, gender, name):
    """Exact name match, else a unique athlete whose name contains all the given words."""
    people = index.get(gender, {})
    tokens = name_tokens(name)
    if tokens in people:
        return people[tokens]
    hits = set(aid for t, aid in people.items() if len(tokens) >= 2 and tokens <= t)
    return hits.pop() if len(hits) == 1 else None


def build_entries(index):
    """data/entries/*.json -> per race: current status of every announced athlete, with history."""
    out = {}
    for f in sorted(glob.glob(os.path.join(wa.DATA, "entries", "*.json"))):
        d = wa.load_json(f)
        entries = []
        for e in d.get("entries", []):
            history = sorted(e.get("history", []), key=lambda h: h.get("date", ""))
            if not history:
                continue
            last = history[-1]
            withdrawn = last["type"] == "withdrawn"
            # evidence for the current status: for a starter, every event since the last withdrawal
            start = max([i for i, h in enumerate(history) if h["type"] == "withdrawn"] or [-1])
            evidence = [last] if withdrawn else history[start + 1:]
            reliability = min((h.get("reliability", "unconfirmed") for h in evidence),
                              key=lambda r: RELIABILITY_ORDER.get(r, 9))
            entries.append({
                "name": e["name"], "nat": e.get("nat"), "gender": e.get("gender"), "pb": e.get("pb"),
                "id": e.get("athleteId") or find_athlete(index, e.get("gender"), e["name"]),
                "status": "withdrawn" if withdrawn else "announced",
                "reliability": reliability,
                "firstDate": history[0].get("date"),
                "lastDate": last.get("date"),
                "reason": last.get("reason") if withdrawn else None,
                "history": history,
            })
        out[str(d["raceId"])] = {"checked": d.get("checked"), "note": d.get("note"), "entries": entries}
    return out


def build_reports(index):
    """data/reports/*.json -> per race: summary of the race report, athletes matched to ids."""
    out = {}
    for f in sorted(glob.glob(os.path.join(wa.DATA, "reports", "*.json"))):
        d = wa.load_json(f)
        for key in ("performances", "dnf"):
            for p in d.get(key, []):
                p["id"] = p.get("athleteId") or find_athlete(index, p.get("gender"), p["name"])
        out[str(d["raceId"])] = d
    return out


def main():
    prize_cfg = wa.load_json(os.path.join(wa.ROOT, "config", "prize_money.json"), {"races": {}, "usd_rates": {}})
    races = []
    for race in wa.all_races():
        race = dict(race)
        res = wa.load_json(os.path.join(wa.DATA, "results", "%s.json" % race["id"]))
        if res:
            race["source"] = res["source"]
            race["events"] = [{
                "event": ev["event"],
                "gender": ev["gender"],
                "distance": ev["distance"],
                "finishers": ev["finishers"],
                "results": [{
                    "place": r["place"], "mark": r["mark"], "name": r["name"], "nat": r["nat"],
                    "id": r["athleteId"], "born": (r.get("birthDate") or "")[-4:], "records": r["records"],
                } for r in ev["results"]],
            } for ev in res["events"]]
        entry = prize_cfg["races"].get(str(race["id"]))
        if entry:
            add_prize_money(race, entry, prize_cfg.get("usd_rates", {}))
        races.append(race)

    toplists = {}
    for f in sorted(glob.glob(os.path.join(wa.DATA, "toplists", "*", "*.json"))):
        t = wa.load_json(f)
        toplists.setdefault(str(t["season"]), {})["%s-%s" % (t["distance"], t["gender"])] = {
            "source": t["source"],
            "rows": [{
                "rank": r["rank"], "mark": r["mark"], "name": r["name"], "nat": r["nat"], "id": r["athleteId"],
                "born": r["birthDate"][-4:], "pos": r["pos"], "venue": r["venue"], "date": r["date"],
            } for r in t["rows"]],
        }

    out_athletes = os.path.join(SITE_DATA, "athletes")
    if os.path.isdir(out_athletes):
        shutil.rmtree(out_athletes)
    os.makedirs(out_athletes)
    athlete_ids = []
    for f in glob.glob(os.path.join(wa.DATA, "athletes", "*.json")):
        shutil.copy(f, out_athletes)
        athlete_ids.append(os.path.splitext(os.path.basename(f))[0])

    newsletters = []
    for f in sorted(glob.glob(os.path.join(wa.ROOT, "newsletters", "*.md")), reverse=True):
        with open(f, encoding="utf-8") as fh:
            text = fh.read()
        m = re.search(r"^#\s+(.+)$", text, re.M)
        newsletters.append({
            "id": os.path.splitext(os.path.basename(f))[0],
            "title": m.group(1).strip() if m else os.path.basename(f),
            "text": text,
        })

    wa.save_json(os.path.join(SITE_DATA, "site.json"), {
        "seasons": [season for season, _ in wa.calendars()],
        "updated": wa.today(),
        "labelRaceCounts": dict((str(season), cal.get("labelRaceCounts")) for season, cal in wa.calendars()),
        "races": races,
        "toplists": toplists,
        "entries": build_entries(build_name_index()),
        "reports": build_reports(build_name_index()),
        "athleteIds": sorted(athlete_ids),
        "newsletters": newsletters,
    })
    print("Site data: %d races (%d with results), %d top lists, %d athletes, %d newsletters" % (
        len(races), len([r for r in races if r.get("events")]), sum(len(v) for v in toplists.values()), len(athlete_ids), len(newsletters)))


if __name__ == "__main__":
    main()
