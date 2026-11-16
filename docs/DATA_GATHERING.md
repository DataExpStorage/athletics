# Athletics Tracker: data gathering specification

Version of 16 November 2026. The project continues into 2027 and later seasons, and so
does this work (section 6). Specifies the four kinds of data that cannot be fetched
automatically and have to be researched: **prize money**, **announced elite fields and
withdrawals**, **race reports**, and **athlete teams** (coach, manager, agency, shoe
sponsor; section 5). It defines what to collect, from where, in what
format, to what standard, and what is still outstanding.

The overall project is described in [SPECIFICATION.md](SPECIFICATION.md). Each kind of
data is gathered by its own pipeline stage, a skill under `.claude/skills/`
(`athletics-prize-money`, `athletics-entries`, `athletics-reports`, `athletics-team`,
and `athletics-news` for the week's news). The skills are the operational short form of
this document; if a skill and this document disagree, this document is right and the
skill should be corrected. Every stage's output is checked by `scripts/check_stage.py`
and the `athletics-check` reviewer before the next stage uses it.

## 1. Principles for all four

1. **Only what a source states.** Never fill a gap from memory, from an earlier year, or
   by estimate. Missing is recorded as missing.
2. **Every fact has a source that was actually opened.** A search-result summary is not
   a source; open the page.
3. **This year's edition only.** Prize tables, fields and reports from earlier years are
   not carried over.
4. **Grade the reliability** using the scales below, and record the date checked.
5. **History is never deleted.** Corrections are made by adding, not by overwriting,
   wherever the format has a history.
6. **Names as World Athletics writes them** in `data/results/<raceId>.json` or the top
   lists (given name, then FAMILY NAME in capitals). When a source uses a different
   name, keep the World Athletics name, add `athleteId`, and mention the other name in
   the note.
7. **Summaries in our own words.** Do not copy sentences from articles. Short quotes
   from an athlete are acceptable when they carry the reason for something.
8. After any change, run `python scripts/build_index.py` and check the affected race and
   athlete pages. `python scripts/status.py --missing` shows what is outstanding.

Source ranking, used throughout:

| Grade | Meaning | Examples |
|---|---|---|
| Official | The race organiser, World Athletics, or the athlete themself | Race website, organiser press release, official guidebook, athlete's verified social media |
| Reported | A major or specialist news outlet | World Athletics news, LetsRun, Athletics Weekly, Runner's World, Citius Mag, Marathon Handbook, national press |
| Unconfirmed | One secondary source, an aggregator, a betting or content-farm site, a forum, a rumour | |

## 2. Prize money

### What to collect

For each priority race, for this year's edition:

- place-by-place prizes for the open (elite) division, as many places as published;
- whether women and men are paid the same;
- the bonus rules (course record, world record, time bonuses);
- bonuses reported as actually paid after the race;
- currency.

Never included: appearance fees, sponsor or shoe-company bonuses, national-division or
masters prizes, series prizes (for example the Marathon Majors series jackpot).

### Where to look

1. The race's official website, media guide, elite athlete regulations or guidebook.
2. The organiser's press releases.
3. Major or specialist press published around race day.
4. Aggregator "prize money breakdown" sites only as a last resort, graded low.

### Format: `config/prize_money.json`, one entry per race under `races`

```json
"7235564": {
 "name": "TCS New York City Marathon",
 "currency": "USD",
 "places": [100000, 60000, 40000, 25000, 15000, 10000, 7500, 5000, 2500, 2000],
 "places_note": "optional: what is missing or unusual",
 "bonus_rules": "Course record $50,000 (winner only).",
 "awarded_bonuses": [
  {"gender": "M", "place": 1, "amount": 50000, "note": "Course record bonus (reported)"}
 ],
 "confidence": "high",
 "checked": "2026-11-16",
 "sources": ["https://..."]
}
```

- `places` is a list from first place down. If women and men differ, use
  `{"W": [...], "M": [...]}`.
- `awarded_bonuses` only for bonuses a source reports as paid or earned; identify the
  athlete by gender and finishing place.
- `confidence`: `high` = official source or several agreeing sources; `medium` = one
  source; `low` = partial or conflicting.
- A currency not yet in `usd_rates` needs a rate added there. Rates are fixed
  approximations used only for season totals.

### Rules

- If sources conflict and no official source settles it, do not enter the race; note the
  conflict in section 7 of this document.
- If only some places are known, enter those and say so in `places_note`.
- Multi-event championships: not supported by the current format (one prize table per
  race). Leave out until the format is extended.

### Current state

Entered: Tokyo (high), London (high), New York (high), Chicago (medium, places 1–5),
Berlin (medium, one source), Boston (low, places 1–3 only).

To improve: Boston needs places 4 and lower and a source that could be opened; Chicago
needs places 6–10 if paid; Berlin needs a second source and its bonus rules; London's
$300,000 bonus for the winner is a press estimate.

Unresolved: Sydney. Sources disagree on the international elite prizes (one gives
AUD 100,000 for the win, another calls the figures unconfirmed).

## 3. Announced elite fields and withdrawals

### What to collect

For each priority race from six weeks before race day until the results are in:

- every elite athlete announced to run, with nationality, gender and best time at the
  distance ("debut" if it is their first);
- every change: new names, re-confirmations in newer sources, and **every withdrawal
  with its reason**;
- after the race: announced athletes who did not start, and why.

### Where to look

1. The race's official website and press releases (elite field announcements usually
   come in two or three waves, with a final start list in race week).
2. World Athletics previews.
3. The athlete's own verified social media for withdrawals.
4. Major or specialist press.

### Format: `data/entries/<raceId>.json`

```json
{
 "raceId": 7235578,
 "race": "Maratón Valencia Trinidad Alfonso Zurich",
 "checked": "2026-11-16",
 "note": "what is still missing, e.g. final start list not published yet",
 "entries": [
  {"name": "Yomif KEJELCHA", "nat": "ETH", "gender": "M", "pb": "1:59:41",
   "athleteId": "optional",
   "history": [
    {"date": "2026-07-02", "type": "announced", "reliability": "official",
     "note": "optional", "source": "https://..."},
    {"date": "2026-11-13", "type": "withdrawn", "reliability": "official",
     "reason": "Injury during his build-up; type not given.",
     "note": "optional detail or short quote", "source": "https://..."}
   ]}
 ]
}
```

Event types: `announced` (first time named), `confirmed` (named again in a newer
source), `withdrawn`. The current status is taken from the latest event. The reliability
shown for a starter is the best grade among the events since their last withdrawal.

### Rules

- `date` is when the announcement or withdrawal was made, not when it was found. If only
  the month is known, write `2026-08`.
- Never delete or rewrite an event. If an athlete re-enters after withdrawing, append a
  new `announced` event.
- A `withdrawn` event must have a `reason` in the source's terms: the injury and which,
  illness, visa, switched to another race. If none was given, write "No reason given."
- When a better source confirms an entry, append a `confirmed` event with the better
  grade rather than changing the old one.
- Set `checked` to today's date on every review, even when nothing changed.
- A known withdrawal is worth recording even when the full field was never tracked (as
  for Sawe and Berlin 2026); say so in `note`.
- After the race, compare the list with `data/results/<raceId>.json`. For an announced
  athlete not in the results with no withdrawal recorded, search once for the reason and
  record it, or note that they did not start, reason unknown. Bear in mind the results
  hold only the top 20.

### Current state

- Valencia Marathon (6 Dec): 15 athletes announced, one withdrawn (Kejelcha, 13 Nov,
  injury). Six of the women were last confirmed in the July list. The organisers
  promised a complete line-up in October and it has not been found. Agnes Jebet Ngetich
  is graded Reported; the original announcement of her debut has not been found.
- Berlin Marathon (27 Sep, run): Sawe's withdrawal only.
- The other eleven upcoming races have no file yet.

## 4. Race reports

### What to collect

From the World Athletics race report for each priority race:

- **weather and conditions** as stated (temperature, humidity, wind, rain, course
  difficulty);
- **how each race was won**: who led, where the decisive move came, the margin;
- **a note per key athlete** on what they did: led from the start, attacked at a given
  point, outsprinted a rival, faded after an injury, debut, record. Include favourites
  and defending champions who underperformed;
- **notable athletes who did not finish**, with the reason if given.

### Where to look

1. `python scripts/fetch_reports.py` lists the most recent World Athletics road reports
   and saves their text under `.cache/reports/` (not committed: the text is World
   Athletics' copyright).
2. For older races, search worldathletics.org for the report. Reports sit under
   `/news/report/<slug>` or `/competitions/world-athletics-label-road-races/news/<slug>`.
   Only the latest dozen are listed on the site, so older ones are found by search.
3. Smaller races often get only a short item inside a bigger race's report from the same
   weekend. That is enough for a short summary; say so in `title`.
4. If World Athletics published nothing, write no file. Organiser or press reports may be
   used instead only if the file's `title` and `source` make clear it is not a World
   Athletics report.

### Format: `data/reports/<raceId>.json`

```json
{
 "raceId": 7235563,
 "title": "Feysa and Kipruto triumph in swift Chicago races",
 "source": "https://worldathletics.org/news/report/...",
 "published": "2026-10-11",
 "written": "2026-11-16",
 "weather": null,
 "story": {"W": "two to four sentences", "M": "two to four sentences"},
 "performances": [
  {"name": "Jacob KIPLIMO", "gender": "M", "note": "what he did in the race"}
 ],
 "dnf": [
  {"name": "Selemon BAREGA", "gender": "M", "note": "context; reason or 'no reason given'"}
 ]
}
```

### Rules

- `weather` is `null` when the report says nothing. Do not add weather from other
  sources unless a separate field is introduced for it (see section 7).
- An athlete who finished but dropped out of contention goes in `performances`, not
  `dnf`.
- Reports use everyday names that can differ from World Athletics' result names (for
  example "Tadese Bikila" for Tadese TAKELE, "Alexander Mutiso Munyao" for Alexander
  MUNYAO). Use the results name, add `athleteId`, and mention the report's name in the
  note.
- After building, check that every named athlete was matched: unmatched names are not
  linked and do not appear on any profile.

### Current state

Summarised: Tokyo, Boston, London, Sydney, Berlin, Chicago, Amsterdam, Valencia Half,
New York, Hong Kong-Zhuhai-Macao Bridge Half (full reports); Beijing, Delhi, Ljubljana
(short items inside the Amsterdam report).

Of these thirteen, only three reports mention the weather and only two name
non-finishers, none with a reason.

## 5. Athlete teams: coach, manager, agency, shoe sponsor

### What to collect

For every athlete with a profile in the tracker, and for each new profile as it arrives:
the current **coach**, **manager**, **agency** and **shoe sponsor**.

### Where it comes from

| Item | Source | How |
|---|---|---|
| Manager | The athlete's World Athletics profile lists an "athlete representative" | Automatic, stored with the profile (name, country and business website only; contact details are never stored). Graded Official |
| Agency | The website World Athletics lists for the representative, mapped to an agency name in `config/agencies.json` (`by_website`) | Automatic once the website is in the map. For a representative with no website, research the agency once and add it under `by_representative` with a grade and source; it then applies to all their athletes |
| Coach | Organiser, agency and brand pages; interviews; specialist press | Researched |
| Shoe sponsor | The brand's own announcement or athlete page; the agency's profile; press that names the sponsor | Researched |

### Format: `data/team/<athleteId>.json`

```json
{
 "athleteId": "14833335",
 "name": "Sabastian Kimaru SAWE",
 "checked": "2026-11-16",
 "coach": {"value": "Claudio Berardelli", "reliability": "reported",
           "source": "https://...", "note": "optional", "verified": false},
 "shoe": {"value": "adidas", "reliability": "reported", "source": "https://...",
          "note": "optional", "verified": false},
 "agency": {"...": "only to override or supply what the profile does not give"},
 "manager": {"...": "only to override the profile"},
 "manager_note": "optional, e.g. a conflict between sources"
}
```

### Rules

- `verified` is `true` only when the source page was opened and states the fact. Entries
  found through a search summary are `false` and show "to verify" on the dashboard.
- A brand an athlete was seen racing in is graded Unconfirmed unless a source calls it
  their sponsor. Shoe deals change often: prefer sources from the last two years and say
  so in the note when the source is older.
- Nothing found: `value` is `null` with a note. Self-coached: `value` is `null`, with the
  note and source saying so. Never infer a coach from a training group or a nationality.
- Spell names the same way every time, because the coach, manager, agency and brand
  pages group athletes by name. Brands: adidas, Nike, ASICS, PUMA, New Balance, Under
  Armour, On, HOKA, Saucony, Brooks, Mizuno, Li-Ning, Xtep, 361°, Anta.
- On a change, update the value and keep the previous one in the note with the date.
- World Athletics is taken as right about the current representative. If the press names
  someone else, record it in `manager_note`.

### Current state (29 profiles)

| Item | Found | Notes |
|---|---|---|
| Manager | 26 | From World Athletics. Three athletes have no representative listed |
| Agency | 17 | 13 from the representative's website, 3 through Eric Lilot (Unconfirmed), 1 researched (Unconfirmed) |
| Coach | 19, plus one self-coached | All from search summaries; none opened and verified yet |
| Shoe sponsor | 16 | Three from the brand or agency itself; four rest on one weak source or on "seen racing in" and are graded Unconfirmed |

To do: open and verify the 37 researched entries; find the agency for the representatives
with no website (Monica Pont Chafer, Karen Lin, Stephen Haas, Christian Calanni, Jozsef
Babinyecz, Hannah Biwott-van de Veen); confirm that Eric Lilot works for Demadonna;
resolve Kidsan Alema (Moyo Sports has a profile for her, World Athletics lists Monica
Pont Chafer); resolve Justus Kangogo's coach (two names in one article). Six athletes have
nothing beyond the World Athletics representative. About 740 athletes still await a
profile and so have no team data.

## 5a. Race backlog as of 16 November 2026

Run `python scripts/status.py --missing` for the current list. Suggested order within
each task: Platinum before Gold, most recent first.

### Races already run (50)

`P` = prize money, `R` = race report; a dash means still to do.

| Date | Race | Tier | P | R |
|---|---|---|---|---|
| 11 Jan | Xiamen Marathon | Platinum | – | – |
| 11 Jan | Houston Marathon | Gold | – | – |
| 11 Jan | Houston Half Marathon | Gold | – | – |
| 16 Jan | Doha Marathon | Gold | – | – |
| 18 Jan | Chongqing Marathon | Gold | – | – |
| 18 Jan | Hong Kong Marathon | Gold | – | – |
| 18 Jan | Mumbai Marathon | Gold | – | – |
| 25 Jan | Osaka Women's Marathon | Platinum | – | – |
| 8 Feb | Burj2Burj Half Marathon | Gold | – | – |
| 14 Feb | Lagos City Marathon | Gold | – | – |
| 14 Feb | Ras Al Khaimah Half Marathon | Gold | – | – |
| 15 Feb | Barcelona Half Marathon | Gold | – | – |
| 22 Feb | Guadalajara Half Marathon | Platinum | – | – |
| 22 Feb | Daegu Marathon | Gold | – | – |
| 22 Feb | Osaka Marathon | Gold | – | – |
| 1 Mar | Tokyo Marathon | Platinum, Major | done | done |
| 8 Mar | Nagoya Women's Marathon | Platinum | – | – |
| 15 Mar | Seoul Marathon | Platinum | – | – |
| 15 Mar | Meishan Renshou Half Marathon | Platinum | – | – |
| 15 Mar | New Taipei City Marathon | Gold | – | – |
| 15 Mar | Shanghai Half Marathon | Gold | – | – |
| 22 Mar | Wuxi Marathon | Gold | – | – |
| 29 Mar | Yangzhou Half Marathon | Platinum | – | – |
| 12 Apr | Rotterdam Marathon | Gold | – | – |
| 12 Apr | Paris Marathon | Gold | – | – |
| 19 Apr | Istanbul Half Marathon | Gold | – | – |
| 20 Apr | Boston Marathon | Platinum, Major | partial | done |
| 26 Apr | London Marathon | Platinum, Major | done | done |
| 26 Apr | Gifu Half Marathon | Gold | – | – |
| 26 Apr | World 10K Bengaluru | Gold | – | – |
| 24 May | Lanzhou Marathon | Gold | – | – |
| 30 May | Okpekpe 10 km | Gold | – | – |
| 28 Jun | Port-Gentil 10 km | Gold | – | – |
| 30 Aug | Sydney Marathon | Platinum, Major | conflict | done |
| 30 Aug | Mexico City Marathon | Gold | – | – |
| 19–20 Sep | World Road Running Championships | Championship | not supported | – |
| 27 Sep | Berlin Marathon | Platinum, Major | one source | done |
| 27 Sep | Taiyuan Marathon | Gold | – | – |
| 11 Oct | Chicago Marathon | Platinum, Major | places 1–5 | done |
| 18 Oct | Amsterdam Marathon | Platinum | – | done |
| 18 Oct | Beijing Marathon | Gold | – | short |
| 18 Oct | Ljubljana Marathon | Gold | – | short |
| 18 Oct | Delhi Half Marathon | Gold | – | short |
| 18 Oct | Dongying Marathon | Gold | – | – |
| 24 Oct | Jakarta Half Marathon | Gold | – | – |
| 25 Oct | Valencia Half Marathon | Gold | – | done |
| 1 Nov | New York City Marathon | Platinum, Major | done | done |
| 1 Nov | Istanbul Marathon | Gold | – | – |
| 1 Nov | Hangzhou Marathon | Gold | – | – |
| 15 Nov | Hong Kong-Zhuhai-Macao Bridge Half | Platinum | – | done |

Totals: prize money entered for 6 of 50 (44 to do, of which Sydney is unresolved and the
championships are not supported); race reports summarised for 13 of 50 (37 to do; some
will have no World Athletics report).

### Upcoming races (12): announced entries

| Date | Race | Tier | Entries |
|---|---|---|---|
| 6 Dec | Valencia Marathon | Platinum | tracked; final start list outstanding |
| 6 Dec | Shanghai Marathon | Platinum | – |
| 6 Dec | Singapore Marathon | Gold | – |
| 6 Dec | Shenzhen Marathon | Gold | – |
| 12 Dec | Sharqiyah International Race 5 km | Platinum | – |
| 12 Dec | Sharqiyah International Race Half Marathon | Gold | – |
| 12 Dec | Abu Dhabi Marathon | Gold | – |
| 20 Dec | Bangsaen21 Half Marathon | Platinum | – |
| 20 Dec | Guangzhou Marathon | Gold | – |
| 20 Dec | Taipei Marathon | Gold | – |
| 20 Dec | Kolkata 25K | Gold | – |
| 27 Dec | Shanghai Elite 10K | Gold | – |

One combined search for the Shanghai, Singapore, Shenzhen and Abu Dhabi fields found
nothing; each needs its own search, starting from the organiser's site. Several of these
races announce late and mainly in Chinese.

After each of these races is run, its prize money and race report join the backlog above.

### Suggested order of work

1. Entries for the six December races in the next four weeks, Valencia's final start
   list first.
2. Race reports for the Platinum races without one (Xiamen, Osaka Women's, Guadalajara,
   Nagoya, Seoul, Meishan, Yangzhou) and for the World Road Running Championships.
3. Prize money for the remaining Platinum races and the unresolved Majors (Sydney,
   Boston, Chicago, Berlin).
4. Race reports, then prize money, for the Gold races, most recent first.

## 6. Continuing into 2027 and later seasons

The work in this document does not end with a season. Each season brings a new set of
races, each with a new World Athletics id, and everything is gathered again for it.

What carries over and what does not:

| | Carries over to the new season? |
|---|---|
| Formats, rules, reliability grades | Yes, unchanged |
| Prize money | **No.** A new entry per race per year, from that year's sources. Last year's table is a guide to where to look, never a value to copy |
| Announced entries | No. A new file per race per year |
| Race reports | No. A new file per race per year |
| Athlete identities | Yes. Athlete ids are permanent, so a profile shows withdrawals and race notes from every season |
| The 2026 backlog | Stays open. Earlier seasons' gaps can still be filled; the new season's races take priority |

Timetable around the turn of the year:

- **October to December:** watch for the new season's label calendar (the update prints
  "label calendar not published yet" until it appears). Elite fields for the January
  races (Xiamen, Houston, Osaka Women's, Mumbai, Hong Kong, Doha and others) are
  announced from November.
- **Before the calendar is published:** January races have no World Athletics id, so no
  entry file can be made. Record announcements in the newsletter with sources, and keep
  a note of them; create the files as soon as the ids exist, with the original
  announcement dates.
- **When the calendar appears:** run `python scripts/status.py --missing`; create entry
  files for races in the next six weeks; compare the new priority set with last year's
  and note races that gained or lost a Platinum or Gold label.
- **January:** finish the old season's last races (late December races, late results),
  then write the season look-back in the first newsletter of the year.
- **Each new season:** add the championship road races for that year to `extra_races`
  in `config/disciplines/road-running.json`, and check the currency rates in `config/prize_money.json`.

Prize money in a new season: organisers often change the table (Tokyo has announced a
first prize of $170,000 for 2027, up from $80,000). Always confirm the year on the
source.

## 7. Open questions

- **Sydney prize money:** needs an official source for the international elite prizes.
- **Championship prize money:** the format holds one prize table per race; the World
  Road Running Championships has several events and team prizes.
- **Weather from other sources:** ten of thirteen reports say nothing about the weather.
  If weather matters for every race, a separate, clearly labelled field fed from a
  weather archive would be needed; it should not be mixed into the report summary.
- **Did-not-start detection:** results hold only the top 20, so an announced athlete who
  is missing may have finished lower. Storing the full finisher list would settle it.
- **Non-English sources:** many Asian label races publish fields only in Chinese,
  Japanese or Korean. These count as official sources; note the language in the event.
- **Cadence:** a weekly check can be up to a week late on a withdrawal. In the fortnight
  before a Major or other headline race, a second check mid-week is worth considering.

## 8. Weekly checklist

1. `python scripts/update_all.py`, then `python scripts/status.py --missing` (it lists
   every season).
2. Races run in the last 7 days: race report summary, then prize money.
3. Races in the next 6 weeks: review entries, append changes, set `checked`.
4. Races run in the last 7 days that had an entry list: compare with results.
5. A few items from the backlog in the suggested order.
6. `python scripts/build_index.py`; look at the changed race pages and at one athlete
   page per change.
7. Write the newsletter; commit researched files together with it.
