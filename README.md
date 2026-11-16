# Athletics tracker

A personal dashboard and weekly newsletter for following athletics. Phase 1 covers road
running: the season's Platinum and Gold label races, the World Marathon Majors and
championship road races. Data comes from the public World Athletics website.

## Use it on this PC

```
python scripts/update_all.py   # fetch new data and rebuild the site data
python scripts/serve.py        # open the dashboard at http://localhost:8765
```

Needs Python 3.7 or newer; no extra packages.

## What is where

| Path | Purpose |
|---|---|
| `config/races.json` | Season, label tiers to follow, Marathon Majors, extra races (by World Athletics event ID), limits |
| `scripts/wa.py` | Everything that knows how World Athletics pages are built |
| `scripts/fetch_*.py` | Calendar, race results, season top lists, athlete profiles → `data/` |
| `scripts/build_index.py` | Merges `data/` and `newsletters/` into `site/data/` |
| `site/` | The dashboard (static page) |
| `newsletters/` | One Markdown file per week |
| `scripts/send_telegram.py` | Sends a newsletter file to Telegram |
| `routine/newsletter_prompt.md` | Instructions for the weekly Claude run that writes the newsletter |
| `.github/workflows/` | Weekly data update and publishing; Telegram send when a newsletter is added |

## Things to know

- World Athletics has no official public data feed. The scripts read the same pages a
  browser does, slowly (one request per second). If the site changes, the fix belongs in
  `scripts/wa.py`.
- The site refuses bulk requests for athlete profiles. Profiles are therefore collected a
  few per run, most prominent athletes first, and a run stops as soon as the site
  declines a request. Athlete pages work without a profile, with less career detail.
- To follow a race outside the Platinum and Gold tiers, add it to `extra_races` in
  `config/races.json` with its World Athletics event ID (the number in its results URL).
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
- Seasons: `config/races.json` lists the seasons followed. Calendars and top lists are
  stored per season; a season is fetched from the October before it until the end of the
  following January. Earlier seasons stay in the repository and in the dashboard's
  season selector. See `docs/SPECIFICATION.md` and `docs/DATA_GATHERING.md`.
- Personal, non-commercial use. Every page links back to the World Athletics source.

## Publishing (one-time setup)

1. Create a repository on GitHub and push this folder to its `main` branch.
2. Repository Settings → Pages → Source: **GitHub Actions**.
3. Create a Telegram bot with @BotFather, send the bot any message, and add repository
   secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (Settings → Secrets and variables →
   Actions). Optionally add a repository variable `DASHBOARD_URL` with the Pages address.
4. Schedule a weekly Claude run that follows `routine/newsletter_prompt.md`.
