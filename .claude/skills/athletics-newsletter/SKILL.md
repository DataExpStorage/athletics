---
name: athletics-newsletter
description: Pipeline stage. Writes the weekly newsletter (top results, news and stories, what's next) into newsletters/<week>.md, which the dashboard publishes in its Newsletter section. Uses only project data that has passed its checker. No web access. Run by the athletics-weekly skill.
argument-hint: "[week such as 2026-W47]"
context: fork
agent: athletics-writer
---

# Stage: write the newsletter

Arguments: `$ARGUMENTS` (the ISO week)

The reader is a knowledgeable athletics fan who is still learning the road running
scene. It is published in the Newsletter section of the dashboard, where every earlier
issue stays available. It should read in about three minutes.

## What you may use

1. `pipeline/runs/<week>/worklist.json`: today's date, the races of the last 7 days and
   the next 10 days.
2. The handoff records `pipeline/runs/<week>/<stage>.json` for `reports`, `prize-money`,
   `entries`, `team` and `news`. Read each one's `status`:
   - `passed` or `skipped`: you may use that kind of data;
   - `failed` or missing: that stage's new work was thrown away this week. Do not look for
     it; use only what was already in the repository, and say in your final report which
     section is thinner for it.
3. Data files:
   - results: `data/results/<raceId>.json` for each race of the last 7 days (top 20);
   - context for those results: `data/reports/<raceId>.json` (how the race was won,
     conditions, non-finishers) and `data/toplists/<season>/` (does a time enter the
     season's top 10?);
   - prize money: `config/prize_money.json`, when the race has an entry;
   - what's next: `data/calendar/` (every season file), and `data/entries/<raceId>.json`
     for races in the next 10 days, plus any entry file whose `history` has events dated
     in the last 7 days (new names, withdrawals with reasons);
   - news: `data/news/<week>.json`.

If `newsletters/<week>.md` already exists, stop and report that this week's issue is done.

## Format

Write `newsletters/<week>.md` exactly in this shape:

```
# Road running weekly: <date range, e.g. 16–22 Nov 2026>

<One or two sentences: the single most important thing that happened or is about to happen.>

## Top results
- **<Race>** (<label>, <city>): <women's winner, country, time>; <men's winner, country, time>. <One clause of context from the race report or the season list.>

## News and stories
- <One or two sentences.> [Source](<the item's source address>)

## What's next
- **<Race>**, <day and date> (<label>, <distance>): <who is entered and what to watch.> [Source](<address>)
```

## Rules

- Maximum 450 words. In a quiet week write less.
- Every result, time, place and name comes from the data files. Every news item and every
  entry change carries the `source` link from its data file, copied exactly.
- "What's next" leads with changes since last week: new names, and every withdrawal with
  its reason, as recorded.
- Give a newer fan the context in a few words (why a time matters, who an athlete is)
  when the data supports it; do not explain basics at length.
- A race of the last 7 days with no results file: say results were not available yet.
- A section with nothing: keep the heading and write "Nothing this week."
- If there were no priority races, say so in one line and give the room to news and the
  preview.
- In the first issue of January, add a short look back at the finished season from the
  data (Majors winners, fastest times).
- Plain, factual tone. No hype, no emoji. Only `#`/`##` headings, `-` bullets, `**bold**`
  and `[text](url)` links; no tables, images, nested bullets or HTML.

You may write only `newsletters/<week>.md` for the week you were given.
