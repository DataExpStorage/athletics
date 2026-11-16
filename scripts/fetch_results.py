"""Results of priority races already run -> data/results/{id}.json

A race is fetched until results are found; after that the stored file is kept.
Run with --force to refetch everything.
"""
import os
import sys

import wa

RESULTS_PAGE = "/competition/calendar-results/results/%s"


def parse_events(props, top_n):
    out = []
    data = props.get("calendarEventsResults") or {}
    for title in data.get("eventTitles") or []:
        for ev in title.get("events") or []:
            if ev.get("isRelay"):
                continue
            # the final is the last race listed; road races have one race only
            races = [r for r in (ev.get("races") or []) if r.get("results")]
            if not races:
                continue
            race = races[-1]
            rows = []
            for r in race["results"]:
                comp = r.get("competitor") or {}
                rows.append({
                    "place": (r.get("place") or "").rstrip("."),
                    "mark": r.get("mark"),
                    "name": comp.get("name"),
                    "nat": r.get("nationality"),
                    "athleteId": wa.athlete_id(comp.get("urlSlug")),
                    "slug": comp.get("urlSlug"),
                    "birthDate": comp.get("birthDate"),
                    "records": r.get("records") or "",
                    "remark": r.get("remark") or "",
                })
            out.append({
                "event": ev.get("event"),
                "eventId": ev.get("eventId"),
                "gender": ev.get("gender"),
                "distance": wa.distance_from_name(ev.get("event") or ""),
                "results": rows,
            })
    return out


def fetch_race(race, top_n):
    merged = {}
    order = []
    props = wa.page_props(wa.fetch(RESULTS_PAGE % race["id"]))
    days = ((props.get("calendarEventsResults") or {}).get("options") or {}).get("days") or []
    pages = [props]
    for d in days[1:]:  # multi-day championships
        pages.append(wa.page_props(wa.fetch((RESULTS_PAGE % race["id"]) + "?day=%s" % d.get("day"))))
    for i, p in enumerate(pages):
        for ev in parse_events(p, top_n):
            key = (ev["eventId"], ev["gender"])
            if key not in merged:
                merged[key] = dict(ev, _pages=set([i]), _groups=1)
                order.append(key)
            elif i not in merged[key]["_pages"]:
                continue  # same event repeated on another day's page
            else:
                # some races list the elite field and a second field separately
                merged[key]["results"] = merged[key]["results"] + ev["results"]
                merged[key]["_groups"] += 1
    events = []
    for key in order:
        ev = merged[key]
        rows = ev["results"]
        if ev.pop("_groups") > 1:
            timed = [r for r in rows if wa.mark_seconds(r["mark"]) is not None]
            timed.sort(key=lambda r: wa.mark_seconds(r["mark"]))
            for n, r in enumerate(timed):
                r["place"] = str(n + 1)
            rows = timed
        ev.pop("_pages")
        ev["finishers"] = len([r for r in rows if wa.mark_seconds(r["mark"]) is not None])
        ev["results"] = rows[:top_n]
        events.append(ev)
    return events


def main():
    force = "--force" in sys.argv
    cfg = wa.config()
    cal = wa.load_json(os.path.join(wa.DATA, "calendar.json"))
    today = wa.today()
    got = missing = kept = 0
    for race in cal["races"]:
        if race["startDate"] > today:
            continue
        path = os.path.join(wa.DATA, "results", "%s.json" % race["id"])
        if os.path.exists(path) and not force:
            kept += 1
            continue
        try:
            events = fetch_race(race, cfg["results_top_n"])
        except wa.Refused:
            raise
        except Exception as e:
            print("  ! %s: %s" % (race["name"].encode("ascii", "replace").decode(), e))
            events = []
        if not events:
            missing += 1
            print("  no results yet:", race["startDate"], race["name"].encode("ascii", "replace").decode())
            continue
        wa.save_json(path, {
            "id": race["id"],
            "fetched": today,
            "source": wa.BASE + RESULTS_PAGE % race["id"],
            "events": events,
        })
        got += 1
    print("Results: %d new, %d already stored, %d without results" % (got, kept, missing))


if __name__ == "__main__":
    main()
