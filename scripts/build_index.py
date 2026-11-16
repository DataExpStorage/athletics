"""Merge everything in data/ and newsletters/ into the files the site loads.

Output: site/data/site.json, site/data/athletes/{id}.json
"""
import glob
import os
import re
import shutil

import wa

SITE_DATA = os.path.join(wa.ROOT, "site", "data")


def main():
    cal = wa.load_json(os.path.join(wa.DATA, "calendar.json"))
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
