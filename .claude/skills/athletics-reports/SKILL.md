---
name: athletics-reports
description: Pipeline stage. Summarises World Athletics race reports (weather, how each race was won, key athletes, non-finishers) into data/reports/<raceId>.json. Run by the athletics-weekly skill, or alone for named races.
argument-hint: "[week such as 2026-W47, or race ids]"
context: fork
agent: athletics-researcher
---

# Stage: race reports

Arguments: `$ARGUMENTS`

## What to do

1. Find your work list. If the arguments name race ids, do those races. Otherwise read
   `pipeline/runs/<week>/worklist.json` for the week in the arguments and take
   `reports.this_week` first, then `reports.backlog`. If both are empty, write nothing
   and report "nothing to do".
2. For each race, find the World Athletics race report:
   - recent reports may be saved as text under `.cache/reports/` (one file per article;
     the first lines give the title, kind, date and address). In the weekly cloud run
     this folder does not exist;
   - otherwise search `worldathletics.org` for the report and open it. Reports sit under
     `/news/report/<slug>` or `/competitions/world-athletics-label-road-races/news/<slug>`;
   - a smaller race may only have a short item inside a bigger race's report from the
     same weekend. That is enough for a short summary: say so in `title`.
   If World Athletics published nothing, write no file for that race.
3. Read the race's stored results in `data/results/<raceId>.json` so that names, places
   and times in your summary agree with them.
4. Write `data/reports/<raceId>.json`. The model to copy is `data/reports/7235563.json`;
   the full rules are in section 4 of `docs/DATA_GATHERING.md`.

## The file

```json
{
 "raceId": 7235563,
 "title": "the report's headline",
 "source": "https://worldathletics.org/...",
 "published": "2026-10-11",
 "written": "<today>",
 "weather": null,
 "story": {"W": "two to four sentences", "M": "two to four sentences"},
 "performances": [{"name": "Jacob KIPLIMO", "gender": "M", "note": "what he did in the race"}],
 "dnf": [{"name": "Selemon BAREGA", "gender": "M", "note": "context; the reason, or 'no reason given'"}]
}
```

- `weather`: only what the report says about conditions (temperature, humidity, wind,
  rain, course difficulty). `null` if it says nothing. Never add weather from elsewhere.
- `story`: how each race was won: who led, where the decisive move came, the margin.
- `performances`: one note per key athlete on what they did. Include favourites and
  defending champions who underperformed. An athlete who finished but faded goes here.
- `dnf`: only notable athletes the report says did not finish.
- Names exactly as in `data/results/<raceId>.json` when the athlete is in it; if the
  report uses a different name, add `"athleteId"` from the results and say so in the note.
- Your own words, short. Only what the report states.

You may write only files matching `data/reports/<number>.json`.
