"""Fetch one small batch of athlete profiles, check it, commit it, and log how it went.

Meant to be run on a schedule (twice a day). It only touches data/athletes/.

  python scripts/profile_batch.py          run one batch
  python scripts/profile_batch.py --log    show the log of past batches

A batch is skipped when the project has other uncommitted work (for example a weekly
pipeline run in progress), so the two never mix. The log is .cache/profile_batches.log.
"""
import datetime
import os
import subprocess
import sys

import build_index
import fetch_athletes
import validate
import wa

LOG = os.path.join(wa.CACHE, "profile_batches.log")


def git(*args):
    res = subprocess.run(["git"] + list(args), cwd=wa.ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return res.returncode, res.stdout.decode("utf-8", "replace").strip()


def log(text):
    os.makedirs(wa.CACHE, exist_ok=True)
    line = "%s  %s" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), text)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line)


def main():
    if "--log" in sys.argv:
        if os.path.exists(LOG):
            with open(LOG, encoding="utf-8") as f:
                sys.stdout.write(f.read())
        else:
            print("No batches have run yet.")
        return 0
    code, dirty = git("status", "--porcelain")
    if code != 0:
        log("skipped: not a git repository")
        return 1
    if dirty:
        log("skipped: the project has uncommitted changes (a weekly run in progress?)")
        return 0
    try:
        stats = fetch_athletes.main()
    except Exception as e:  # network down, page layout changed, ...
        git("checkout", "--", "data/athletes")
        log("failed: %s" % e)
        return 1
    problems = validate.check(["fetched"])
    if problems:
        # never keep a batch that does not pass the checks
        git("checkout", "--", "data/athletes")
        git("clean", "-fq", "--", "data/athletes")
        log("discarded: %d problem(s), first: %s" % (len(problems), problems[0]))
        return 1
    note = "fetched %d, waiting %d, wanted %d%s%s" % (
        stats["fetched"], stats["waiting"], stats["wanted"],
        ", failed %d" % stats["failed"] if stats["failed"] else "",
        ", REFUSED by World Athletics" if stats["refused"] else "")
    if stats["fetched"]:
        git("add", "--", "data/athletes")
        code, _ = git("commit", "-q", "-m", "Athlete profiles: batch of %d" % stats["fetched"])
        if code != 0:
            log("fetched but could not commit: " + note)
            return 1
    log(note)
    if stats["fetched"]:
        build_index.main()  # so the dashboard shows the new profiles
    return 0


if __name__ == "__main__":
    sys.exit(main())
