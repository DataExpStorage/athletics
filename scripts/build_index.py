"""Merge everything in data/ and newsletters/ into the files the site loads.

Output: site/data/site.json, site/data/athletes/{id}.json
"""
import glob
import os
import re
import shutil

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


def main():
    cal = wa.load_json(os.path.join(wa.DATA, "calendar.json"))
    prize_cfg = wa.load_json(os.path.join(wa.ROOT, "config", "prize_money.json"), {"races": {}, "usd_rates": {}})
    races = []
    for race in cal["races"]:
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
    for f in sorted(glob.glob(os.path.join(wa.DATA, "toplists", "*.json"))):
        t = wa.load_json(f)
        toplists["%s-%s" % (t["distance"], t["gender"])] = {
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
        "season": cal["season"],
        "updated": wa.today(),
        "labelRaceCounts": cal.get("labelRaceCounts"),
        "races": races,
        "toplists": toplists,
        "athleteIds": sorted(athlete_ids),
        "newsletters": newsletters,
    })
    print("Site data: %d races (%d with results), %d top lists, %d athletes, %d newsletters" % (
        len(races), len([r for r in races if r.get("events")]), len(toplists), len(athlete_ids), len(newsletters)))


if __name__ == "__main__":
    main()
