"""The checker between pipeline stages (see pipeline/stages.json).

After a stage has run, this script decides whether its output may be used by the next
stage, and records the decision in a handoff file, pipeline/runs/<week>/<stage>.json.

  python scripts/check_stage.py start                 begin a run: the working tree must be clean
  python scripts/check_stage.py gate <stage>          scope + format + content checks
  python scripts/check_stage.py review <stage> passed|failed [notes]
                                                      record the reviewer's verdict
  python scripts/check_stage.py skip <stage> <reason> record that a stage had nothing to do
  python scripts/check_stage.py can-start <stage>     have the stages it needs passed?
  python scripts/check_stage.py summary               the state of every stage in this run
  python scripts/check_stage.py fresh                 was the data fetched today (UTC)?
  Add --week 2026-W47 to act on a run other than the current week's.

How a stage's work is judged:
  scope   - it changed only files it is allowed to change (pipeline/stages.json)
  format  - those files pass the stage's checks in scripts/validate.py, which also
            reject markup, non-web links and malformed values
  review  - for research stages, a read-only reviewer has also passed the content

Work that passes is staged in git (`git add`): the index is the set of accepted files.
Work that fails is discarded: changed files are restored from the index, new files the
stage created are removed. When only some of a stage's files fail the format checks,
only those are discarded (listed as "rejected") and the rest go on; a scope problem, a
reviewer's "failed" or a problem not tied to one of its files still discards everything. Nothing here commits or pushes; the publish stage does that.
Exit codes: 0 passed / may start, 1 failed, 2 usage or run problem.
"""
import datetime
import json
import os
import re
import subprocess
import sys

import validate

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNS = "pipeline/runs"
DONE = ("passed", "skipped")


def out(text):
    sys.stdout.buffer.write((text + "\n").encode("utf-8", "replace"))


def git(*args):
    res = subprocess.run(["git"] + list(args), cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        raise RuntimeError("git %s failed: %s" % (" ".join(args), res.stderr.decode("utf-8", "replace").strip()))
    return res.stdout.decode("utf-8", "replace")


def lines(text):
    return [x for x in text.split("\0") if x]


def contracts():
    with open(os.path.join(ROOT, "pipeline", "stages.json"), encoding="utf-8") as f:
        return json.load(f)


def current_week():
    iso = datetime.date.today().isocalendar()
    return "%04d-W%02d" % (iso[0], iso[1])


def record_path(week, stage):
    return os.path.join(ROOT, RUNS, week, stage + ".json")


def read_record(week, stage):
    path = record_path(week, stage)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_record(week, stage, record):
    path = record_path(week, stage)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    record = dict(record, stage=stage, week=week, time=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(record, f, ensure_ascii=False, indent=1)
        f.write("\n")


def matches(path, patterns):
    """'data/reports/*.json' style patterns; '*' does not cross a folder boundary."""
    for pat in patterns:
        rx = "^" + "[^/]*".join(re.escape(part) for part in pat.split("*")) + "$"
        if re.match(rx, path):
            return True
    return False


def pending_changes():
    """Files changed or created since the last accepted state (the git index).
    The run's own handoff records are not part of any stage's work."""
    changed = lines(git("diff", "--name-only", "-z")) + lines(git("ls-files", "--others", "--exclude-standard", "-z"))
    return sorted(set(p for p in changed if not p.startswith(RUNS + "/")))


def discard(paths):
    """Undo a failed stage: restore changed files from the index, remove files it created."""
    tracked = set(lines(git("ls-files", "-z", "--"))) if paths else set()
    restored, removed = [], []
    for p in paths:
        if p in tracked:
            git("checkout", "--", p)
            restored.append(p)
        else:
            full = os.path.join(ROOT, p)
            if os.path.isfile(full):
                os.remove(full)
                removed.append(p)
    return restored, removed


def shrunk_calendars(paths):
    """A fetched calendar that lost more than a fifth of its races is a bad download,
    not news: refuse it and keep the stored one."""
    problems = []
    for p in paths:
        if not re.match(r"^data/calendar/\d{4}\.json$", p):
            continue
        try:
            before = len(json.loads(git("show", ":" + p)).get("races", []))
        except (RuntimeError, ValueError):
            continue  # a new season's calendar: nothing to compare with
        with open(os.path.join(ROOT, p), encoding="utf-8") as f:
            after = len(json.load(f).get("races", []))
        if before and after < 0.8 * before:
            problems.append("%s shrank from %d to %d races" % (p, before, after))
    return problems


def unmet(cfg, week, stage):
    """Stages this one needs that have not passed in this run."""
    problems = []
    for dep in cfg["stages"][stage].get("needs", []):
        rec = read_record(week, dep)
        if not rec or rec.get("status") not in DONE:
            problems.append("%s (%s)" % (dep, rec.get("status") if rec else "not run"))
    return problems


def cmd_start(cfg, week):
    dirty = pending_changes() + lines(git("diff", "--cached", "--name-only", "-z"))
    if dirty:
        out("Cannot start: the working tree has uncommitted changes:\n  " + "\n  ".join(sorted(set(dirty))[:20]))
        out("Commit or discard them first, so the checker can tell which stage changed what.")
        return 2
    os.makedirs(os.path.join(ROOT, RUNS, week), exist_ok=True)
    out("Run %s started. Stages: %s" % (week, ", ".join(cfg["order"])))
    return 0


def cmd_can_start(cfg, week, stage):
    missing = unmet(cfg, week, stage)
    if missing:
        out("%s cannot start; it needs: %s" % (stage, ", ".join(missing)))
        return 1
    usable = {}
    for dep in cfg["stages"][stage].get("needs", []) + cfg["stages"][stage].get("uses", []):
        rec = read_record(week, dep)
        usable[dep] = rec.get("status") if rec else "not run"
    out("%s may start. Earlier stages: %s" % (stage, json.dumps(usable)))
    return 0


def cmd_gate(cfg, week, stage):
    spec = cfg["stages"][stage]
    missing = unmet(cfg, week, stage)
    if missing:
        write_record(week, stage, {"status": "failed", "problems": ["needs: " + ", ".join(missing)], "files": []})
        out("%s FAILED: it needs %s" % (stage, ", ".join(missing)))
        return 1
    changed = pending_changes()
    inside = [p for p in changed if matches(p, spec["paths"])]
    outside = [p for p in changed if not matches(p, spec["paths"])]
    problems = ["changed a file outside its scope: " + p for p in outside]
    problems += validate.check(spec["checks"])
    problems += shrunk_calendars(inside)
    # A format problem confined to some of the stage's files costs only those files.
    # Anything else (scope, a shrunk calendar, a problem not tied to one of its files,
    # every file bad) still discards the whole stage.
    rejected, rejected_problems = [], []
    if problems and not outside and not shrunk_calendars(inside):
        bad = sorted(p for p in inside if any(e.startswith(p + ":") for e in problems))
        if bad and len(bad) < len(inside) and all(any(e.startswith(p + ":") for p in bad) for e in problems):
            discard(bad)
            inside = [p for p in inside if p not in bad]
            if not validate.check(spec["checks"]):
                rejected, rejected_problems, problems = bad, problems, []
    if problems:
        restored, removed = discard(pending_changes())
        write_record(week, stage, {"status": "failed", "problems": problems, "files": [],
                                   "discarded": sorted(set(restored + removed + rejected))})
        out("%s FAILED the gate (%d problem(s)); its changes were discarded:\n  %s" % (stage, len(problems), "\n  ".join(problems[:40])))
        return 1
    partial = {"rejected": rejected, "problems": rejected_problems} if rejected else {"problems": []}
    if rejected:
        out("%s: %d file(s) failed the format checks and were discarded; the rest go on:\n  %s"
            % (stage, len(rejected), "\n  ".join(rejected_problems[:40])))
    if spec.get("review") and inside:
        write_record(week, stage, dict(partial, status="awaiting-review", files=inside))
        out("%s passed the gate; %d file(s) await review:\n  %s" % (stage, len(inside), "\n  ".join(inside)))
        return 0
    if inside:
        git("add", "--", *inside)
    write_record(week, stage, dict(partial, status="passed", files=inside,
                                   note="nothing changed" if not inside else None))
    out("%s PASSED (%d file(s) accepted)." % (stage, len(inside)))
    return 0


def plain(text):
    """Notes come from a model that has read untrusted text: keep plain words only."""
    return re.sub(r"[^\w .,;:()'/-]", "", text or "")[:300]


def cmd_review(cfg, week, stage, verdict, notes):
    notes = plain(notes)
    rec = read_record(week, stage)
    if not rec or rec.get("status") != "awaiting-review":
        out("%s is not awaiting review (status: %s)." % (stage, rec.get("status") if rec else "not run"))
        return 2
    spec = cfg["stages"][stage]
    changed = pending_changes()
    # nothing may have changed between the gate and the verdict
    drift = sorted(set(changed) ^ set(rec["files"]))
    problems = validate.check(spec["checks"])
    if drift:
        problems.append("files changed after the gate: " + ", ".join(drift))
    rejected = rec.get("rejected") or []
    if verdict == "passed" and not problems:
        git("add", "--", *rec["files"])
        record = {"status": "passed", "problems": rec.get("problems") or [], "files": rec["files"], "review": notes or "passed"}
        if rejected:
            record["rejected"] = rejected
        write_record(week, stage, record)
        out("%s PASSED review (%d file(s) accepted%s)." % (stage, len(rec["files"]),
                                                          ", %d rejected at the gate" % len(rejected) if rejected else ""))
        return 0
    restored, removed = discard(changed)
    if verdict != "passed":
        problems.append("reviewer: " + (notes or "failed, no notes given"))
    write_record(week, stage, {"status": "failed", "problems": problems + (rec.get("problems") or []), "files": [],
                               "discarded": sorted(set(restored + removed + rejected)), "review": notes})
    out("%s FAILED review; its changes were discarded:\n  %s" % (stage, "\n  ".join(problems)))
    return 1


def cmd_fresh(cfg, week):
    """For runs that rely on GitHub Actions having fetched the data: the current season's
    calendar must carry today's date. If not, record the fetch stage as failed."""
    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    path = os.path.join(ROOT, "data", "calendar", "%s.json" % today[:4])
    try:
        with open(path, encoding="utf-8") as f:
            updated = json.load(f).get("updated")
    except (OSError, ValueError):
        updated = None
    if updated == today:
        out("The data was fetched today (%s)." % today)
        return 0
    problem = "data not fetched today: calendar updated %s, today is %s (UTC)" % (updated, today)
    write_record(week, "fetch", {"status": "failed", "problems": [problem], "files": []})
    out("fetch FAILED: " + problem)
    return 1


def cmd_skip(cfg, week, stage, reason):
    reason = plain(reason)
    if pending_changes():
        out("Cannot record a skip: there are unchecked changes. Run the gate instead.")
        return 2
    write_record(week, stage, {"status": "skipped", "problems": [], "files": [], "note": reason})
    out("%s skipped: %s" % (stage, reason))
    return 0


def cmd_summary(cfg, week):
    out("Run %s" % week)
    worst = 0
    for stage in cfg["order"]:
        rec = read_record(week, stage)
        status = rec.get("status") if rec else "not run"
        extra = ""
        if rec and rec.get("files"):
            extra = "  %d file(s)" % len(rec["files"])
        if rec and rec.get("rejected"):
            extra += "  %d file(s) rejected" % len(rec["rejected"])
        if rec and rec.get("note"):
            extra += "  (%s)" % rec["note"]
        out("  %-12s %s%s" % (stage, status, extra))
        for p in (rec or {}).get("problems", [])[:10]:
            out("      - " + p)
        if status == "failed":
            worst = 1
    return worst


def main():
    args = sys.argv[1:]
    week = current_week()
    if "--week" in args:
        i = args.index("--week")
        week = args[i + 1]
        del args[i:i + 2]
    if not re.match(r"^\d{4}-W\d{2}$", week):
        out("Week must look like 2026-W47.")
        return 2
    cfg = contracts()
    command = args[0] if args else ""
    stage = args[1] if len(args) > 1 else None
    if command in ("gate", "review", "skip", "can-start") and stage not in cfg["stages"]:
        out("Unknown stage %r. Stages: %s" % (stage, ", ".join(cfg["order"])))
        return 2
    try:
        if command == "start":
            return cmd_start(cfg, week)
        if command == "summary":
            return cmd_summary(cfg, week)
        if command == "fresh":
            return cmd_fresh(cfg, week)
        if command == "can-start":
            return cmd_can_start(cfg, week, stage)
        if command == "gate":
            return cmd_gate(cfg, week, stage)
        if command == "skip" and len(args) > 2:
            return cmd_skip(cfg, week, stage, " ".join(args[2:]))
        if command == "review" and len(args) > 2 and args[2] in ("passed", "failed"):
            return cmd_review(cfg, week, stage, args[2], " ".join(args[3:]))
    except RuntimeError as e:
        out(str(e))
        return 2
    out(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
