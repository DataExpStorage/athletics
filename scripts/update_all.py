"""Run the whole weekly update: fetch everything, then rebuild the site data."""
import fetch_calendar
import fetch_results
import fetch_toplists
import update_focus
import fetch_athletes
import build_index

if __name__ == "__main__":
    for step in (fetch_calendar, fetch_results, fetch_toplists, update_focus, fetch_athletes, build_index):
        print("== %s" % step.__name__, flush=True)
        step.main()
