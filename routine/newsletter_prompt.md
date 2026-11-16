# Weekly road running newsletter

You are writing this week's issue of a personal road running newsletter. The reader is a
knowledgeable athletics fan who is still learning the road running scene. It is delivered to
Telegram, so it must be short enough to read on a phone in about three minutes.

## Steps

1. Work in this repository. Pull the latest `main` first.
2. Work out the ISO week of today's date (for example `2026-W47`). If
   `newsletters/<week>.md` already exists, stop: this week's issue is done.
3. Read `data/calendar.json` (the season's priority races: Platinum and Gold label races,
   championships; `major: true` marks the World Marathon Majors).
4. For every race whose `startDate` falls in the last 7 days, read `data/results/<id>.json`
   (top 20 women and men). If a race in that window has no results file, say results were
   not available yet rather than guessing.
5. Find the races whose `startDate` falls in the next 10 days.
6. Read the six files in `data/toplists/` to see whether any of last week's marks entered
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
9. Write `newsletters/<week>.md` in the format below.
10. Commit the newsletter (and `config/prize_money.json` if you changed it) with the
   message `Newsletter <week>` and push to `main`.
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
