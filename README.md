# Athletics tracker

A personal dashboard and weekly newsletter for following athletics. Phase 1 covers road
running: the season's Platinum and Gold label races, the World Marathon Majors,
championship road races and 15 consistently fast "extra" races. Data comes from the public World Athletics website.

## Use it on this PC

```
python scripts/update_all.py   # fetch new data and rebuild the site data
python scripts/serve.py        # open the dashboard at http://localhost:8765
```

Needs Python 3.7 or newer; no extra packages.

## What is where

| Path | Purpose |
|---|---|
| `config/disciplines/road-running.json` | Season, label tiers to follow, Marathon Majors, extra races (by World Athletics event ID), limits |
| `scripts/wa.py` | Everything that knows how World Athletics pages are built |
| `scripts/fetch_*.py` | Calendar, race results, season top lists, athlete profiles → `data/` |
| `scripts/build_index.py` | Merges `data/` and `newsletters/` into `site/data/` |
| `site/` | The dashboard (static page) |
| `newsletters/` | One Markdown file per week; all of them are shown in the dashboard's Newsletter section |
| `routine/newsletter_prompt.md` | Instructions for the weekly Claude run that writes the newsletter |
| `.github/workflows/` | Weekly data update and publishing of the dashboard |

## Things to know

- World Athletics has no official public data feed. The scripts read the same pages a
  browser does, slowly (one request per second). If the site changes, the fix belongs in
  `scripts/wa.py`.
- The site refuses bulk requests for athlete profiles. Profiles are collected in small
  batches (12, twice a day) for the **athletes in focus**: a yearly list of top finishers
  of the priority races and leaders of the season lists who beat last year's 20th mark
  (`data/focus/<season>.json`, built by `scripts/update_focus.py`). The list grows during
  the year, is reduced to a final list at the end of it, and that final list is kept up
  to date for one more year. `python scripts/profile_batch.py --log` shows how the
  batches went; a profile that is no longer refreshed is marked as such.
- To follow a race outside the Platinum and Gold tiers, add it to `extra_races` in
  `config/disciplines/road-running.json` with its World Athletics event ID (the number in its results URL).
- Prize money is not published by World Athletics. It is entered by hand in
  `config/prize_money.json` from organisers and press, with sources and a reliability
  grade. Season totals per athlete count only races that have an entry, and never include
  appearance fees or sponsor bonuses.
- Announced entries and withdrawals live in `data/entries/<raceId>.json`, one record per
  athlete with an append-only history (announced, confirmed, withdrawn with reason), each
  event graded official / reported / unconfirmed with its source. They are researched by
  the weekly Claude run, not fetched automatically. The site shows them on the Running
  next page, on each race page and on each athlete's page.
- Race reports: `data/reports/<raceId>.json` holds a short summary, written in our own
  words, of the World Athletics race report: weather, how each race was won, notes on
  key athletes and notable non-finishers. `scripts/fetch_reports.py` saves the report
  texts to the local cache for reading; the texts themselves are never committed.
- Seasons: `config/disciplines/road-running.json` lists the seasons followed. Calendars and top lists are
  stored per season; a season is fetched from the October before it until the end of the
  following January. Earlier seasons stay in the repository and in the dashboard's
  season selector. See `docs/SPECIFICATION.md` and `docs/DATA_GATHERING.md`.
- Personal, non-commercial use. Every page links back to the World Athletics source.

## The weekly pipeline

The weekly work runs as eight stages, each a skill in `.claude/skills/` with a checker
after it: fetch, reports, prize-money, entries, team, news, newsletter, publish. In
Claude Code, run `/athletics-weekly` in this folder. A single stage can be run alone, for
example `/athletics-reports 7235563`. See section 9 of `docs/SPECIFICATION.md`.

- `python scripts/check_stage.py summary` shows the state of this week's run.
- `python scripts/validate.py` checks every researched and fetched file.
- Stages, their permitted files and checks: `pipeline/stages.json`.

## Publishing (one-time setup)

1. Create a repository on GitHub and push this folder to its `main` branch.
2. Repository Settings → Pages → Source: **GitHub Actions**.
3. Schedule a weekly Claude run that follows `routine/newsletter_prompt.md`. Give it
   access to this one repository only, with permission to write contents but **not** to
   change workflows.

## Safety of the automation

- The researched files (prize money, entries, reports, teams, newsletters) are treated as
  untrusted input. `scripts/validate.py` checks them, and the site is not built unless
  they pass.
- No secrets are used anywhere: the project sends nothing and logs in to nothing. The
  newsletter is simply a page of the dashboard.
- The dashboard only follows `http(s)` links from data and has a content security policy,
  so data cannot run scripts in the browser.
