"""Season top lists (best mark per athlete) -> data/toplists/{distance}-{gender}.json"""
import os
import re

import wa

TOPLIST_PAGE = "/records/toplists/road-running/%s/outdoor/%s/senior/%s"


def parse_table(text):
    m = re.search(r"<table.*?</table>", text, re.S)
    if not m:
        return []
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(0), re.S):
        cells = dict((k.strip(), v) for k, v in re.findall(r'<td[^>]*data-th="([^"]*)"[^>]*>(.*?)</td>', tr, re.S))
        if "Mark" not in cells:
            continue
        href = re.search(r'href="([^"]+)"', cells.get("Competitor", ""))
        mark = wa.clean(cells["Mark"])
        rows.append({
            "rank": wa.clean(cells.get("Rank", "")),
            "mark": mark,
            "seconds": wa.mark_seconds(mark),
            "name": wa.clean(cells.get("Competitor", "")),
            "athleteId": wa.athlete_id(href.group(1)) if href else None,
            "birthDate": wa.clean(cells.get("DOB", "")),
            "nat": wa.clean(cells.get("Nat", "")),
            "pos": wa.clean(cells.get("Pos", "")),
            "venue": wa.clean(cells.get("Venue", "")),
            "date": wa.parse_date(wa.clean(cells.get("Date", ""))),
            "score": wa.clean(cells.get("Results Score", "")),
        })
    return rows


def main():
    cfg = wa.config()
    for distance, slug in cfg["toplists"].items():
        for gender in ("women", "men"):
            page = TOPLIST_PAGE % (slug, gender, cfg["season"])
            rows = parse_table(wa.fetch(page))
            if len(rows) < 10:
                raise RuntimeError("Top list %s %s has only %d rows - page changed?" % (distance, gender, len(rows)))
            wa.save_json(os.path.join(wa.DATA, "toplists", "%s-%s.json" % (distance, gender)), {
                "distance": distance,
                "gender": gender,
                "season": cfg["season"],
                "updated": wa.today(),
                "source": wa.BASE + page,
                "rows": rows,
            })
            lead = rows[0]
            print("%-14s %-6s %3d rows, leader %s %s" % (
                distance, gender, len(rows), lead["mark"], lead["name"].encode("ascii", "replace").decode()))


if __name__ == "__main__":
    main()
