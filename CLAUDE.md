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
