"""Season calendars of priority road races -> data/calendar/<season>.json

The World Athletics page serves a single season (its latest). Each run stores that
season if it is active (see wa.active_seasons); calendars already stored for other
seasons are kept as they are.
"""
import os

import wa

LABEL_PAGE = "/competitions/world-athletics-label-road-races"


def is_major(cfg, name, tier, distance):
    if tier != "Platinum" or distance != "marathon":
        return False
    low = name.lower()
    return any(key.lower() in low for key in cfg["majors"])


def save_season(cfg, season, cal):
    events = [e for e in cal["results"] if str(e.get("startDate", "")).startswith(str(season))]
    overrides = cfg.get("distance_overrides", {})

    all_tiers = {}
    races = []
    for e in events:
        tier = e.get("competitionSubgroup")
        try:
            e["id"] = int(e["id"])  # the id becomes a file name and a link: numbers only
        except (KeyError, TypeError, ValueError):
            continue
        all_tiers[tier] = all_tiers.get(tier, 0) + 1
        if tier not in cfg["tiers"]:
            continue
        distance = overrides.get(str(e["id"])) or wa.distance_from_name(e["name"])
        races.append({
            "id": e["id"],
            "name": e["name"],
            "venue": e.get("venue"),
            "country": e.get("countryCode") or e.get("country"),
            "startDate": e["startDate"],
            "endDate": e.get("endDate") or e["startDate"],
            "tier": tier,
            "major": is_major(cfg, e["name"], tier, distance),
            "distance": distance,
        })
    for extra in cfg.get("extra_races", []):
        if str(extra.get("startDate", "")).startswith(str(season)):
            race = dict(extra)
            race.setdefault("major", False)
            races.append(race)

    if len(races) < 20:
        # early in the publication cycle the list can be short; store it, but say so
        print("Season %s: only %d priority races listed so far" % (season, len(races)))
    races.sort(key=lambda r: (r["startDate"], r["name"]))
    wa.save_json(wa.calendar_path(season), {
        "season": season,
        "updated": wa.today(),
        "source": wa.BASE + LABEL_PAGE,
        "labelRaceCounts": all_tiers,
        "races": races,
    })

    summary = {}
    for r in races:
        key = (r["tier"], r["distance"])
        summary[key] = summary.get(key, 0) + 1
    print("Season %s: label races %s" % (season, all_tiers))
    for key in sorted(summary):
        print("  %-12s %-14s %d" % (key[0], key[1], summary[key]))
    print("  priority races saved: %d, Majors: %d" % (len(races), len([r for r in races if r["major"]])))
    return True


def add_extras(cfg, season):
    """Put hand-listed races (extra_races) into a season the site is not serving."""
    extras = [dict(e) for e in cfg.get("extra_races", []) if str(e.get("startDate", "")).startswith(str(season))]
    if not extras:
        return
    cal = wa.load_json(wa.calendar_path(season)) or {"season": season, "source": "config/disciplines/road-running.json", "labelRaceCounts": {}, "races": []}
    have = set(r["id"] for r in cal["races"])
    added = [e for e in extras if e["id"] not in have]
    if not added:
        return
    for e in added:
        e.setdefault("major", False)
        cal["races"].append(e)
    cal["races"].sort(key=lambda r: (r["startDate"], r["name"]))
    cal["updated"] = wa.today()
    wa.save_json(wa.calendar_path(season), cal)
    print("Season %s: added %d hand-listed race(s)." % (season, len(added)))


def main():
    cfg = wa.config()
    seasons = wa.active_seasons(cfg)
    if not seasons:
        print("No active season in config/disciplines/road-running.json ('seasons'). Add the new season there.")
        return
    # The page serves one season only (the site's own season switch needs a browser),
    # so each run stores the season the site is currently showing.
    cal = wa.page_props(wa.fetch(LABEL_PAGE))["calendarEvents"]
    served = int((cal.get("parameters") or {}).get("season") or 0)
    published = [int(s["id"]) for s in ((cal.get("options") or {}).get("seasons") or [])]
    if served in seasons:
        save_season(cfg, served, cal)
    else:
        print("The site is showing season %s, which is not an active season in config/disciplines/road-running.json." % served)
    for season in seasons:
        if season == served:
            continue
        add_extras(cfg, season)
        if season not in published:
            print("Season %s: label calendar not published by World Athletics yet." % season)
        elif os.path.exists(wa.calendar_path(season)):
            print("Season %s: site now shows %s; keeping the stored calendar." % (season, served))
        else:
            print("Season %s: published, but the site is showing %s. Add its races by hand "
                  "(extra_races in config/disciplines/road-running.json) until the site switches." % (season, served))


if __name__ == "__main__":
    main()
