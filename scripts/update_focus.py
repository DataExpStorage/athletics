"""Yearly lists of "athletes in focus" -> data/focus/<season>.json

Who is in focus for a season Y (profile_rule in the discipline settings):
  - race placings: top N per event by kind of race (Majors, other Platinum, Gold, and
    the listed championship distances);
  - season lists: top N of a season list, but only with a mark better than the N-th
    mark of the same list in season Y-1.

How the lists are kept:
  - While Y is open, the list only grows: anyone who meets the criteria at any point
    stays on it for the rest of the year.
  - From 1 February of Y+1 the list is closed. On closing, everyone on it is checked
    against the final Y results and lists; those who still qualify form the final list
    ("final"), which is carried into Y+1. A closed list is never changed again.
  - Profiles kept up to date in calendar year Z: the final list of Z-1 (all of it while
    it is still open in January) plus everyone on the Z list so far.

  python scripts/update_focus.py    update the open lists, close finished ones
Set ATHLETICS_TODAY=YYYY-MM-DD to try the rules on another date (testing only).
"""
import glob
import json
import os

import wa

FOCUS = os.path.join(wa.DATA, "focus")
LEVEL_ORDER = {"major": 0, "platinum": 3, "championship": 3, "gold": 6}


def focus_path(season):
    return os.path.join(FOCUS, "%d.json" % season)


def load(season):
    return wa.load_json(focus_path(season))


def race_level(race):
    if race.get("major"):
        return "major"
    return {"Platinum": "platinum", "Gold": "gold", "Championship": "championship"}.get(race.get("tier"))


def race_top(rule, race, event):
    """How many finishers of this event qualify (profile_rule)."""
    level = race_level(race)
    if level == "championship":
        return (rule.get("championship_top") or {}).get(event.get("distance"), 0)
    return rule.get("%s_top" % level, 0) if level else 0


def thresholds(cfg, season):
    """The mark an athlete must beat in each season list of `season`: the N-th mark of the
    same list in the previous season. {list key: (seconds, mark)}; a list whose previous
    season is not stored is missing."""
    rule = cfg["profile_rule"]
    top = rule.get("toplist_top", 0)
    out = {}
    if rule.get("toplist_threshold") != "previous-season-20th" or not top:
        return out
    for f in glob.glob(os.path.join(wa.DATA, "toplists", str(season - 1), "*.json")):
        t = wa.load_json(f)
        rows = t.get("rows") or []
        if len(rows) >= top:
            mark = rows[top - 1]["mark"]
            out["%s-%s" % (t["distance"], t["gender"])] = (wa.mark_seconds(mark), mark)
    return out


def qualifying(cfg, season, limits):
    """Everyone who meets the season's criteria on the data stored now:
    {athleteId: {"name": ..., "reasons": [...]}}"""
    rule = cfg["profile_rule"]
    out = {}

    def add(aid, name, reason):
        if not aid:
            return
        entry = out.setdefault(aid, {"name": name, "reasons": []})
        entry["reasons"].append(reason)

    races = dict((r["id"], r) for r in wa.all_races() if r["season"] == season)
    for f in glob.glob(os.path.join(wa.DATA, "results", "*.json")):
        d = wa.load_json(f)
        race = races.get(d["id"])
        if not race:
            continue
        for ev in d["events"]:
            for r in ev["results"][:race_top(rule, race, ev)]:
                add(r["athleteId"], r["name"], {
                    "kind": "race", "raceId": race["id"], "level": race_level(race),
                    "event": ev.get("event"), "place": int(r["place"]) if str(r["place"]).isdigit() else None,
                    "date": race["startDate"]})
    top = rule.get("toplist_top", 0)
    for f in glob.glob(os.path.join(wa.DATA, "toplists", str(season), "*.json")):
        t = wa.load_json(f)
        key = "%s-%s" % (t["distance"], t["gender"])
        if key not in limits:
            continue
        for r in t["rows"][:top]:
            seconds = r.get("seconds") or wa.mark_seconds(r.get("mark"))
            if seconds is not None and limits[key][0] is not None and seconds < limits[key][0]:
                add(r["athleteId"], r["name"], {
                    "kind": "toplist", "list": key, "rank": int(r["rank"]) if str(r["rank"]).isdigit() else None,
                    "mark": r["mark"], "date": r.get("date")})
    return out


def reason_key(reason):
    return (reason["kind"], reason.get("raceId") or reason.get("list"), reason.get("event"))


def merge_reasons(old, new):
    """Add new reasons; for a season list keep the best mark seen. Returns True if changed."""
    changed = False
    index = dict((reason_key(r), i) for i, r in enumerate(old))
    for r in new:
        k = reason_key(r)
        if k not in index:
            old.append(r)
            index[k] = len(old) - 1
            changed = True
        elif r["kind"] == "toplist":
            cur = old[index[k]]
            if wa.mark_seconds(r["mark"]) < wa.mark_seconds(cur["mark"]):
                old[index[k]] = r
                changed = True
    return changed


def update_season(cfg, season, today):
    path = focus_path(season)
    doc = load(season) or {"season": season, "closed": False, "athletes": {}}
    if doc.get("closed"):
        return None
    limits = thresholds(cfg, season)
    q = qualifying(cfg, season, limits)
    before = json.dumps(doc, sort_keys=True)
    doc["thresholds"] = dict((k, {"mark": v[1], "from": season - 1}) for k, v in sorted(limits.items()))
    added = 0
    for aid, info in q.items():
        entry = doc["athletes"].get(aid)
        if entry is None:
            dates = [r["date"] for r in info["reasons"] if r.get("date")]
            doc["athletes"][aid] = {"name": info["name"], "since": min(dates) if dates else today,
                                    "reasons": info["reasons"]}
            added += 1
        else:
            merge_reasons(entry["reasons"], info["reasons"])
    closing = today > "%d-01-31" % (season + 1)
    if closing:
        # the final list: who still qualifies on the season's final results and lists
        doc["final"] = sorted(a for a in doc["athletes"] if a in q)
        for aid, entry in doc["athletes"].items():
            entry["final"] = aid in q
            entry["finalReasons"] = q[aid]["reasons"] if aid in q else []
        doc["closed"] = True
        doc["closedOn"] = today
    doc["athletes"] = dict(sorted(doc["athletes"].items()))
    if json.dumps(doc, sort_keys=True) != before:
        doc["updated"] = today
        wa.save_json(path, doc)
    missing = [k for k in sorted(cfg["toplists"])]
    return {"season": season, "added": added, "total": len(doc["athletes"]), "qualifying_now": len(q),
            "closed": bool(closing), "final": len(doc.get("final") or []),
            "thresholds": len(limits), "lists_expected": 2 * len(missing)}


def kept_up_to_date(cfg=None):
    """Athletes whose profiles are kept up to date today:
    {athleteId: {"name", "reasons", "current": bool}} - current = on this year's list."""
    year = int(wa.today()[:4])
    out = {}
    prev = load(year - 1)
    if prev:
        ids = prev.get("final") if prev.get("closed") else list(prev["athletes"])
        for aid in ids or []:
            e = prev["athletes"][aid]
            out[aid] = {"name": e["name"], "reasons": e.get("finalReasons") or e["reasons"], "current": False}
    cur = load(year)
    if cur:
        for aid, e in cur["athletes"].items():
            old = out.get(aid)
            out[aid] = {"name": e["name"], "reasons": e["reasons"] + (old["reasons"] if old else []), "current": True}
    return out


def prominence(reasons):
    """Lower = more prominent: best place or rank, Majors first."""
    best = 999
    for r in reasons:
        if r["kind"] == "race" and r.get("place"):
            best = min(best, LEVEL_ORDER.get(r.get("level"), 9) + r["place"] - 1)
        elif r["kind"] == "toplist" and r.get("rank"):
            best = min(best, r["rank"] - 1)
    return best


def main():
    cfg = wa.config()
    today = wa.today()
    year = int(today[:4])
    for season in sorted(cfg["seasons"]):
        if season > year:
            continue  # a season has no results before it starts
        s = update_season(cfg, season, today)
        if s is None:
            continue
        note = ""
        if s["thresholds"] < s["lists_expected"]:
            note = " (only %d of %d season-list thresholds: the %d lists are not all stored)" % (
                s["thresholds"], s["lists_expected"], season - 1)
        print("Focus %d: %d athletes (%d added now, %d qualifying today)%s%s" % (
            season, s["total"], s["added"], s["qualifying_now"],
            ", CLOSED with %d on the final list" % s["final"] if s["closed"] else "", note))
    print("Profiles kept up to date: %d" % len(kept_up_to_date(cfg)))


if __name__ == "__main__":
    main()
