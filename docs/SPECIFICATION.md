# Athletics Tracker: project specification

Version of 16 November 2026. Describes the project as built, what is still to be set up,
and what is planned. The companion document
[DATA_GATHERING.md](DATA_GATHERING.md) specifies the research work that has to continue
by hand or by a scheduled Claude run.

## 1. Purpose

A personal resource for following the sport of athletics that gives a clearer overall
picture than the World Athletics website:

- an interactive dashboard with an overview and drill-down to race and athlete level;
- a weekly newsletter with the important results and news, published in its own section
  of the dashboard, where every earlier issue stays available. There are no
  notifications: the owner reads it on the site.

Constraints:

- No cost beyond the owner's existing Claude Pro subscription. Everything else uses free
  tiers (GitHub).
- Personal, non-commercial use. Every page links back to its source.
- Data comes from the public World Athletics website plus open web research.

## 2. Scope

The owner divides athletics into four groups: Olympic track and field, race walking,
cross country, and road running. **Phase 1 covers road running only.** The method is
meant to be adapted to the other three groups later (section 11).

Priority races for a season ("the priority set"):

| Group | 2026 count | How identified |
|---|---|---|
| World Athletics Platinum Label road races | 20 | `competitionSubgroup = Platinum` in the label calendar |
| World Athletics Gold Label road races | 41 | `competitionSubgroup = Gold` |
| Championship road races | 1 | Listed by hand in `config/disciplines/road-running.json` (`extra_races`) |

The seven World Marathon Majors (Tokyo, Boston, London, Sydney, Berlin, Chicago, New York)
are all Platinum and are flagged by event ID in `config/disciplines/road-running.json` (`majors`).

2026 split of the 61 label races by distance: marathon 39 (14 Platinum, 25 Gold), half
marathon 16 (5 + 11), 10 km 4 (0 + 4), other 2 (a Platinum 5 km, a Gold 25 km).

Any other race can be added to the priority set through `extra_races` with its World
Athletics event ID.

### Seasons

The project is continuous: it runs on into 2027 and later seasons, and earlier seasons
stay in the repository and on the dashboard.

- `config/disciplines/road-running.json` lists the seasons followed (`seasons`, currently 2026 and 2027).
  Starting a new season means adding its year there, plus that year's championship
  races under `extra_races`. Nothing else has to be reset.
- A season is **active** from 1 October of the year before (its calendar is published in
  advance, and January races need attention in December) until 31 January of the year
  after (late results and corrections). Only active seasons are fetched.
- Calendars and top lists are stored per season (`data/calendar/<season>.json`,
  `data/toplists/<season>/`). Results, entries, reports and prize money are stored per
  race; a race's World Athletics id is new every year, so one race in two seasons is two
  records.
- Marathon Majors are recognised by name (a Platinum marathon whose name contains one of
  the names in `majors`), so the list carries over from year to year. It needs editing
  only if the series itself changes.
- The priority set is whatever is Platinum or Gold in that season: races can gain or
  lose a label from one year to the next.
- The dashboard has a season selector. Upcoming races, Running next and the newsletter
  work across the year boundary: in December they include the January races of the next
  season, once those are known.

Limits found when building this:

- The World Athletics label page serves one season only, its latest; the site's own
  season switch works only in a browser. Each update therefore stores the season the
  site is showing. Once the site switches to 2027, the stored 2026 calendar is kept as
  it is and its remaining results are still fetched race by race.
- As of 16 November 2026 the 2027 label calendar is not published. Until it is, 2027
  races are unknown to the scripts. A race can be added by hand in `extra_races` once
  its World Athletics event id exists.

## 3. Architecture

```
                 World Athletics website                 Organisers, press
                          |                                     |
          scripts/fetch_*.py (automatic)          research (Claude, weekly or on request)
                          |                                     |
                          v                                     v
   data/calendar/, results/, toplists/,          config/prize_money.json, data/entries/,
   athletes/                                      data/reports/, newsletters/
                          \                                     /
                           scripts/build_index.py  ->  site/data/
                                         |
                           site/ (static dashboard, including the newsletter)
                                         |
                               GitHub Pages / local
```

Two kinds of data, kept strictly apart:

- **Fetched data** is produced by scripts from World Athletics pages and can be
  regenerated at any time.
- **Researched data** needs reading and judgement (prize money, announced entries, race
  report summaries, the newsletter). It is written by hand or by a Claude run, always
  with sources, and cannot be regenerated. See DATA_GATHERING.md.

Technology: Python 3.7+ standard library only (no packages to install); a static site in
plain HTML, CSS and JavaScript with no build step; git for storage and history.

## 4. Repository layout

| Path | Contents |
|---|---|
| `config/disciplines/road-running.json` | Seasons followed, tiers followed, Majors, extra races, distance overrides, top list addresses, limits |
| `config/prize_money.json` | Researched prize money per race, currency rates |
| `scripts/wa.py` | The only module that knows how World Athletics pages are built: polite fetching, cache, parsing helpers |
| `scripts/fetch_calendar.py` | Label calendar → `data/calendar/<season>.json` |
| `scripts/fetch_results.py` | Results of races run → `data/results/<raceId>.json` |
| `scripts/fetch_toplists.py` | Season top 100 per distance and gender → `data/toplists/<season>/` |
| `scripts/update_focus.py` | Yearly lists of athletes in focus → `data/focus/<season>.json` |
| `scripts/fetch_athletes.py` | Profiles of the athletes in focus → `data/athletes/<athleteId>.json` |
| `scripts/profile_batch.py` | One scheduled batch of profiles: fetch, check, commit, log |
| `scripts/fetch_reports.py` | Saves recent World Athletics report texts to the local cache for reading |
| `scripts/build_index.py` | Merges everything into `site/data/site.json` and `site/data/athletes/` |
| `scripts/update_all.py` | Runs the fetch scripts and the build in order |
| `scripts/status.py` | Lists, per race, what has been gathered and what is missing; `--json` gives the pipeline's work list |
| `scripts/validate.py` | Format and content checks for researched and fetched files |
| `scripts/check_stage.py` | The checker between pipeline stages; writes the handoff records |
| `pipeline/stages.json` | The stages: order, permitted files, checks, dependencies |
| `pipeline/runs/<week>/` | Handoff records and work list of each weekly run |
| `.claude/skills/athletics-*/` | One skill per stage, the reviewer skill and the coordinator |
| `.claude/agents/athletics-*.md` | The researcher, writer and checker subagents with their tool limits |
| `data/news/<week>.json` | The week's news items with sources, input to the newsletter |
| `scripts/serve.py` | Local preview at http://localhost:8765 (served without caching, so a refresh always shows the latest build) |
| `config/agencies.json` | Maps a World Athletics representative to an agency, by website or by name |
| `data/team/<athleteId>.json` | Researched coach and shoe sponsor per athlete |
| `data/entries/<raceId>.json` | Researched announced entries and withdrawals |
| `data/reports/<raceId>.json` | Researched summaries of race reports |
| `newsletters/<ISO week>.md` | One newsletter per week |
| `routine/newsletter_prompt.md` | Instructions for the weekly Claude run |
| `site/` | The dashboard (`index.html`, `app.js`, `style.css`); `site/data/` is generated and not committed |
| `.github/workflows/update.yml` | Weekly data update, site build and publication |
| `.cache/` | Downloaded pages and report texts; never committed |

## 5. Fetched data

All of it is read from the JSON embedded in World Athletics pages (`__NEXT_DATA__`) or,
for top lists, from the HTML table. No key or login is involved.

| Data | Source page | Stored | Notes |
|---|---|---|---|
| Calendar | `/competitions/world-athletics-label-road-races` | id, name, venue, country, dates, tier, Major flag, distance | The page has no distance field: distance is derived from the race name, with overrides in `config/disciplines/road-running.json` |
| Results | `/competition/calendar-results/results/<raceId>` | Per event: top 20 with place, time, name, nationality, athlete id, records; number of finishers | Multi-day championships are read day by day. Where a race lists its elite field and a second field separately, they are merged and re-ranked by time |
| Top lists | `/records/toplists/road-running/<distance>/outdoor/<gender>/senior/<season>` | Top 100, best time per athlete | Marathon, half marathon, 10 km |
| Athlete profile | `/athletes/<country>/<slug>` | Personal bests, season results, progression by season on the road, honours, world ranking | See the limit below |

Rules for fetching:

- At most one request per second; athlete profiles one every six seconds.
- **World Athletics refuses bulk requests.** After about 15 profile pages in a short time
  it answered with empty pages. The fetcher treats an empty page or a 403/429 as a
  refusal, stops the run, and never retries or disguises itself.
- **Who gets a profile: the yearly lists of athletes in focus** (`data/focus/<season>.json`,
  built by `scripts/update_focus.py` in the weekly fetch; criteria in `profile_rule` in the
  discipline settings). An athlete is in focus for season Y if, in Y, they finish in the
  top 10 of a Marathon Major, the top 5 of another Platinum race, the top 3 of a Gold
  race or the top 10 of the World Road Running Championships half marathon (women and
  men, per event), or if they are in the top 20 of a season list (marathon, half
  marathon, 10 km) **with a mark better than the 20th mark of the same list in Y-1**.
  - *During Y the list only grows:* anyone who meets the criteria at any point stays on
    it, and their profile is kept up to date, even if pushed out of the top 20 later.
  - *At the end of Y* (on 1 February of Y+1, once the December results are in) the list
    is closed: everyone on it is checked against the final Y results and lists, and those
    who still meet the criteria form the **final list**. A closed list never changes.
  - *One year of grace:* in calendar year Z, profiles are kept up to date for the final
    list of Z-1 and everyone on the Z list so far. An athlete on the final Z-1 list who
    does not join the Z list stops being updated when the Z list is closed.
  - The previous season's six lists are stored to provide the thresholds (the 2025 lists
    for 2026). On the data up to mid-November 2026 the 2026 list holds 332 athletes; the
    threshold excluded 9 athletes from the men's 10 km list, the only list whose 2026 top
    20 was slower than 2025's.
  - The athlete's page shows why they are in focus ("In focus for 2026: 2nd TCS London
    Marathon; #1 half marathon list").
- **How profiles are fetched:** in batches of 12, one page every six seconds, most
  prominent athletes first. Missing profiles come before refreshes; a profile is
  refreshed after 28 days or when the athlete has a new result.
  `scripts/profile_batch.py` runs one batch, checks it, commits it and logs the outcome
  (`python scripts/profile_batch.py --log`). It is scheduled twice a day, on this PC
  through Windows Task Scheduler and, once published, by `profiles.yml`. This cadence is
  a trial: if the log shows refusals, reduce the batch size or the frequency.
- **Profiles of athletes not in focus** are kept but no longer refreshed. The athlete's
  page says so, with the date the profile was last read and the last season they were
  in focus.
- A race is fetched until results exist; stored results are then kept. `--force`
  refetches.
- If the site layout changes, a fetch fails loudly rather than storing partial data.

## 6. Researched data

Specified in full in DATA_GATHERING.md. In summary:

| Data | File | What it holds |
|---|---|---|
| Prize money | `config/prize_money.json` | Place prizes per race, bonus rules, bonuses reported as paid, reliability grade, sources |
| Announced entries | `data/entries/<raceId>.json` | One record per athlete with an append-only history: announced, confirmed, withdrawn (with reason), each graded official / reported / unconfirmed |
| Race reports | `data/reports/<raceId>.json` | Weather, how each race was won, a note per key athlete, notable non-finishers; a summary in our own words of the World Athletics report |
| Athlete teams | `data/team/<athleteId>.json`, `config/agencies.json` | Coach and shoe sponsor (researched); manager and agency (from the World Athletics profile where possible), each with reliability, source and a verified flag |
| Newsletter | `newsletters/<week>.md` | Top results, news and stories, what's next |

Athletes named in researched data are matched to World Athletics athlete ids at build
time: exact name match first, then a unique athlete whose name contains all the given
words, within the same gender. An explicit `athleteId` in the file overrides the match.

## 7. Dashboard

A single static page with these views. All tables link athletes to their page and races
to their page.

| View | Address | Content |
|---|---|---|
| Overview | `#/` | Key figures; season timeline (one dot per race by date, rows by distance, colour by tier, larger for Majors, outline for races not yet run, tooltip on hover); latest results (winners set apart below each race); coming up (with whether an elite field has been announced); latest runs (top 5); running next (next race with entries); prize money leaders; fastest of the season |
| Races | `#/races` | All priority races with tier, distance, winners and winner's prize; filters by tier and distance |
| Latest runs | `#/runs` | Top-20 finishes from priority races in the 30 days up to the latest race, women and men, ordered by where the time sits in the season list for its distance |
| Running next | `#/next` | Every upcoming race with its announced athletes, best time, reliability, first-named and last-confirmed dates; withdrawn athletes kept, with date, reason and source |
| Distance | `#/distance/<d>` | Season top 100 (women / men) and the priority races at that distance |
| Race | `#/race/<id>` | Race report summary; top 20 women and men with prize money; prize money card; announced entries and change log |
| Athlete | `#/athlete/<id>` | Team (coach, manager, agency, shoe sponsor); season bests or full personal bests; priority races with place, time and prize; known prize money total; how the races went; race plans and withdrawals; season results, bests by season and honours when a profile exists |
| People | `#/people` | Coaches, managers, agencies and shoe sponsors of the athletes with profiles, with the number of athletes each |
| Coach, manager, agency, shoe sponsor | `#/coach/<name>`, `#/manager/<name>`, `#/agency/<name>`, `#/shoe/<name>` | The athletes associated with that person, agency or brand, their other team members, and how each link is known |
| Newsletter | `#/news`, `#/news/<week>` | The latest issue in full, links to the older and newer issue, and a list of every issue by year |

Display rules:

- An athlete page exists for every athlete seen in results, top lists, entries or
  reports. Career detail appears once the profile has been fetched.
- Prize money totals are in US dollars at the fixed approximate rates in
  `config/prize_money.json`. Wherever a total appears, the page states how many races it
  covers and that appearance fees and sponsor bonuses are excluded. A "?" marks a race
  whose prize money is not known.
- Athlete page rules: road personal bests are the marathon, half marathon and events
  World Athletics names "... Road" (Mile Road is road; Mile and Mile Short Track are
  not). Track bests show Olympic events only. Both lists run from longest to shortest
  distance. Bests by season and honours run from oldest to newest. Honours show six
  groups only, in one table with shared columns: Marathon Majors, International
  Marathons, Olympic Games, World Championships, World Road Running Championships, World
  Cross Country Championships.
- Athlete team: a Team card lists coach, manager, agency and shoe sponsor with the
  reliability grade and source of each; entries not yet checked on the source page are
  marked "to verify". The shoe sponsor's logo sits at the right of the athlete's name.
  Logos are loaded from the Simple Icons project (adidas, Nike, PUMA, New Balance, Under
  Armour); brands it does not carry (ASICS, On, HOKA and others) show as a text badge.
  Coach, manager and agency pages list only athletes whose profiles have been fetched,
  and say so.
- Missing researched data is stated as missing ("Not mentioned in the report", "No
  announced entries recorded yet"), never left blank or guessed.
- Light and dark colour schemes follow the device setting. Tier colours: Platinum blue,
  Gold orange, Championship green; tier is always also written as text.

## 8. Newsletter

- One issue per ISO week, at most 450 words, in plain Markdown (headings, bullets, bold,
  links).
- Sections: **Top results** (priority races of the last 7 days, with context from the
  race report), **News and stories** (each with a source link that was actually opened),
  **What's next** (races in the next 10 days; changes in announced fields first,
  including every withdrawal with its reason).
- Results are taken from the repository data, never from memory. Unconfirmed stories are
  left out.
- Language: English.
- Delivery: none. Each issue is a file in `newsletters/`; the site build includes every
  issue, and the dashboard's Newsletter section shows the latest one in full with links to
  the older and newer issue and a list of all issues by year. The overview links to the
  latest issue. Nothing is sent and no account or secret is involved.

## 9. Automation

### The weekly pipeline

The weekly work is a pipeline of eight stages. Each stage is a saved skill
(`.claude/skills/athletics-<stage>/`) with only the tools it needs, and each is followed
by a checker before the next stage may use its output.

| # | Stage | Skill | Run by | Tools | May write |
|---|---|---|---|---|---|
| 1 | fetch | `athletics-fetch` | coordinator | the five fetch scripts | `data/calendar/`, `results/`, `toplists/`, `athletes/` |
| 2 | reports | `athletics-reports` | researcher subagent | web, read, write | `data/reports/` |
| 3 | prize-money | `athletics-prize-money` | researcher subagent | web, read, write | `config/prize_money.json` |
| 4 | entries | `athletics-entries` | researcher subagent | web, read, write | `data/entries/` |
| 5 | team | `athletics-team` | researcher subagent | web, read, write | `data/team/`, `config/agencies.json` |
| 6 | news | `athletics-news` | researcher subagent | web, read, write | `data/news/<week>.json` |
| 7 | newsletter | `athletics-newsletter` | writer subagent | read, write (no web) | `newsletters/<week>.md` |
| 8 | publish | `athletics-publish` | coordinator | validation, build, git | nothing new |

The coordinating skill is `athletics-weekly`. The three subagents are defined in
`.claude/agents/`: `athletics-researcher`, `athletics-writer`, `athletics-checker`.
Stages that read the open web cannot run commands or push. The stage that writes the
published newsletter cannot read the web. The stage that pushes never reads web content.

**The checker** has two layers:

1. `scripts/check_stage.py gate <stage>` (a script, and the real guarantee):
   - *scope*: the stage changed only the files `pipeline/stages.json` allows it;
   - *format and content*: its files pass the stage's checks in `scripts/validate.py`
     (schema, no HTML, only plain web links, numeric ids, length limits; researched files
     must point at races and athletes that exist; a fetched calendar may not lose more
     than a fifth of its races).
2. The `athletics-check` skill (the read-only `athletics-checker` subagent) reads the
   files and looks for what a script cannot see: instruction-like text, commands,
   off-topic content, contradictions with the fetched results, unsupported claims. It
   returns a verdict only. It is a second look by a language model, not a guarantee.

The outcome of each stage is a **handoff record**, `pipeline/runs/<week>/<stage>.json`,
with the status (`passed`, `failed`, `skipped`), the files accepted and any problems. A
stage starts only if the stages it needs have passed, and the newsletter stage reads the
records to know which data it may use.

Accepted files are staged in git; the git index is the set of accepted work. A failed
stage's changes are discarded (changed files restored, new files removed) and the run
continues, except that a failed fetch or newsletter stops it. Nothing is committed until
the publish stage, which re-validates everything, rebuilds the site data and makes one
commit.

`scripts/status.py --json` produces the work list each stage reads: this week's items
first, then a few from the backlog.

**Refining or reusing a stage.** Each stage's instructions are in its own `SKILL.md`; its
permitted files and checks are in `pipeline/stages.json`; its format rules are in
`scripts/validate.py`. A stage can be run alone (see "Running one stage by itself" in the
`athletics-weekly` skill). Stages 2 to 8 and the checker do not depend on the discipline.
Stage 1 does: the fetch scripts read `config/disciplines/<discipline>.json`
(`road-running` today) and know road-running pages; adding a discipline means a new
settings file and fetch support for its pages, not new stages.

### Scheduled jobs

| Job | Where | When | Does |
|---|---|---|---|
| Data update | GitHub Actions `update.yml` | Mondays 06:00 UTC, on demand, and on pushes to site, scripts, config, newsletters, entries or reports | Fetches (scheduled and manual runs only), commits `data/`, builds `site/data/`, publishes to GitHub Pages |
| Research and newsletter | Claude run that invokes the `athletics-weekly` skill (`routine/newsletter_prompt.md`) | Weekly | The pipeline above: fetch, research, newsletter, publish |

Fallback if the cloud jobs cannot reach World Athletics or cannot push: run
`python scripts/update_all.py` and the research on the owner's PC (Windows Task
Scheduler) and push from there.

## 10. Current status (16 November 2026)

Built and working on the owner's PC:

- All fetch scripts; the 2026 calendar (62 races), results (50 races run), six top lists.
- Multi-season storage and the season selector. The selector was tested with a simulated
  second season; switching by hand in a browser has not been checked.
- The dashboard with all views above, checked in desktop-width screenshots.
- Prize money for 6 races, race report summaries for 13, announced entries for 1
  upcoming race, one newsletter issue.
- A local git repository with all of the above committed.

Not done yet:

| Item | Blocked on |
|---|---|
| GitHub repository, Pages, scheduled update | Owner: create a free GitHub account, install the GitHub CLI, run `gh auth login` |
| Weekly Claude routine | The GitHub repository, and GitHub connected to the owner's Claude account |
| Athlete profiles | 34 of 332 in focus fetched; two batches of 12 a day on trial |
| 2027 calendar | World Athletics has not published it yet |
| Researched data backlog | See DATA_GATHERING.md |

Known risks and open points:

- **Unofficial source.** World Athletics can change its pages or tighten its limits at
  any time. All parsing is in `scripts/wa.py`.
- **Cloud access untested.** The site may refuse requests from GitHub's servers more
  readily than from a home connection.
- **Routine limits untested.** Third-party sources say Claude Pro allows about five
  scheduled runs a day; one a week is needed. Whether a routine can push to GitHub and
  search the web has to be confirmed when it is created.
- **Public site.** GitHub Pages on a free account is publicly reachable. The data
  belongs to World Athletics; the project stays personal, non-commercial, low-volume and
  linked to sources. A private alternative is to run everything locally.
- **Phone layout** has not been properly verified.
- **Currency rates** for prize totals are fixed approximations set by hand.

## 11. Planned extensions

1. Publish (GitHub, weekly routine) as soon as the owner's setup steps are done.
2. Work through the researched-data backlog (DATA_GATHERING.md).
3. 2027 season: already in `config/disciplines/road-running.json`. When World Athletics publishes the 2027
   label calendar it is picked up by the next update. To do by hand: add the 2027
   championship road races to `extra_races`; check the Majors list; review the first
   2027 calendar for races that gained or lost a label. Each later season: add its year
   to `seasons` in the autumn before.
4. Adapt the method to the other three groups, one at a time: Olympic track and field,
   race walking, cross country. Each needs its own definition of the priority set
   (for example Diamond League and championships for track and field), its own top list
   addresses, and views suited to its events.

## 12. How to run it

```
python scripts/update_all.py     # fetch new data and rebuild the site data
python scripts/serve.py          # dashboard at http://localhost:8765
python scripts/status.py         # what has been gathered, what is missing
python scripts/build_index.py    # rebuild site data after editing researched files
```
