# CBB Pool dashboard

College basketball salary-cap pool (2026-27, 18 entries × $25). The owner is not very technical; same working style as their Sleeper dashboard and Chained Dice projects: plain HTML/CSS/JS, no build tools, Node 20 scripts with no installs, plain-language explanations, ask before big decisions.

## Facts
- Data: ESPN unofficial API `site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/<id>/schedule?season=<YYYY>&seasontype=2|3`. Season 2027 = 2026-27. Conference tournaments are seasontype 2; the NCAA Tournament, NIT and Crown are seasontype 3. NCAA games have headline "NCAA Men's Basketball Championship - ..." (scoreboard also has tournamentId 22). Seed = `curatedRank.current` on NCAA games. Scoreboard date ranges return 400; single dates work.
- Rounds are worked out from the bracket (first game vs seed summing to 17 = R64; before = play-ins), not from ESPN round names, because the field grows to 76 teams.
- Verified against 2025-26: tournament win points match last year's spreadsheet for every team (the sheet had Miami (FL) at 0 by mistake; ESPN shows its R64 win over Missouri).
- Names on the public page are first name + last initial (owner's choice). Never commit full names.
- Payouts: top 2 per pot. Regular $200/$100, tournament $100/$50; ties split.
- Running locally here needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
- Cache-busting: bump `?v=` in index.html when css/js change.
- Hosted at kshime3.github.io/cbb-pool (Pages source = GitHub Actions). The workflow commits `data/standings.json` daily (this also keeps the scheduled run from being auto-disabled after 60 quiet days).
- Page layout: bottom tab bar (Standings, Tonight, Roster, Teams, Tourney, Rules), one panel shown at a time, tab kept in the URL hash (#roster). Tourney data lives only on the Tourney tab (shows a "starts in March" card until seeds exist). Tonight tab: each phone reads ESPN's scoreboard directly (CORS open) via `js/tonight.js` (logic, tested in tools/test.js); refreshes every 60 s only while a game is live and the tab is visible; falls back to `next` games from standings.json. Style: "Bracket night" (Illini Grades family: hardwood, arena header, LED scoreboard; midnight + gold).
- **The page is shared with the whole pool (owner's standing rule).** Keep it neutral: no highlighting or defaulting to the owner's entry (the owner is just another entry), no owner-only wording, nothing private on the page. Roster/Bracket open on the viewer's last pick (saved on their own phone), else the regular-season leader. Before any change, check it reads right for every friend in the pool.
- Projections: ESPN Matchup Predictor (BPI) from `site.api.espn.com/.../summary?event=<id>` → `predictor.homeTeam/awayTeam.gameProjection` (percent). Saved in `data/odds.json`; games within 14 days re-checked twice a day max, others weekly. Non-D1 opponents (not in ESPN's D-I team list) count at 95%; other missing odds 50/50; >25% missing hides projections. Projected pts = current + Σ(3p−1); entry = best 5 projected. Conference tourneys excluded until scheduled. Barttorvik was tried first (owner's choice) but its CloudFront blocks GitHub's servers (HTTP 403), so the owner chose ESPN instead.

## Working rules (owner's standing rules)
- **Before building anything, give the owner the plan and wait for a go-ahead.**
- **Whenever images or styles are added or changed, offer three different options to choose from** (with a quick preview/description of each) before building.
- Ideas and the build order live in `docs/IDEAS.md`; keep it current.
