# Weekly road running newsletter

You are writing this week's issue of a personal road running newsletter. The reader is a
knowledgeable athletics fan who is still learning the road running scene. It is delivered to
Telegram, so it must be short enough to read on a phone in about three minutes.

## Steps

1. Work in this repository. Pull the latest `main` first.
2. Work out the ISO week of today's date (for example `2026-W47`). If
   `newsletters/<week>.md` already exists, stop: this week's issue is done.
3. Read every file in `data/calendar/` (one per season, named by year; a week around New
   Year spans two of them). They hold the priority races: Platinum and Gold label races,
   championships; `major: true` marks the World Marathon Majors).
4. For every race whose `startDate` falls in the last 7 days, read `data/results/<id>.json`
   (top 20 women and men). If a race in that window has no results file, say results were
   not available yet rather than guessing.
5. Find the races whose `startDate` falls in the next 10 days.
6. Read the files in `data/toplists/<season>/` for the season each race belongs to, to see whether any of last week's marks entered
   the season's top 10 at marathon, half marathon or 10 km.
7. Search the web for road running news from the last 7 days: start lists and withdrawals
   for the upcoming races, injuries, retirements, doping cases (Athletics Integrity Unit),
   national selections, coaching or sponsor changes, and records at races outside the
   priority list. Prefer primary and specialist sources (World Athletics, race organisers,
   the AIU, LetsRun, Runner's World, Athletics Weekly, Citius Mag, national federations).
8. Prize money: for each race from step 4 that has no entry in `config/prize_money.json`,
   search for its prize money for this year's edition (organiser's site first, then
   press). If you find place-by-place amounts in a source you opened, add an entry in the
   same shape as the existing ones (`_about` in that file explains the fields): currency,
   `places`, `bonus_rules`, `awarded_bonuses` only for bonuses reported as actually paid,
   `confidence`, `checked` (today), `sources`. Use figures for this year only; never copy
   an earlier year's table or estimate. If nothing reliable turns up, add nothing.
   You may mention the winner's prize in the newsletter when it is in that file.
9. Announced entries: for every race in `data/calendar/` (any season) starting in the next 6 weeks,
   check who is announced to run and who has withdrawn, and update
   `data/entries/<raceId>.json` (create it if missing; `data/entries/7235578.json` is the
   model). Look at the race's official website and press releases first, then major and
   specialist news outlets. Rules:
   - One record per athlete with `name` (as World Athletics writes it: given name, then
     FAMILY NAME in capitals), `nat`, `gender` (`W`/`M`), `pb`, and a `history` list.
   - Never delete or rewrite a history event. Record each change by appending an event:
     `announced` (first time named), `confirmed` (named again in a newer source), or
     `withdrawn`. Each event has `date` (when it was announced, not when you found it),
     `reliability`, `source` (a page you opened) and an optional `note`.
   - A `withdrawn` event must carry a `reason` in the source's own terms (injury and which,
     illness, visa, switched to another race, not stated). If no reason was given, write
     "No reason given." Never guess. If the athlete later re-enters, append a new
     `announced` event; the withdrawal stays in the history.
   - `reliability`: `official` = the race organiser or the athlete themself (statement,
     verified social media account); `reported` = a major or specialist news outlet;
     `unconfirmed` = a single secondary source, an aggregator, or a rumour. When a better
     source confirms an entry, append a `confirmed` event with the better grade.
   - Set `checked` to today even when nothing changed. Use `note` for what is still
     missing (for example "final start list not published yet").
   - After a race is run, compare the announced list with the results: for an announced
     athlete who is not in the results and has no withdrawal recorded, search once for
     the reason and record a `withdrawn` event (or leave a `note` that they did not
     start, reason unknown).
   In the newsletter's "What's next" section, lead with changes since last week: new
   names, and every withdrawal with its reason.
   Race reports: for each race from step 4 with no file in `data/reports/`, find the World
   Athletics race report (run `python scripts/fetch_reports.py`, which lists the recent
   reports and saves their text under `.cache/reports/`; if that fails, search
   worldathletics.org for the report and open it). Write `data/reports/<raceId>.json` in
   the shape of `data/reports/7235563.json`:
   - `weather`: what the report says about conditions (temperature, humidity, wind,
     rain, course difficulty). `null` if the report says nothing; never fill it in from
     elsewhere or from memory.
   - `story`: for women (`W`) and men (`M`), two to four sentences on how the race was
     won: who led, where the decisive move came, the margin.
   - `performances`: one note per key athlete saying what they did in the race (led from
     the start, attacked at 30 km, outsprinted a rival, faded after an injury, debut,
     record). Include favourites and defending champions who underperformed.
   - `dnf`: notable athletes the report says did not finish, with the reason if given,
     otherwise "no reason given".
   - Use each athlete's name exactly as it appears in `data/results/<raceId>.json` when
     they are in it; if the report uses a different name, say so in the note.
   - Write in your own words and keep it short; do not copy sentences from the report.
     Only state what the report states. Set `source` to the report's URL.
   If World Athletics published no report for a race, write no file. A short item inside
   another race's report is enough for a short summary; say so in `title`.
10. Write `newsletters/<week>.md` in the format below. Use the race reports for the
   "Top results" context (how the race was won, conditions, notable non-finishers).
11. Commit the newsletter, `data/entries/`, `data/reports/` and `config/prize_money.json` (if changed) with
   the message `Newsletter <week>` and push to `main`.
   Pushing sends it to Telegram automatically; do not send it any other way.

## Format

Use only this Markdown: `#`/`##` headings, `-` bullets, `**bold**`, and `[text](url)` links.
No tables, no images, no nested bullets.

```
# Road running weekly: <date range, e.g. 16–22 Nov 2026>

<One or two sentences: the single most important thing that happened or is about to happen.>

## Top results
- **<Race>** (<label>, <city>): <women's winner, country, time>; <men's winner, country, time>. <One clause of context: record, season rank, upset, margin.>

## News and stories
- <One or two sentences.> [Source](url)

## What's next
- **<Race>**, <day and date> (<label>, <distance>): <who is entered and what to watch, if known.> [Source](url)
```

## Seasons

- The repository holds every season side by side. Never delete or overwrite an earlier
  season's files.
- If `data/calendar/` has no file for a year whose January is less than six weeks away,
  World Athletics has not published that season's label races yet. Say so in "What's
  next", and for well-known January races (for example Xiamen, Houston, Osaka Women's,
  Mumbai, Hong Kong) report announced fields in the newsletter from organiser sources
  without creating entry files, because the races have no World Athletics id yet.
- In the first issue of January, add a short look back at the finished season (Majors
  winners, fastest times, records) from the repository data.

## Rules

- Results come from the repository data. Never state a time, place or name from memory.
- Every news item needs a source link you actually opened. If you could not confirm a
  story, leave it out.
- Give context a newer fan needs in a few words (for example why a time matters, or who
  an athlete is), without explaining basics at length.
- Maximum 450 words. In a quiet week write less; if there were no priority races, say so
  in one line and give more room to news and the preview.
- If a section has nothing, keep the heading and write "Nothing this week."
- Plain, factual tone. No hype, no emoji.
