// Downloads every drafted team's games from ESPN, scores the pool and writes
// data/standings.json for the page. Run by GitHub every day (see
// .github/workflows/update.yml). No installs needed: plain Node 20+.
//
//   node tools/update.js                 normal run
//   node tools/update.js --season 2026   score another season (for testing)
//   node tools/update.js --out file.json write somewhere else
//
// If any download fails, nothing is written, so the page keeps the last good data.
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./scoring');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

async function getJSON(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (cbb-pool dashboard)', Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i >= tries) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

function parseRecord(s) {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(String(s || ''));
  return m && { w: +m[1], l: +m[2] };
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/pool.json'), 'utf8'));
  const ov = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/overrides.json'), 'utf8'));
  const season = Number(arg('--season') || cfg.season);
  const outFile = arg('--out') || path.join(ROOT, 'data/standings.json');

  const configProblems = S.checkConfig(cfg);
  for (const k of ['seeds', 'roundsWon', 'records']) {
    for (const n of Object.keys(ov[k] || {})) {
      if (!cfg.teams.some((t) => t.name === n)) configProblems.push(`overrides.json "${k}": unknown team "${n}".`);
    }
  }
  if (configProblems.length) {
    console.error('Setup problems, nothing written:\n- ' + configProblems.join('\n- '));
    process.exit(1);
  }

  const notes = [];
  const problems = [];

  const teams = await inBatches(cfg.teams, 6, async (t) => {
    const [reg, post] = await Promise.all([
      getJSON(`${BASE}/teams/${t.espnId}/schedule?season=${season}&seasontype=2`),
      getJSON(`${BASE}/teams/${t.espnId}/schedule?season=${season}&seasontype=3`),
    ]);
    // Safety check: the id must still be the team we think it is.
    const espnName = reg.team && reg.team.displayName;
    if (espnName && t.espnName && espnName !== t.espnName) {
      notes.push(`${t.name}: ESPN now calls ESPN id ${t.espnId} "${espnName}" (was "${t.espnName}").`);
    }
    const rec = S.regularRecord(reg.events || [], t.espnId);
    rec.notes.forEach((n) => notes.push(`${t.name}: ${n}`));
    const tour = S.tournamentResult(post.events || [], t.espnId);
    tour.notes.forEach((n) => notes.push(`${t.name}: ${n}`));

    let { w, l } = rec;
    let seed = tour.seed;
    let roundsWon = tour.roundsWon;
    const overridden = [];
    if (ov.records && ov.records[t.name]) {
      const r = parseRecord(ov.records[t.name]);
      if (r) { ({ w, l } = r); overridden.push('record'); } else problems.push(`overrides.json record for ${t.name} should look like "25-6".`);
    }
    if (ov.seeds && ov.seeds[t.name] != null) { seed = Number(ov.seeds[t.name]) || null; overridden.push('seed'); }
    if (ov.roundsWon && ov.roundsWon[t.name]) { roundsWon = ov.roundsWon[t.name]; overridden.push('rounds'); }
    else tour.problems.forEach((p) => problems.push(`${t.name}: ${p}`));

    const regPts = S.regularPoints({ w, l }, cfg.scoring);
    const tp = S.tournamentPoints(seed, roundsWon, cfg.scoring);
    const nextGame = (reg.events || []).concat(post.events || [])
      .filter((e) => !(e.competitions[0].status || {}).type?.completed && new Date(e.date) > Date.now() - 6 * 3600e3)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
    let next = null;
    if (nextGame) {
      const c = nextGame.competitions[0];
      const opp = c.competitors.find((x) => String(x.id) !== String(t.espnId));
      const me = c.competitors.find((x) => String(x.id) === String(t.espnId));
      next = { date: nextGame.date, opp: opp?.team?.shortDisplayName || opp?.team?.displayName || 'TBD', home: me?.homeAway === 'home' };
    }
    return {
      name: t.name, conf: t.conf, salary: t.salary, espnId: t.espnId,
      w, l, regPts, seed, roundsWon,
      seedPts: tp.seedPts, winPts: tp.winPts, tourPts: tp.total,
      inTournament: !!seed, eliminated: tour.games.some((g) => g.completed && !g.won),
      overridden, next,
      gamesLeft: rec.left, upcoming: rec.upcoming, played: rec.played, projW: null, projL: null, projPts: null,
    };
  });

  // ---------- projections: ESPN Matchup Predictor (BPI) odds for each remaining game ----------
  // Saved in data/odds.json so each game is only re-checked when it's within two
  // weeks or the saved odds are over a week old. A failure only hides projections.
  const projections = await project(teams, cfg, notes);

  const owners = {};
  cfg.entries.forEach((en) => en.teams.forEach((n) => { owners[n] = (owners[n] || 0) + 1; }));
  teams.forEach((t) => {
    t.owners = owners[t.name] || 0;
    t.ptsPerDollar = Math.round((t.regPts / t.salary) * 100) / 100;
  });
  const byName = Object.fromEntries(teams.map((t) => [t.name, t]));
  const entries = S.scoreEntries(cfg.entries, byName, cfg);

  // Season history (points and rank after each game day) and movement since the previous game day.
  const history = S.buildHistory(cfg.entries, Object.fromEntries(teams.map((t) => [t.name, t.played])), cfg);
  teams.forEach((t) => { delete t.played; });
  entries.forEach((e) => Object.assign(e, S.movement(history, e.name)));
  const badges = S.weeklyBadges(history, entries);
  entries.forEach((e) => {
    e.badges = badges ? ['leader', 'hot', 'mover'].filter((k) => badges[k].some((b) => b.name === e.name)) : [];
  });

  const out = {
    title: cfg.title,
    season: cfg.seasonLabel,
    checkedAt: new Date().toISOString(),
    entryFee: cfg.entryFee,
    pot: { total: cfg.entries.length * cfg.entryFee, regular: cfg.payouts.regular, tournament: cfg.payouts.tournament },
    tournamentStarted: teams.some((t) => t.seed),
    projections,
    gamesPlayed: teams.reduce((s, t) => s + t.w + t.l, 0),
    entries, teams, history, badges, notes, problems,
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
  console.log(`Wrote ${path.relative(process.cwd(), outFile)}: ${teams.length} teams, ${out.gamesPlayed} games, ${entries.length} entries.`);
  notes.forEach((n) => console.log('Note: ' + n));
  if (problems.length) {
    console.error('PROBLEMS (page shows a warning):\n- ' + problems.join('\n- '));
    process.exit(2);
  }
}

async function project(teams, cfg, notes) {
  const oddsFile = path.join(ROOT, 'data/odds.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(oddsFile, 'utf8')); } catch (e) { cache = {}; }
  const now = Date.now(), DAY = 864e5;
  const games = new Map();
  teams.forEach((t) => t.upcoming.forEach((g) => games.set(g.id, g)));
  const stale = [...games.values()].filter((g) => {
    const c = cache[g.id];
    if (!c) return true;
    const soon = new Date(g.date) - now < 14 * DAY;
    return soon ? now - c.at > 0.5 * DAY : now - c.at > 7 * DAY;
  });
  let failed = 0;
  await inBatches(stale, 8, async (g) => {
    try {
      const sum = await getJSON(`${BASE}/summary?event=${g.id}`, 2);
      cache[g.id] = { at: now, odds: S.predictorOdds(sum) };
    } catch (e) { failed++; }
  });
  // keep only games that are still to be played
  const fresh = {};
  for (const id of games.keys()) if (cache[id]) fresh[id] = cache[id];
  fs.writeFileSync(oddsFile, JSON.stringify(fresh) + '\n');

  let d1 = null;
  try {
    const list = await getJSON(`${BASE}/teams?limit=500`);
    d1 = new Set(list.sports[0].leagues[0].teams.map((x) => String(x.team.id)));
  } catch (e) { /* treat every missing-odds game as a likely win */ }

  let missing = 0, total = 0;
  for (const t of teams) {
    const future = [];
    for (const g of t.upcoming) {
      total++;
      const odds = fresh[g.id] && fresh[g.id].odds;
      let p = odds ? odds[String(t.espnId)] : undefined;
      if (typeof p !== 'number') {
        const nonD1 = d1 && g.oppId && !d1.has(g.oppId);
        if (!nonD1) missing++;
        p = nonD1 || !d1 ? S.NON_D1_WIN : 0.5;
      }
      future.push({ p });
    }
    Object.assign(t, S.projectTeam({ w: t.w, l: t.l }, t.gamesLeft, future, cfg.scoring));
    delete t.upcoming;
  }
  if (failed) notes.push(`ESPN odds: ${failed} game(s) couldn't be downloaded this run; using saved odds where possible.`);
  if (total && missing / total > 0.25) {
    notes.push(`ESPN odds missing for ${missing} of ${total} remaining games; projections hidden this run.`);
    teams.forEach((t) => { t.projW = t.projL = t.projPts = null; });
    return null;
  }
  if (missing) notes.push(`ESPN odds missing for ${missing} game(s); counted as 50/50.`);
  return 'ESPN Matchup Predictor (BPI)';
}

main().catch((err) => {
  console.error('Update failed, nothing written. The page keeps the last good data.\n' + err.message);
  process.exit(1);
});
