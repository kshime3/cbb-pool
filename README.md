# College Hoops Salary-Cap Pool (2026-27)

A phone-friendly standings page for the pool. It updates itself every morning
from ESPN. Nothing needs to be running on your computer.

**Page:** https://kshime3.github.io/cbb-pool/

## How it works

- Every day at about 6:15 am Eastern, GitHub runs `tools/update.js`. It downloads every drafted team's games from ESPN, scores the pool and saves the result in `data/standings.json`. Then it republishes the page.
- The page shows **Updated <date and time>** at the top. That is the last time ESPN was checked successfully.

## Update right now

1. Open https://github.com/kshime3/cbb-pool/actions/workflows/update.yml
2. Click **Run workflow**, then the green **Run workflow** button.
3. Wait about a minute, then reload the page.

## How you'd know something broke

- **Email:** if an update fails, GitHub emails you ("Run failed: Update pool").
- **On the page:** a yellow box appears if the numbers are more than 36 hours old. A red box appears if a tournament game can't be scored.
- The page **keeps showing the last good numbers** until the next good update.
- To see the history, open the **Actions** tab. A green check means it worked; a red X means it failed. Click the red X, then **Get scores from ESPN**, to see the reason in plain words.

## If ESPN gets something wrong (or a team name breaks)

Teams are matched to ESPN by number (`espnId` in `config/pool.json`), not by name, so a spelling change on ESPN's side can't break the match. If ESPN has a wrong record, seed or tournament result:

1. Open `config/overrides.json` on GitHub and click the pencil icon.
2. Fill in the team, for example:
   - `"seeds": { "High Point": 12 }`
   - `"roundsWon": { "High Point": ["PI", "R64"] }`
   - `"records": { "Duke": "25-6" }`
3. Click **Commit changes**. The page rebuilds in about a minute. Hand-entered numbers show a ✎ mark in the teams table.

Remove the line again once ESPN is right.

## Files

| File | What it is |
|---|---|
| `config/pool.json` | Teams, salaries, ESPN ids, rosters, scoring, payouts |
| `config/overrides.json` | Hand corrections (normally empty) |
| `tools/scoring.js` | The scoring rules |
| `tools/update.js` | Downloads from ESPN and writes `data/standings.json` |
| `tools/test.js` | Checks the rules (`node tools/test.js`) |
| `index.html`, `css/`, `js/app.js` | The page |
| `.github/workflows/update.yml` | The daily schedule |
