---
name: athletics-publish
description: Pipeline stage. Final step of the weekly run - re-validates everything that was accepted, rebuilds the dashboard data, commits the accepted files and pushes. Never reads web content and never edits data. Run by the athletics-weekly skill.
argument-hint: "<week such as 2026-W47>"
allowed-tools: Bash(python scripts/check_stage.py *), Bash(python scripts/validate.py), Bash(python scripts/build_index.py), Bash(git status *), Bash(git diff --cached --name-only), Bash(git add pipeline/runs/*), Bash(git commit -m *), Bash(git remote), Bash(git pull --rebase), Bash(git rebase --abort), Bash(git push), Read
---

# Stage: publish

Arguments: `$ARGUMENTS` (the ISO week)

Everything accepted by the checkers during this run is staged in git. This stage turns it
into one commit. It does not look at web content, does not edit any data file, and does
not stage anything itself except the run's handoff records.

1. `python scripts/check_stage.py gate publish --week <week>`
   This re-runs every validation and fails if any file has changed that no checker
   accepted (such a change is discarded). If it fails, stop and report its output.
2. `python scripts/build_index.py`
   Rebuilds the dashboard data. If it fails, stop and report its output; do not commit.
3. `python scripts/check_stage.py summary --week <week>`
   Keep its output for the report.
4. `git diff --cached --name-only`
   If nothing is staged, there is nothing to publish: report that and stop.
5. `git add pipeline/runs/<week>`
6. `git commit -m "Weekly update <week>"`
   Use exactly this message, with the week filled in.
7. `git remote`. If it prints nothing, the project has no online repository yet: report
   "committed locally, not pushed" and stop.
8. `git pull --rebase`. GitHub Actions commits athlete profiles and fetched data to the
   same branch during the run; they touch other files, so this normally just puts this
   commit on top. If it reports a conflict, run `git rebase --abort`, report the message
   and stop.
9. `git push`. If the push is rejected, do not force it and do not try anything else:
   report the message.

Report: the summary from step 3, the number of files committed, and whether it was
pushed.
