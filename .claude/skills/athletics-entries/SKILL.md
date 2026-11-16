---
name: athletics-entries
description: Pipeline stage. Tracks announced elite fields and withdrawals (with reasons) for upcoming races in data/entries/<raceId>.json, keeping an append-only history. Run by the athletics-weekly skill, or alone for named races.
argument-hint: "[week such as 2026-W47, or race ids]"
context: fork
agent: athletics-researcher
---

# Stage: announced entries and withdrawals

Arguments: `$ARGUMENTS`

## What to do

1. Find your work list. If the arguments name race ids, do those. Otherwise read
   `pipeline/runs/<week>/worklist.json`: `entries.upcoming` (races in the next six weeks,
   nearest first) and `entries.just_run` (races run this week that have an entry list).
2. For each upcoming race, find who is announced and who has withdrawn. Look at the race's
   official website and press releases first, then World Athletics previews (recent ones
   are saved under `.cache/reports/`), the athlete's own verified social media for
   withdrawals, then major or specialist press.
3. Update `data/entries/<raceId>.json`, creating it if it does not exist. The model is
   `data/entries/7235578.json`; the full rules are in section 3 of
   `docs/DATA_GATHERING.md`.
4. For each race in `just_run`: compare the announced list with
   `data/results/<raceId>.json` (it holds the top 20 only). For an announced athlete who
   is missing and has no withdrawal recorded, search once for the reason and append a
   `withdrawn` event, or add to the file's `note` that they did not appear in the top 20,
   reason unknown.

## The file

```json
{
 "raceId": 7235578,
 "race": "the race name",
 "checked": "<today>",
 "note": "what is still missing, e.g. final start list not published yet",
 "entries": [
  {"name": "Yomif KEJELCHA", "nat": "ETH", "gender": "M", "pb": "1:59:41",
   "history": [
    {"date": "2026-07-02", "type": "announced", "reliability": "official", "note": "optional", "source": "https://..."},
    {"date": "2026-11-13", "type": "withdrawn", "reliability": "official",
     "reason": "Injury during his build-up; type not given.", "note": "optional", "source": "https://..."}
   ]}
 ]
}
```

## Rules that matter most

- **History is append-only.** Never delete, reorder or rewrite an existing event. Record
  every change by appending: `announced` (first time named), `confirmed` (named again in a
  newer source), `withdrawn`. If an athlete re-enters after withdrawing, append a new
  `announced` event; the withdrawal stays.
- `date` is when the announcement or withdrawal was made, not when you found it. If only
  the month is known, write `2026-08`.
- Every `withdrawn` event has a `reason` in the source's own terms (which injury, illness,
  visa, switched to another race). If none was given, write "No reason given." Never guess.
- When a better source confirms an entry, append a `confirmed` event with the better
  grade; do not edit the old event.
- `pb` is the athlete's best at the race distance, or "debut".
- Set `checked` to today on every file you review, even when nothing changed.

You may write only files matching `data/entries/<number>.json`.
