"""Show what has been gathered for each priority race, and what is still missing.

Usage: python scripts/status.py            every race
       python scripts/status.py --missing  only races with something missing
"""
import os
import sys

import wa


def main():
    only_missing = "--missing" in sys.argv
    cal = wa.load_json(os.path.join(wa.DATA, "calendar.json"))["races"]
    prize = wa.load_json(os.path.join(wa.ROOT, "config", "prize_money.json"), {"races": {}})["races"]
    today = wa.today()
    totals = {"run": 0, "prize": 0, "report": 0, "upcoming": 0, "entries": 0}
    lines = []
    for r in cal:
        rid = str(r["id"])
        run = os.path.exists(os.path.join(wa.DATA, "results", rid + ".json"))
        has_prize = rid in prize
        has_report = os.path.exists(os.path.join(wa.DATA, "reports", rid + ".json"))
        has_entries = os.path.exists(os.path.join(wa.DATA, "entries", rid + ".json"))
        upcoming = not run and r["endDate"] >= today
        totals["run"] += run
        totals["upcoming"] += upcoming
        totals["prize"] += run and has_prize
        totals["report"] += run and has_report
        totals["entries"] += upcoming and has_entries
        missing = []
        if run and not has_prize:
            missing.append("prize money")
        if run and not has_report:
            missing.append("race report")
        if upcoming and not has_entries:
            missing.append("entries")
        if not run and not upcoming:
            missing.append("results")
        if only_missing and not missing:
            continue
        tier = r["tier"] + (" (Major)" if r.get("major") else "")
        lines.append("%s  %-8s %-16s %-14s %-44s %s" % (
            r["startDate"], rid, tier, r["distance"], r["name"][:44],
            "missing: " + ", ".join(missing) if missing else "complete"))
    text = "\n".join(lines) + "\n\nRaces run: %d (prize money %d, race report %d). Upcoming: %d (entries %d).\n" % (
        totals["run"], totals["prize"], totals["report"], totals["upcoming"], totals["entries"])
    sys.stdout.buffer.write(text.encode("utf-8", "replace"))


if __name__ == "__main__":
    main()
