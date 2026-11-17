---
name: athletics-fetch
description: Pipeline stage. Runs the project's fetch scripts to bring in the latest calendar, race results, season top lists, athlete profiles and report texts from World Athletics. Runs fixed scripts only; no research. Run by the athletics-weekly skill, or alone to refresh the data.
argument-hint: "[discipline, default road-running]"
allowed-tools: Bash(python scripts/fetch_calendar.py), Bash(python scripts/fetch_results.py), Bash(python scripts/fetch_toplists.py), Bash(python scripts/update_focus.py), Bash(python scripts/fetch_athletes.py), Bash(python scripts/fetch_reports.py), Read
---

# Stage: fetch

This stage only runs fixed scripts. It never opens web pages itself and never edits a
file by hand. The discipline is road running (the scripts read
`config/disciplines/road-running.json`); other disciplines are not built yet.

Run these, one at a time, from the project folder, in this order:

1. `python scripts/fetch_calendar.py`
2. `python scripts/fetch_results.py`
3. `python scripts/fetch_toplists.py`
4. `python scripts/update_focus.py` (updates the yearly lists of athletes in focus; no
   web requests)
5. `python scripts/fetch_athletes.py`
6. `python scripts/fetch_reports.py`

Rules:

- If a script prints that World Athletics **declined** or **refused** a request, the site
  is asking automated requests to stop. Do not run that script again in this run and do
  not try another way to get the same data. Carry on with the next script; what was
  already fetched is kept. `fetch_athletes.py` stops by itself after 15 profiles or at
  the first refusal; that is normal.
- If a script fails for another reason (an error mentioning the page layout, or a Python
  traceback), stop the stage and report the last lines it printed. Do not edit the
  script.
- "label calendar not published yet" for a future season is normal.

Report in a few lines: what each script printed as its summary line, and any refusal or
failure. The caller then runs the checker (`python scripts/check_stage.py gate fetch`).
