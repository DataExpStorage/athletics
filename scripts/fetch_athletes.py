"""Profiles of the leading athletes -> data/athletes/{id}.json

Who gets a profile: top N of any priority race, or top M of a season list.
Profiles are refreshed when older than the configured number of days, or when
the athlete has a new result since the profile was fetched.
"""
import datetime
import glob
import os

import wa

ROAD_WORDS = ("marathon", "kilometres", "road", "mile")


def wanted(cfg):
    """athleteId -> (path to fetch, latest result date, prominence: lower = more prominent)"""
    out = {}

    def add(aid, slug, date, prominence):
        if not aid:
            return
        path = "/athletes/" + slug if slug else "/athletes/athlete=" + aid
        old = out.get(aid)
        out[aid] = (path if slug or not old else old[0],
                    max(date or "", old[1] if old else ""),
                    min(prominence, old[2] if old else 999))

    # only the active seasons decide who needs a (fresh) profile; older profiles are kept
    active = set(wa.active_seasons(cfg))
    cal = dict((r["id"], r) for r in wa.all_races() if r["season"] in active)
    for f in glob.glob(os.path.join(wa.DATA, "results", "*.json")):
        d = wa.load_json(f)
        race = cal.get(d["id"])
        if not race:
            continue
        offset = 0 if race.get("major") else 3 if race.get("tier") in ("Platinum", "Championship") else 6
        for ev in d["events"]:
            for n, r in enumerate(ev["results"][:cfg["athletes_from_race_top"]]):
                add(r["athleteId"], r.get("slug"), race.get("startDate", ""), n + offset)
    lists = []
    for season in active:
        lists += glob.glob(os.path.join(wa.DATA, "toplists", str(season), "*.json"))
    for f in lists:
        for n, r in enumerate(wa.load_json(f)["rows"][:cfg["athletes_from_toplist_top"]]):
            add(r["athleteId"], None, r.get("date"), n)
    return out


def slim_results(items, keys):
    return [dict((k, x.get(k)) for k in keys if x.get(k) not in (None, "", [])) for x in items or []]


def parse_profile(props):
    c = props.get("competitor") or {}
    b = c.get("basicData") or {}
    if not b.get("familyName") and not b.get("givenName"):
        return None
    pb_keys = ("discipline", "mark", "venue", "date", "resultScore", "indoor", "notLegal")
    pbs = slim_results((c.get("personalBests") or {}).get("results"), pb_keys)
    sbs = slim_results((c.get("seasonsBests") or {}).get("results"), pb_keys + ("competition", "listPosition"))
    season = []
    by_year = c.get("resultsByYear") or {}
    for ev in by_year.get("resultsByEvent") or []:
        for r in ev.get("results") or []:
            season.append({
                "discipline": ev.get("discipline"),
                "date": wa.parse_date(r.get("date") or ""),
                "competition": r.get("competition"),
                "country": r.get("country"),
                "category": r.get("category"),
                "race": r.get("race"),
                "place": (r.get("place") or "").rstrip("."),
                "mark": r.get("mark"),
                "score": r.get("resultScore"),
                "competitionId": r.get("competitionId"),
            })
    season.sort(key=lambda r: r["date"], reverse=True)
    progression = []
    for p in c.get("progressionOfSeasonsBests") or []:
        name = (p.get("discipline") or "").lower()
        if any(w in name for w in ROAD_WORDS):
            progression.append({
                "discipline": p.get("discipline"),
                "results": slim_results(p.get("results"), ("season", "mark", "venue", "date")),
            })
    honours = []
    for h in c.get("honours") or []:
        honours.append({
            "category": h.get("categoryName"),
            "results": slim_results(h.get("results"), ("place", "discipline", "competition", "mark", "date")),
        })
    rankings = slim_results((c.get("worldRankings") or {}).get("current"), ("eventGroup", "place", "rankingScore"))
    return {
        "id": str(c.get("_id") or b.get("aaId")),
        "givenName": b.get("givenName"),
        "familyName": b.get("familyName"),
        "country": b.get("countryCode"),
        "countryName": b.get("countryFullName"),
        "birthDate": wa.parse_date(b.get("birthDate") or ""),
        "male": b.get("male"),
        "personalBests": pbs,
        "seasonBests": sbs,
        "seasonYear": (by_year.get("parameters") or {}).get("resultsByYear"),
        "seasonResults": season,
        "roadProgression": progression,
        "honours": honours,
        "worldRankings": rankings,
    }


def main():
    cfg = wa.config()
    today = datetime.date.today()
    want = wanted(cfg)
    done = skipped = failed = 0
    # Profiles are fetched slowly and a few per run: the site refuses bulk requests.
    # Missing profiles come first (most prominent athletes first), then stale ones.
    wa.MIN_INTERVAL = cfg.get("athlete_request_interval_seconds", 6)
    queue = []
    for aid in want:
        path, last_result, prominence = want[aid]
        old = wa.load_json(os.path.join(wa.DATA, "athletes", "%s.json" % aid))
        if old:
            fetched = old.get("fetched", "")
            age = (today - datetime.date(*map(int, fetched.split("-")))).days if fetched else 999
            if age < cfg["athlete_refresh_days"] and last_result <= fetched:
                skipped += 1
                continue
        queue.append((1 if old else 0, prominence, aid))
    queue.sort()
    for _, _, aid in queue[:cfg["athlete_max_per_run"]]:
        path = want[aid][0]
        out = os.path.join(wa.DATA, "athletes", "%s.json" % aid)
        try:
            profile = parse_profile(wa.page_props(wa.fetch(path)))
        except wa.Refused as e:
            print("  Stopping: %s" % e)
            break
        except Exception as e:
            profile = None
            print("  ! athlete %s: %s" % (aid, e))
        if not profile:
            failed += 1
            continue
        profile["id"] = aid
        profile["fetched"] = today.isoformat()
        profile["source"] = wa.BASE + path
        wa.save_json(out, profile)
        done += 1
    print("Athletes: %d wanted, %d fetched now, %d up to date, %d still waiting, %d failed" % (
        len(want), done, skipped, len(queue) - done - failed, failed))


if __name__ == "__main__":
    main()
