"""Profiles of the athletes in focus -> data/athletes/{id}.json

Who gets a profile is decided by the yearly focus lists (scripts/update_focus.py).
Profiles are refreshed when older than the configured number of days, or when the
athlete has a newer qualifying result than the profile.
"""
import datetime
import glob
import os

import update_focus
import wa

ROAD_WORDS = ("marathon", "kilometres", "road", "mile")


def wanted(cfg):
    """athleteId -> (path to fetch, latest qualifying date, prominence: lower = more prominent).

    The athletes are those kept up to date by the yearly focus lists (update_focus.py):
    last season's final list plus everyone on this season's list. This season's athletes
    come first; those carried over from last season after them."""
    slugs = {}
    for f in glob.glob(os.path.join(wa.DATA, "results", "*.json")):
        for ev in wa.load_json(f)["events"]:
            for r in ev["results"]:
                if r.get("athleteId") and r.get("slug"):
                    slugs[r["athleteId"]] = r["slug"]
    out = {}
    for aid, info in update_focus.kept_up_to_date(cfg).items():
        slug = slugs.get(aid)
        dates = [r["date"] for r in info["reasons"] if r.get("date")]
        out[aid] = ("/athletes/" + slug if slug else "/athletes/athlete=" + aid,
                    max(dates) if dates else "",
                    update_focus.prominence(info["reasons"]) + (0 if info["current"] else 1000))
    return out


def slim_results(items, keys):
    return [dict((k, x.get(k)) for k in keys if x.get(k) not in (None, "", [])) for x in items or []]


def parse_representative(competitor):
    """The athlete's representative (manager) as World Athletics lists it.
    Only the name, country and business website are kept: no e-mail or phone."""
    rep = competitor.get("athleteRepresentative") or {}
    if not rep.get("name"):
        return None
    sites = rep.get("website") or []
    if isinstance(sites, str):
        sites = [sites]
    return {
        "name": rep["name"],
        "country": rep.get("countryName"),
        "website": sites[0] if sites else None,
    }


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
    representative = parse_representative(c)
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
        "representative": representative,
    }


def main():
    cfg = wa.config()
    today = wa.today_date()
    want = wanted(cfg)
    done = skipped = failed = 0
    refused = False
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
            refused = True
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
    return {"wanted": len(want), "fetched": done, "up_to_date": skipped,
            "waiting": len(queue) - done - failed, "failed": failed, "refused": refused}


if __name__ == "__main__":
    main()
