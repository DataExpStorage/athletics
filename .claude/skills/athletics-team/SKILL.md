---
name: athletics-team
description: Pipeline stage. Researches coach and shoe sponsor (and, where missing, agency) for athletes with profiles, and verifies earlier unverified entries, in data/team/<athleteId>.json. Run by the athletics-weekly skill, or alone for named athletes.
argument-hint: "[week such as 2026-W47, or athlete ids]"
context: fork
agent: athletics-researcher
---

# Stage: athlete teams (coach, manager, agency, shoe sponsor)

Arguments: `$ARGUMENTS`

## What to do

1. Find your work list. If the arguments name athlete ids, do those. Otherwise read
   `pipeline/runs/<week>/worklist.json`: `team.new_profiles` (athletes with a profile but
   no team file) and `team.to_verify` (existing files with unverified entries).
2. **New profiles.** For each athlete, read `data/athletes/<athleteId>.json`. Its
   `representative` field is the manager as World Athletics lists it; you do not research
   or record the manager. Research the **coach** and the **shoe sponsor**, then write
   `data/team/<athleteId>.json`. The model is `data/team/14833335.json`; the rules are in
   section 5 of `docs/DATA_GATHERING.md`.
3. **To verify.** For each file, open the `source` of every entry with
   `"verified": false`. If the page states the fact, set `verified` to `true`. If it does
   not, find a source that does, or correct the entry, or set `value` to `null` with a
   note. Set `checked` to today.
4. **Agencies.** If a profile's representative has no website and is not listed under
   `by_representative` in `config/agencies.json`, you may research which agency they work
   for and add it there with `agency`, `reliability`, `source` and `note`. Only add what a
   source states.

## The file

```json
{
 "athleteId": "14833335",
 "name": "Sabastian Kimaru SAWE",
 "checked": "<today>",
 "coach": {"value": "Claudio Berardelli", "reliability": "reported", "source": "https://...", "note": "optional", "verified": true},
 "shoe": {"value": "adidas", "reliability": "reported", "source": "https://...", "note": "optional", "verified": true}
}
```

- `athleteId` is the file name, digits only, no leading zero.
- `verified` is `true` only when you opened the source page and it states the fact.
- A brand an athlete was seen racing in is `unconfirmed` unless a source calls it their
  sponsor. Shoe deals change: prefer sources from the last two years and say so in the
  note when the source is older.
- Nothing found: `"value": null` with a `note` saying so (no `source` needed).
  Self-coached: `"value": null`, with the note and source saying so.
- Never infer a coach from a training group or a nationality.
- Spell names the same way every time; pages group athletes by name. Brands: adidas, Nike,
  ASICS, PUMA, New Balance, Under Armour, On, HOKA, Saucony, Brooks, Mizuno, Li-Ning,
  Xtep, 361°, Anta. Check `data/team/` for how a coach's name is already spelled.
- On a change (new coach, new sponsor), update the value and keep the previous one in the
  `note` with the date of the change.
- Add `manager` or `agency` to a team file only to record a conflict with World Athletics,
  and explain it in `manager_note`.

You may write only files matching `data/team/<number>.json`, and `config/agencies.json`
(its `by_representative` section only).
