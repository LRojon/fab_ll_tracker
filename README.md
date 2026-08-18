# fab-ll-data-source

Publishes a weekly public JSON snapshot of the Flesh and Blood Living
Legend leaderboard (https://fabtcg.com/living-legend/), so the
[LL Tracker browser extension](../fab-ll-tracker) can show a shared,
community-wide "Weekly Points" column instead of every install scraping
independently.

## Setup

1. Create a new **public** GitHub repository (private repos work too, but
   then `raw.githubusercontent.com` won't be reachable without auth —
   public is simplest for a shared community data source).
2. Copy every file in this folder into that repo (including the hidden
   `.github/` folder) and push:
   ```
   git init
   git add .
   git commit -m "Initial setup"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. Go to the repo's **Actions** tab. Public repos have Actions enabled by
   default. Open the "Weekly LL snapshot" workflow and click
   **"Run workflow"** once to get your first snapshot immediately —
   otherwise it'll just wait for the Tuesday schedule.
4. Once it's run, your data lives at:
   ```
   https://raw.githubusercontent.com/<you>/<repo>/main/data/snapshots.json
   ```
   That URL is what you paste into the extension's popup settings
   ("Data source").

## How it works

`scripts/scrape.js` fetches the leaderboard page, parses every table that
has both a "Hero" and a "Living Legend Points" column (matched by header
text, not CSS classes, so it survives styling changes), and **upserts
only today's date** into `data/snapshots.json` — every previous week's
entry is left untouched. The workflow commits the file back to the repo
only if something actually changed.

## Adjusting the schedule

Edit the `cron` line in `.github/workflows/weekly-snapshot.yml`. Cron
times are UTC. Format: `minute hour day month weekday` (weekday: 0=Sun,
1=Mon, 2=Tue, ...).

## A note on scraping etiquette

This hits fabtcg.com once a week, which is very light — but it's still
worth keeping an eye on the site's terms of use, and being ready to
adjust (lower frequency, add delays, etc.) if asked. This script only
republishes the same leaderboard numbers that are already public on the
page.

## Data format

`data/snapshots.json`:
```json
{
  "2026-08-11": { "Hero Name": 812, "...": "..." },
  "2026-08-18": { "Hero Name": 849, "...": "..." }
}
```
This is the exact shape the extension expects — same schema it used to
keep in local storage, just centrally hosted now.
