---
name: athletics-prize-money
description: Pipeline stage. Researches this year's prize money for races and records it in config/prize_money.json with sources and a confidence grade. Run by the athletics-weekly skill, or alone for named races.
argument-hint: "[week such as 2026-W47, or race ids]"
context: fork
agent: athletics-researcher
---

# Stage: prize money

Arguments: `$ARGUMENTS`

## What to do

1. Find your work list. If the arguments name race ids, do those. Otherwise read
   `pipeline/runs/<week>/worklist.json` and take `prize-money.this_week` first, then
   `prize-money.backlog`. If both are empty, change nothing and report "nothing to do".
2. For each race look for **this year's** prize table, in this order: the race's official
   website, media guide or elite regulations; the organiser's press releases; major or
   specialist press around race day; aggregator "prize money breakdown" sites only as a
   last resort.
3. Add one entry per race under `races` in `config/prize_money.json`, keyed by the race
   id, in the same shape as the existing entries. The file's `_about` field and section 2
   of `docs/DATA_GATHERING.md` explain every field. Do not change existing entries unless
   you are completing or correcting them from a better source, and say so in your report.

## The entry

```json
"7235564": {
 "name": "TCS New York City Marathon",
 "currency": "USD",
 "places": [100000, 60000, 40000],
 "places_note": "optional: what is missing or unusual",
 "bonus_rules": "Course record $50,000 (winner only).",
 "awarded_bonuses": [{"gender": "M", "place": 1, "amount": 50000, "note": "Course record bonus (reported)"}],
 "confidence": "high",
 "checked": "<today>",
 "sources": ["https://..."]
}
```

- `currency`: a three-letter code that already has a rate in `usd_rates`. If the race pays
  in a currency that is not listed, leave the race out and say so in your report.
- `places`: open-division place prizes from first place down, as many as published. If
  women and men differ: `{"W": [...], "M": [...]}`.
- `awarded_bonuses`: only bonuses a source reports as actually paid or earned.
- `confidence`: `high` = official source or several agreeing sources; `medium` = one
  source; `low` = partial or conflicting.
- Never included: appearance fees, sponsor bonuses, national-division or masters prizes,
  series jackpots.
- If sources conflict and no official source settles it, do not enter the race. If only
  some places are known, enter those and say so in `places_note`.
- Never copy an earlier year's table. A race with several events (a championship) does
  not fit this format: leave it out.

You may change only `config/prize_money.json`, and in it only the `races` section.
