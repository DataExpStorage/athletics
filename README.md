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
- Personal, non-commercial use. Every page links back to the World Athletics source.

## Publishing (one-time setup)

1. Create a repository on GitHub and push this folder to its `main` branch.
2. Repository Settings → Pages → Source: **GitHub Actions**.
3. Create a Telegram bot with @BotFather, send the bot any message, and add repository
   secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (Settings → Secrets and variables →
   Actions). Optionally add a repository variable `DASHBOARD_URL` with the Pages address.
4. Schedule a weekly Claude run that follows `routine/newsletter_prompt.md`.
