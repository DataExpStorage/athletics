"""Season calendar of priority road races -> data/calendar.json"""
import os

import wa

LABEL_PAGE = "/competitions/world-athletics-label-road-races"


def main():
    cfg = wa.config()
    props = wa.page_props(wa.fetch(LABEL_PAGE))
    events = props["calendarEvents"]["results"]
    season = str(cfg["season"])
    majors = set(cfg["majors"])
    overrides = cfg.get("distance_overrides", {})

    all_tiers = {}
    races = []
    for e in events:
        if not str(e.get("startDate", "")).startswith(season):
            continue
        tier = e.get("competitionSubgroup")
        all_tiers[tier] = all_tiers.get(tier, 0) + 1
        if tier not in cfg["tiers"]:
            continue
        races.append({
            "id": e["id"],
            "name": e["name"],
            "venue": e.get("venue"),
            "country": e.get("countryCode") or e.get("country"),
            "startDate": e["startDate"],
            "endDate": e.get("endDate") or e["startDate"],
            "tier": tier,
            "major": e["id"] in majors,
            "distance": overrides.get(str(e["id"])) or wa.distance_from_name(e["name"]),
        })
    for extra in cfg.get("extra_races", []):
        race = dict(extra)
        race.setdefault("major", False)
        races.append(race)

    if len(races) < 20:
        raise RuntimeError("Only %d priority races found - calendar page changed?" % len(races))
    races.sort(key=lambda r: (r["startDate"], r["name"]))
    wa.save_json(os.path.join(wa.DATA, "calendar.json"), {
        "season": cfg["season"],
        "updated": wa.today(),
        "source": wa.BASE + LABEL_PAGE,
        "labelRaceCounts": all_tiers,
        "races": races,
    })

    summary = {}
    for r in races:
        key = (r["tier"], r["distance"])
        summary[key] = summary.get(key, 0) + 1
    print("Label races in season:", all_tiers)
    for key in sorted(summary):
        print("  %-12s %-14s %d" % (key[0], key[1], summary[key]))
    print("Priority races saved:", len(races))


if __name__ == "__main__":
    main()
