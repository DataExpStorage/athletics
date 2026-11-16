"""Show what has been gathered for each priority race, and what is still missing.

Usage: python scripts/status.py            every race
       python scripts/status.py --missing  only races with something missing
       python scripts/status.py --json [--out FILE]
                                           the work list for the pipeline stages
"""
import datetime
import glob
import json
import os
import sys

import wa

ENTRY_WINDOW_DAYS = 42      # entries are tracked from six weeks before a race
RECENT_DAYS = 7
NEXT_DAYS = 10
BACKLOG_PER_RUN = 5         # older gaps handed to a stage in one run
TEAM_NEW_PER_RUN = 15
TEAM_VERIFY_PER_RUN = 5


def race_rows():
    prize = wa.load_json(os.path.join(wa.ROOT, "config", "prize_money.json"), {"races": {}})["races"]
    today = wa.today()
    rows = []
    for r in wa.all_races():
        rid = str(r["id"])
        run = os.path.exists(os.path.join(wa.DATA, "results", rid + ".json"))
        rows.append(dict(r, rid=rid, run=run,
                         upcoming=not run and r["endDate"] >= today,
                         has_prize=rid in prize,
                         has_report=os.path.exists(os.path.join(wa.DATA, "reports", rid + ".json")),
                         has_entries=os.path.exists(os.path.join(wa.DATA, "entries", rid + ".json"))))
    return rows


def brief(r):
    return {"id": r["id"], "name": r["name"], "date": r["startDate"], "tier": r["tier"],
            "major": bool(r.get("major")), "distance": r["distance"], "venue": r.get("venue")}


def work_list():
    """What each research stage should look at in this run: this week's items first,
    then a few from the backlog (most important and most recent first)."""
    today = datetime.date.today()
    day = lambda n: (today + datetime.timedelta(days=n)).isoformat()  # noqa: E731
    rows = race_rows()
    recent = [r for r in rows if r["run"] and r["startDate"] >= day(-RECENT_DAYS)]

    def backlog(flag):
        older = [r for r in rows if r["run"] and not r[flag] and r["startDate"] < day(-RECENT_DAYS)]
        older.sort(key=lambda r: (0 if r.get("major") else 1 if r["tier"] in ("Platinum", "Championship") else 2,
                                  -int(r["startDate"].replace("-", ""))))
        return [brief(r) for r in older[:BACKLOG_PER_RUN]]

    profiles = sorted(os.path.splitext(os.path.basename(f))[0] for f in glob.glob(os.path.join(wa.DATA, "athletes", "*.json")))
    no_team, unverified = [], []
    for aid in profiles:
        team = wa.load_json(os.path.join(wa.DATA, "team", aid + ".json"))
        prof = wa.load_json(os.path.join(wa.DATA, "athletes", aid + ".json")) or {}
        name = ("%s %s" % (prof.get("givenName") or "", prof.get("familyName") or "")).strip()
        if not team:
            no_team.append({"athleteId": aid, "name": name, "country": prof.get("country")})
        elif any(isinstance(team.get(k), dict) and team[k].get("verified") is False for k in ("coach", "shoe", "agency", "manager")):
            unverified.append({"athleteId": aid, "name": name, "checked": team.get("checked")})
    unverified.sort(key=lambda t: t.get("checked") or "")

    return {
        "today": today.isoformat(),
        "week": "%04d-W%02d" % today.isocalendar()[:2],
        "seasons": [s for s, _ in wa.calendars()],
        "races_last_7_days": [brief(r) for r in recent],
        "races_next_10_days": [brief(r) for r in rows if r["upcoming"] and r["startDate"] <= day(NEXT_DAYS)],
        "reports": {"this_week": [brief(r) for r in recent if not r["has_report"]], "backlog": backlog("has_report")},
        "prize-money": {"this_week": [brief(r) for r in recent if not r["has_prize"]], "backlog": backlog("has_prize")},
        "entries": {
            "upcoming": [dict(brief(r), has_file=r["has_entries"]) for r in rows
                         if r["upcoming"] and r["startDate"] <= day(ENTRY_WINDOW_DAYS)],
            "just_run": [brief(r) for r in recent if r["has_entries"]],
        },
        "team": {"new_profiles": no_team[:TEAM_NEW_PER_RUN], "to_verify": unverified[:TEAM_VERIFY_PER_RUN],
                 "waiting": max(0, len(no_team) - TEAM_NEW_PER_RUN)},
    }


def main():
    if "--json" in sys.argv:
        text = json.dumps(work_list(), ensure_ascii=False, indent=1) + "\n"
        if "--out" in sys.argv:
            path = sys.argv[sys.argv.index("--out") + 1]
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
            print("Work list written to %s" % path)
        else:
            sys.stdout.buffer.write(text.encode("utf-8"))
        return
    only_missing = "--missing" in sys.argv
    totals = {"run": 0, "prize": 0, "report": 0, "upcoming": 0, "entries": 0}
    lines = []
    for r in race_rows():
        totals["run"] += r["run"]
        totals["upcoming"] += r["upcoming"]
        totals["prize"] += r["run"] and r["has_prize"]
        totals["report"] += r["run"] and r["has_report"]
        totals["entries"] += r["upcoming"] and r["has_entries"]
        missing = []
        if r["run"] and not r["has_prize"]:
            missing.append("prize money")
        if r["run"] and not r["has_report"]:
            missing.append("race report")
        if r["upcoming"] and not r["has_entries"]:
            missing.append("entries")
        if not r["run"] and not r["upcoming"]:
            missing.append("results")
        if only_missing and not missing:
            continue
        tier = r["tier"] + (" (Major)" if r.get("major") else "")
        lines.append("%s  %-8s %-16s %-14s %-44s %s" % (
            r["startDate"], r["rid"], tier, r["distance"], r["name"][:44],
            "missing: " + ", ".join(missing) if missing else "complete"))
    text = "\n".join(lines) + "\n\nRaces run: %d (prize money %d, race report %d). Upcoming: %d (entries %d).\n" % (
        totals["run"], totals["prize"], totals["report"], totals["upcoming"], totals["entries"])
    sys.stdout.buffer.write(text.encode("utf-8", "replace"))


if __name__ == "__main__":
    main()
