// All the pool's scoring rules, as plain functions (no internet needed).
// tools/update.js feeds these with ESPN data; tools/test.js checks them.
'use strict';

const ROUNDS = ['R64', 'R32', 'S16', 'E8', 'F4', 'C'];
const ROUND_NAMES = {
  PI: 'Play-in', R64: 'Round of 64', R32: 'Round of 32', S16: 'Sweet 16',
  E8: 'Elite 8', F4: 'Final Four', C: 'Championship',
};

// ---------- reading ESPN schedule events ----------

function headlineOf(event) {
  const c = event.competitions && event.competitions[0];
  const n = c && c.notes && c.notes[0];
  return (n && n.headline) || '';
}

function sides(event, teamId) {
  const c = event.competitions[0];
  const me = c.competitors.find((x) => String(x.id) === String(teamId));
  const opp = c.competitors.find((x) => String(x.id) !== String(teamId));
  return { c, me, opp };
}

function isCompleted(event) {
  const s = event.competitions[0].status || event.status || {};
  return !!(s.type && s.type.completed);
}

function seedOf(competitor) {
  const r = competitor && competitor.curatedRank && competitor.curatedRank.current;
  return Number.isInteger(r) && r >= 1 && r <= 16 ? r : null;
}

// Is this postseason game part of the real NCAA Tournament (not the NIT, Crown, CBI...)?
function isNcaaTournament(event) {
  const c = event.competitions[0];
  if (c.tournamentId === 22) return true;
  const h = headlineOf(event);
  if (/\b(NIT|Crown|CBI|CIT|Women)/i.test(h)) return false;
  return /NCAA Men's Basketball Championship|Men's Basketball Championship|NCAA Tournament/i.test(h);
}

// Regular season = every finished game ESPN files under "Regular Season",
// which includes conference tournaments (checked against 2025-26 data).
function regularRecord(events, teamId) {
  let w = 0, l = 0, left = 0;
  const upcoming = [];
  const played = []; // finished games: { date (ISO), won }
  const notes = [];
  for (const e of events) {
    if (e.seasonType && e.seasonType.type !== 2) continue;
    if (!isCompleted(e)) {
      const st = ((e.competitions[0].status || {}).type || {}).name || '';
      if (!/POSTPONED|CANCELED|CANCELLED|FORFEIT/i.test(st)) {
        left++;
        const { opp } = sides(e, teamId);
        upcoming.push({ id: String(e.id), date: e.date, oppId: opp ? String(opp.id) : null });
      }
      continue;
    }
    const { me } = sides(e, teamId);
    if (!me) continue;
    if (me.winner === true) { w++; played.push({ date: e.date, won: true }); }
    else if (me.winner === false) { l++; played.push({ date: e.date, won: false }); }
    else notes.push(`Finished game on ${String(e.date).slice(0, 10)} has no winner; skipped.`);
  }
  upcoming.sort((x, y) => String(x.date).localeCompare(String(y.date)));
  return { w, l, left, upcoming, played, notes };
}

// ---------- projections (ESPN Matchup Predictor / BPI win odds) ----------
const NON_D1_WIN = 0.95; // ESPN gives no odds vs non-Division I opponents

// ESPN game summary -> { teamId: winChance 0..1 }, or null if ESPN has no prediction.
function predictorOdds(summary) {
  const pr = summary && summary.predictor;
  if (!pr || !pr.homeTeam || !pr.awayTeam) return null;
  const out = {};
  for (const side of [pr.homeTeam, pr.awayTeam]) {
    const p = parseFloat(side.gameProjection);
    if (!side.id || !Number.isFinite(p)) return null;
    out[String(side.id)] = p / 100;
  }
  return out;
}

// Expected end-of-regular-season record and points. future = [{ p }] for each
// remaining game (oldest first); extra games without odds count at NON_D1_WIN.
function projectTeam(rec, gamesLeft, future, scoring) {
  let games = future.slice();
  while (games.length > gamesLeft) games.shift();
  const extra = gamesLeft - games.length;
  const expW = games.reduce((s, g) => s + g.p, 0) + extra * NON_D1_WIN;
  const expL = gamesLeft - expW;
  const projW = rec.w + expW, projL = rec.l + expL;
  const round1 = (x) => Math.round(x * 10) / 10;
  return { gamesLeft, projW: round1(projW), projL: round1(projL), projPts: round1(projW * scoring.win + projL * scoring.loss) };
}

// Which round a headline names (used as a cross-check / fallback only).
function roundFromHeadline(h) {
  const last = String(h).split(' - ').pop();
  if (/first four|opening round|play-?in/i.test(last)) return 'PI';
  if (/\b(1st|first) round|round of 64/i.test(last)) return 'R64';
  if (/\b(2nd|second) round|round of 32/i.test(last)) return 'R32';
  if (/sweet 16|sweet sixteen|regional semi/i.test(last)) return 'S16';
  if (/elite 8|elite eight|regional final/i.test(last)) return 'E8';
  if (/final four|national semi/i.test(last)) return 'F4';
  if (/national championship|championship game/i.test(last)) return 'C';
  return null;
}

// Works out a team's NCAA Tournament seed and the rounds it has won.
// Rounds come from the bracket itself, not ESPN's round names (which may change
// with the 76-team field): the Round of 64 is the team's first game against the
// seed that adds up to 17 with its own (1 v 16, 8 v 9, ...). Every game before
// that is a play-in; every game after it is the next round.
function tournamentResult(events, teamId) {
  const games = events
    .filter(isNcaaTournament)
    .map((e) => {
      const { me, opp } = sides(e, teamId);
      return me && {
        date: e.date, headline: headlineOf(e), completed: isCompleted(e),
        won: me.winner === true, seed: seedOf(me), oppSeed: seedOf(opp),
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const seed = games.map((g) => g.seed).find((s) => s) || null;
  const roundsWon = [];
  const notes = [];
  const problems = [];
  let r64 = -1;
  games.forEach((g, i) => {
    let round = null;
    if (r64 >= 0) round = ROUNDS[i - r64] || null;
    else if (seed && g.oppSeed && seed + g.oppSeed === 17) { r64 = i; round = 'R64'; }
    else if (seed && g.oppSeed) round = 'PI';
    else round = roundFromHeadline(g.headline);
    g.round = round;
    if (!g.completed) return;
    const named = roundFromHeadline(g.headline);
    if (named && round && named !== round) notes.push(`ESPN calls the ${String(g.date).slice(0, 10)} game "${g.headline}"; scored as ${ROUND_NAMES[round]}.`);
    if (!round) { problems.push(`Can't tell which round the ${String(g.date).slice(0, 10)} game is ("${g.headline}"). Add it to config/overrides.json.`); return; }
    if (g.won) roundsWon.push(round);
  });
  return { seed, roundsWon, games, notes, problems };
}

// ---------- points ----------

function regularPoints(rec, scoring) {
  return rec.w * scoring.win + rec.l * scoring.loss;
}

function tournamentPoints(seed, roundsWon, scoring) {
  const s = seed ? scoring.seedBonus[String(seed)] || 0 : 0;
  const r = roundsWon.reduce((sum, k) => sum + (scoring.roundBonus[k] || 0), 0);
  return { seedPts: s, winPts: r, total: s + r };
}

// Ties share a rank: 10, 8, 8, 5 -> 1, 2, 2, 4
function ranks(values) {
  return values.map((v) => 1 + values.filter((x) => x > v).length);
}

// Prize money if the standings ended now. Ties split the places they cover.
function payouts(values, amounts) {
  const order = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
  const out = values.map(() => 0);
  let pos = 0;
  while (pos < order.length && pos < amounts.length) {
    const v = values[order[pos]];
    const group = order.filter((i) => values[i] === v);
    const pot = amounts.slice(pos, pos + group.length).reduce((a, b) => a + b, 0);
    group.forEach((i) => { out[i] = Math.round((pot / group.length) * 100) / 100; });
    pos += group.length;
  }
  return out;
}

// teamsByName: { name: { regPts, tourPts, salary, ... } }
function scoreEntries(entries, teamsByName, cfg) {
  const rows = entries.map((en) => {
    const teams = en.teams.map((n) => teamsByName[n]);
    // Lowest regular-season team is dropped (if tied, the cheaper one).
    const sorted = teams.slice().sort((a, b) => b.regPts - a.regPts || b.salary - a.salary);
    const kept = sorted.slice(0, cfg.scoring.countBest);
    const dropped = sorted.slice(cfg.scoring.countBest).map((t) => t.name);
    return {
      name: en.name,
      teams: en.teams,
      dropped,
      salary: teams.reduce((s, t) => s + t.salary, 0),
      regPts: kept.reduce((s, t) => s + t.regPts, 0),
      tourPts: teams.reduce((s, t) => s + t.tourPts, 0),
      gamesLeft: teams.reduce((s, t) => s + (t.gamesLeft || 0), 0),
      projRegPts: teams.every((t) => typeof t.projPts === 'number')
        ? Math.round(teams.map((t) => t.projPts).sort((a, b) => b - a).slice(0, cfg.scoring.countBest).reduce((s, x) => s + x, 0) * 10) / 10
        : null,
    };
  });
  const hasProj = rows.every((r) => r.projRegPts !== null);
  const pr = hasProj ? ranks(rows.map((r) => r.projRegPts)) : rows.map(() => null);
  rows.forEach((r, i) => { r.projRank = pr[i]; });
  const rr = ranks(rows.map((r) => r.regPts));
  const tr = ranks(rows.map((r) => r.tourPts));
  const rp = payouts(rows.map((r) => r.regPts), cfg.payouts.regular);
  const tp = payouts(rows.map((r) => r.tourPts), cfg.payouts.tournament);
  rows.forEach((r, i) => {
    r.regRank = rr[i]; r.tourRank = tr[i];
    r.regPayout = rp[i]; r.tourPayout = tp[i];
  });
  return rows;
}

// Checks the pool setup itself: rosters, salaries, names.
function checkConfig(cfg) {
  const problems = [];
  const names = new Set(cfg.teams.map((t) => t.name));
  const ids = new Set(cfg.teams.map((t) => t.espnId));
  if (names.size !== cfg.teams.length) problems.push('A team is listed twice in pool.json.');
  if (ids.size !== cfg.teams.length) problems.push('Two teams share the same ESPN id in pool.json.');
  const salary = Object.fromEntries(cfg.teams.map((t) => [t.name, t.salary]));
  const entryNames = new Set();
  for (const en of cfg.entries) {
    if (entryNames.has(en.name)) problems.push(`Two entries are both named "${en.name}".`);
    entryNames.add(en.name);
    const bad = en.teams.filter((n) => !names.has(n));
    if (bad.length) problems.push(`${en.name}: unknown team ${bad.join(', ')} (check spelling against the team list).`);
    if (en.teams.length !== 6) problems.push(`${en.name}: has ${en.teams.length} teams, not 6.`);
    if (new Set(en.teams).size !== en.teams.length) problems.push(`${en.name}: has the same team twice.`);
    const total = en.teams.reduce((s, n) => s + (salary[n] || 0), 0);
    if (total > cfg.salaryCap) problems.push(`${en.name}: salary $${total} is over the $${cfg.salaryCap} cap.`);
  }
  return problems;
}

// ---------- movement / history ----------
// YYYY-MM-DD of an ISO time in US Eastern (game nights belong to the Eastern date).
function easternDay(iso) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Rebuilds every entry's regular-season points and rank at the end of each game
// day, straight from game results (so nothing has to be saved day by day).
// playedByTeam: { teamName: [{ date, won }] }
function buildHistory(entries, playedByTeam, cfg) {
  const days = [...new Set(Object.values(playedByTeam).flat().map((g) => easternDay(g.date)))].sort();
  const pts = {}, rank = {};
  entries.forEach((e) => { pts[e.name] = []; rank[e.name] = []; });
  const teamPts = {};
  Object.keys(playedByTeam).forEach((n) => { teamPts[n] = 0; });
  const byDay = {};
  for (const [name, games] of Object.entries(playedByTeam)) {
    for (const g of games) (byDay[easternDay(g.date)] = byDay[easternDay(g.date)] || []).push({ name, won: g.won });
  }
  for (const d of days) {
    for (const g of byDay[d]) teamPts[g.name] += g.won ? cfg.scoring.win : cfg.scoring.loss;
    const totals = entries.map((e) => e.teams.map((n) => teamPts[n] || 0).sort((a, b) => b - a).slice(0, cfg.scoring.countBest).reduce((s, x) => s + x, 0));
    const r = ranks(totals);
    entries.forEach((e, i) => { pts[e.name].push(totals[i]); rank[e.name].push(r[i]); });
  }
  return { days, pts, rank };
}

// Change between the last two game days: rank move (+ = up) and points gained.
function movement(history, name) {
  const n = history.days.length;
  if (n < 2) return { move: 0, gained: history.pts[name] ? history.pts[name][n - 1] || 0 : 0, since: null };
  const r = history.rank[name], p = history.pts[name];
  return { move: r[n - 2] - r[n - 1], gained: p[n - 1] - p[n - 2], since: history.days[n - 2] };
}

// Weekly badges over the last 7 days of the season history:
//  leader = current 1st place; hot = most points gained; mover = most places climbed.
// Ties share a badge; hot/mover need a positive number.
function weeklyBadges(history, entries) {
  const n = history.days.length;
  if (!n) return null;
  const last = history.days[n - 1];
  const cutoff = new Date(new Date(last + 'T12:00:00Z').getTime() - 7 * 864e5).toISOString().slice(0, 10);
  let base = -1; // index of the last game day at or before the cutoff (-1 = season start)
  history.days.forEach((d, i) => { if (d <= cutoff) base = i; });
  const ptsAt = (name, i) => (i < 0 ? 0 : history.pts[name][i]);
  const rankAt = (name, i) => (i < 0 ? 1 : history.rank[name][i]);
  const best = (vals) => {
    const top = Math.max(...vals.map((v) => v.value));
    return top > 0 ? vals.filter((v) => v.value === top) : [];
  };
  const names = entries.map((e) => e.name);
  return {
    from: base < 0 ? history.days[0] : history.days[base],
    to: last,
    leader: entries.filter((e) => e.regRank === 1).map((e) => ({ name: e.name, value: e.regPts })),
    hot: best(names.map((nm) => ({ name: nm, value: ptsAt(nm, n - 1) - ptsAt(nm, base) }))),
    mover: best(names.map((nm) => ({ name: nm, value: rankAt(nm, base) - rankAt(nm, n - 1) }))),
  };
}

module.exports = {
  easternDay, buildHistory, movement, weeklyBadges,
  ROUNDS, ROUND_NAMES, regularRecord, predictorOdds, projectTeam, NON_D1_WIN, tournamentResult, isNcaaTournament, roundFromHeadline,
  regularPoints, tournamentPoints, ranks, payouts, scoreEntries, checkConfig,
};
