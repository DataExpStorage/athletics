"""World Athletics race reports and previews for road races -> .cache/reports/{slug}.txt

The label road races page carries its recent news articles in full. This script saves
them as plain text for reading; they are World Athletics' copyright, so they stay in the
local cache and are never committed or published. The summaries written from them go in
data/reports/{raceId}.json (see routine/newsletter_prompt.md).

Usage: python scripts/fetch_reports.py          list articles and save new ones
       python scripts/fetch_reports.py --cached use the last downloaded page, no request
"""
import hashlib
import os
import sys

import wa

LABEL_PAGE = "/competitions/world-athletics-label-road-races"
OUT = os.path.join(wa.CACHE, "reports")
KIND = {2: "preview", 3: "report"}


def main():
    if "--cached" in sys.argv:
        path = os.path.join(wa.CACHE, hashlib.sha1((wa.BASE + LABEL_PAGE).encode()).hexdigest() + ".html")
        with open(path, encoding="utf-8") as f:
            text = f.read()
    else:
        text = wa.fetch(LABEL_PAGE, max_age_hours=6)
    props = wa.page_props(text)
    os.makedirs(OUT, exist_ok=True)
    seen = set()
    for art in (props.get("carouselArticles") or []) + (props.get("moreNewsArticles") or []):
        slug = art.get("urlSlug")
        if not slug or slug in seen:
            continue
        seen.add(slug)
        try:
            kind = KIND.get(int(art.get("articleType") or 0), "news")
        except (TypeError, ValueError):
            kind = "news"
        paragraphs = [wa.clean(p) for p in (art.get("body") or "").split("</p>")]
        body = "\n\n".join(p for p in paragraphs if p)
        url = "%s/news/%s/%s" % (wa.BASE, kind if kind != "news" else "news", slug)
        target = os.path.join(OUT, slug + ".txt")
        new = not os.path.exists(target)
        with open(target, "w", encoding="utf-8") as f:
            f.write("%s\n%s | %s | %s\n\n%s\n" % (art.get("title"), kind, str(art.get("liveFrom") or "")[:10], url, body))
        print("%-8s %s %s  %s" % (kind, "NEW" if new else "   ", slug, url))


if __name__ == "__main__":
    main()
