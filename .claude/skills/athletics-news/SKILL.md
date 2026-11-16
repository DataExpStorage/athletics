---
name: athletics-news
description: Pipeline stage. Collects the week's news for the discipline (injuries, retirements, doping cases, selections, coaching and sponsor changes, notable results elsewhere) as sourced items in data/news/<week>.json, for the newsletter stage to use. Run by the athletics-weekly skill.
argument-hint: "[week such as 2026-W47] [discipline, default road-running]"
context: fork
agent: athletics-researcher
---

# Stage: the week's news

Arguments: `$ARGUMENTS` (the ISO week; optionally the discipline, default road running)

## What to do

1. Read `pipeline/runs/<week>/worklist.json` for today's date, the races of the last 7
   days and of the next 10 days.
2. Search the web for news from the **last 7 days** in the discipline:
   - injuries, illnesses, retirements, comebacks;
   - doping cases and sanctions (Athletics Integrity Unit);
   - national team selections; changes of allegiance;
   - coaching, agency or sponsor changes;
   - records and notable results at races that are **not** in the priority calendar;
   - announcements about the races of the next 10 days that are not about who is entered
     (course changes, prize money, broadcast, weather forecasts from the organiser).
   Prefer primary and specialist sources: World Athletics, race organisers, the AIU,
   national federations, LetsRun, Athletics Weekly, Runner's World, Citius Mag.
   Entry lists and withdrawals belong to another stage: do not collect them here.
3. Open each story's source. Keep at most 12 items, most important first.
4. Write `data/news/<week>.json`.

## The file

```json
{
 "week": "2026-W47",
 "checked": "<today>",
 "items": [
  {
   "headline": "ten words at most, your own",
   "summary": "one or two sentences in your own words: what happened and why it matters",
   "date": "2026-11-13",
   "reliability": "official",
   "source": "https://...",
   "athletes": ["Yomif KEJELCHA"],
   "races": [7235578]
  }
 ]
}
```

- `date` is when it happened or was announced. Leave out anything older than 7 days.
- One source per item: the best one you opened. If you could not open a page that
  confirms the story, leave the story out.
- `athletes`: names as World Athletics writes them, when the athlete appears in
  `data/results/` or `data/toplists/`; otherwise as the source writes them.
- `races`: ids from `data/calendar/` when the item concerns a priority race; else `[]`.
- A quiet week is fine: an empty `items` list is a valid result.

You may write only `data/news/<week>.json` for the week you were given.
