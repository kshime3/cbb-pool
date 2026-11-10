// Checks the scoring rules. Run: node tools/test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const S = require('./scoring');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/pool.json'), 'utf8'));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

// Builds a fake ESPN schedule event for team 1.
let day = 1;
function game({ won, seed, oppSeed, headline = '', type = 3, done = true, tid }) {
  const d = `2027-03-${String(day++).padStart(2, '0')}T20:00Z`;
  return {
    date: d, seasonType: { type },
    competitions: [{
      tournamentId: tid, notes: headline ? [{ headline }] : [],
      status: { type: { completed: done } },
      competitors: [
        { id: '1', winner: done ? won : undefined, curatedRank: { current: seed ?? 99 } },
        { id: '2', winner: done ? !won : undefined, curatedRank: { current: oppSeed ?? 99 } },
      ],
    }],
  };
}
const NCAA = "NCAA Men's Basketball Championship - East Region - ";

test('config: 45 teams, 18 entries, all rosters legal', () => {
  assert.strictEqual(cfg.teams.length, 45);
  assert.strictEqual(cfg.entries.length, 18);
  assert.deepStrictEqual(S.checkConfig(cfg), []);
});

test('config: catches over-cap and misspelled rosters', () => {
  const bad = JSON.parse(JSON.stringify(cfg));
  bad.entries[0].teams = ['Duke', 'Illinois', 'Arizona', 'UConn', 'VCU', 'Dukee'];
  const p = S.checkConfig(bad);
  assert(p.some((x) => /unknown team Dukee/.test(x)));
  bad.entries[0].teams = ['Duke', 'Illinois', 'Arizona', 'UConn', 'VCU', 'High Point'];
  assert(S.checkConfig(bad).some((x) => /over the \$101 cap/.test(x)));
});

test('regular season: +2 per win, -1 per loss; conference tournament counts; unfinished games skipped', () => {
  const ev = [
    game({ won: true, type: 2 }), game({ won: true, type: 2 }), game({ won: false, type: 2 }),
    game({ won: true, type: 2, headline: 'Big Ten Tournament - Final' }),
    game({ won: true, type: 2, done: false }),
  ];
  const r = S.regularRecord(ev, 1);
  assert.deepStrictEqual([r.w, r.l], [3, 1]);
  assert.strictEqual(S.regularPoints(r, cfg.scoring), 5);
});

test('regular season: NCAA Tournament and NIT games are not counted', () => {
  const ev = [game({ won: true, type: 2 }), game({ won: true, type: 3, headline: 'NIT - 1st Round' }), game({ won: false, type: 3, headline: NCAA + '1st Round' })];
  const r = S.regularRecord(ev, 1);
  assert.deepStrictEqual([r.w, r.l], [1, 0]);
});

test('tournament: NIT and Crown games are ignored', () => {
  const t = S.tournamentResult([game({ won: true, headline: 'NIT - 1st Round' }), game({ won: true, headline: 'College Basketball Crown - Semifinals' })], 1);
  assert.strictEqual(t.seed, null);
  assert.deepStrictEqual(t.roundsWon, []);
});

test('tournament: 1 seed wins it all = 8 + 2+4+6+8+10+12 = 50', () => {
  const ev = [
    game({ won: true, seed: 1, oppSeed: 16, tid: 22 }), game({ won: true, seed: 1, oppSeed: 8, tid: 22 }),
    game({ won: true, seed: 1, oppSeed: 4, tid: 22 }), game({ won: true, seed: 1, oppSeed: 2, tid: 22 }),
    game({ won: true, seed: 1, oppSeed: 1, tid: 22 }), game({ won: true, seed: 1, oppSeed: 3, tid: 22 }),
  ];
  const t = S.tournamentResult(ev, 1);
  assert.deepStrictEqual(t.roundsWon, ['R64', 'R32', 'S16', 'E8', 'F4', 'C']);
  assert.strictEqual(S.tournamentPoints(t.seed, t.roundsWon, cfg.scoring).total, 50);
});

test('tournament: play-in loser still gets its seed bonus', () => {
  const t = S.tournamentResult([game({ won: false, seed: 11, oppSeed: 11, headline: NCAA + 'First Four' })], 1);
  assert.strictEqual(t.seed, 11);
  assert.strictEqual(S.tournamentPoints(t.seed, t.roundsWon, cfg.scoring).total, 3);
});

test('tournament (76 teams): two play-in wins, then R64 win = seed 1 + 1 + 1 + 2', () => {
  // ESPN might rename rounds; the bracket logic does not depend on the names.
  const ev = [
    game({ won: true, seed: 16, oppSeed: 16, headline: NCAA + 'Opening Round' }),
    game({ won: true, seed: 16, oppSeed: 16, headline: NCAA + 'First Round' }),
    game({ won: true, seed: 16, oppSeed: 1, headline: NCAA + 'Second Round' }),
    game({ won: false, seed: 16, oppSeed: 8, headline: NCAA + 'Third Round' }),
  ];
  const t = S.tournamentResult(ev, 1);
  assert.deepStrictEqual(t.roundsWon, ['PI', 'PI', 'R64']);
  assert.strictEqual(S.tournamentPoints(t.seed, t.roundsWon, cfg.scoring).total, 1 + 1 + 1 + 2);
  assert.deepStrictEqual(t.problems, []);
});

test('tournament: seed is known before games are played (Selection Sunday)', () => {
  const t = S.tournamentResult([game({ done: false, seed: 5, oppSeed: 12, headline: NCAA + '1st Round' })], 1);
  assert.strictEqual(t.seed, 5);
  assert.strictEqual(S.tournamentPoints(t.seed, t.roundsWon, cfg.scoring).total, 6);
});

test('seed bonus table', () => {
  const want = { 1: 8, 2: 8, 3: 7, 4: 7, 5: 6, 6: 6, 7: 5, 8: 5, 9: 4, 10: 4, 11: 3, 12: 3, 13: 2, 14: 2, 15: 1, 16: 1 };
  for (const [s, p] of Object.entries(want)) assert.strictEqual(S.tournamentPoints(+s, [], cfg.scoring).total, p);
});

test('ties share a rank', () => {
  assert.deepStrictEqual(S.ranks([10, 8, 8, 5, 10]), [1, 3, 3, 5, 1]);
});

test('payouts: ties split the money for the places they cover', () => {
  assert.deepStrictEqual(S.payouts([30, 20, 10], [200, 100]), [200, 100, 0]);
  assert.deepStrictEqual(S.payouts([30, 30, 10], [200, 100]), [150, 150, 0]);
  assert.deepStrictEqual(S.payouts([30, 20, 20], [100, 50]), [100, 25, 25]);
  assert.deepStrictEqual(S.payouts([5, 5, 5], [200, 100]), [100, 100, 100]);
});

test('entries: lowest team dropped from regular season only; all 6 count in tournament', () => {
  const teams = {};
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach((n, i) => { teams[n] = { name: n, regPts: 10 * (i + 1), tourPts: 1, salary: 5 }; });
  teams.A.regPts = -3;
  const [row] = S.scoreEntries([{ name: 'X', teams: ['A', 'B', 'C', 'D', 'E', 'F'] }], teams, cfg);
  assert.deepStrictEqual(row.dropped, ['A']);
  assert.strictEqual(row.regPts, 20 + 30 + 40 + 50 + 60);
  assert.strictEqual(row.tourPts, 6);
  assert.strictEqual(row.salary, 30);
});

test('projection: expected wins from win odds; +2/-1 scoring', () => {
  // 2-1 now (3 pts), 3 games left at 90%, 50%, 10% -> 1.5 expected wins
  const p = S.projectTeam({ w: 2, l: 1 }, 3, [{ date: 1, p: 0.9 }, { date: 2, p: 0.5 }, { date: 3, p: 0.1 }], cfg.scoring);
  assert.deepStrictEqual(p, { gamesLeft: 3, projW: 3.5, projL: 2.5, projPts: 4.5 });
});

test('projection: games without odds (non-D1) count at 95%; extra odds entries are ignored', () => {
  const extra = S.projectTeam({ w: 0, l: 0 }, 2, [{ date: 1, p: 0.5 }], cfg.scoring);
  assert.strictEqual(extra.projW, 1.5); // 0.5 + 0.95, rounded
  const ahead = S.projectTeam({ w: 1, l: 0 }, 1, [{ date: 1, p: 0.2 }, { date: 2, p: 0.8 }], cfg.scoring);
  assert.strictEqual(ahead.projW, 1.8); // the 0.2 game already finished on ESPN
});

test('projection: ESPN Matchup Predictor -> win chance per team', () => {
  const sum = { predictor: { homeTeam: { id: '150', gameProjection: '90.9' }, awayTeam: { id: '152', gameProjection: '9.1' } } };
  assert.deepStrictEqual(S.predictorOdds(sum), { 150: 0.909, 152: 0.091 });
  assert.strictEqual(S.predictorOdds({}), null);
});

test('entries: games left counts all 6 teams; projection keeps the best 5', () => {
  const teams = {};
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach((n, i) => { teams[n] = { name: n, regPts: 0, tourPts: 0, salary: 1, gamesLeft: 10, projPts: i * 10 }; });
  const [row] = S.scoreEntries([{ name: 'X', teams: ['A', 'B', 'C', 'D', 'E', 'F'] }], teams, cfg);
  assert.strictEqual(row.gamesLeft, 60);
  assert.strictEqual(row.projRegPts, 10 + 20 + 30 + 40 + 50);
  assert.strictEqual(row.projRank, 1);
});

test('tonight: scoreboard -> only games with pool teams, live first, away team listed first', () => {
  const T = require('../js/tonight');
  const comp = (id, homeAway, score, extra) => Object.assign({ id, homeAway, score, team: { shortDisplayName: 'Team ' + id, abbreviation: 'T' + id } }, extra || {});
  const ev = (id, date, state, competitors, name) => ({ id, date, competitions: [{ status: { type: { state, shortDetail: state === 'in' ? '8:14 - 2nd Half' : 'x', name: name || '' } }, broadcasts: [{ names: ['ESPN'] }], competitors }] });
  const json = { events: [
    ev('1', '2026-11-11T00:00Z', 'pre', [comp('150', 'home', '0'), comp('127', 'away', '0')]),
    ev('2', '2026-11-10T23:00Z', 'in', [comp('999', 'home', '40'), comp('2272', 'away', '44')]),
    ev('3', '2026-11-10T22:00Z', 'post', [comp('998', 'home', '70'), comp('997', 'away', '60')]),
  ] };
  const pool = { 150: { name: 'Duke', owners: ['A', 'B'] }, 127: { name: 'Michigan State', owners: ['C'] }, 2272: { name: 'High Point', owners: ['D'] } };
  const g = T.parseGames(json, pool);
  assert.deepStrictEqual(g.map((x) => x.id), ['2', '1']); // game 3 has no pool team; live game first
  assert.deepStrictEqual(g[1].sides.map((x) => x.name), ['Michigan State', 'Duke']); // away first
  assert.strictEqual(g[0].sides[0].score, 44);
  assert.strictEqual(g[1].tv, 'ESPN');
  assert.strictEqual(T.easternDate(0, Date.UTC(2026, 10, 11, 3, 0)), '20261110'); // 10 pm Eastern on Nov 10
});

test('history: points and rank rebuilt per game day (Eastern dates); movement since the previous day', () => {
  const mini = { scoring: Object.assign({}, cfg.scoring, { countBest: 1 }) };
  const entries = [{ name: 'X', teams: ['A'] }, { name: 'Y', teams: ['B'] }];
  const played = {
    A: [{ date: '2026-11-04T00:00Z', won: true }, { date: '2026-11-06T01:00Z', won: false }], // Nov 3 and Nov 5 Eastern
    B: [{ date: '2026-11-04T23:00Z', won: true }, { date: '2026-11-06T00:30Z', won: true }], // Nov 4 and Nov 5 Eastern
  };
  const h = S.buildHistory(entries, played, mini);
  assert.deepStrictEqual(h.days, ['2026-11-03', '2026-11-04', '2026-11-05']);
  assert.deepStrictEqual(h.pts.X, [2, 2, 1]);
  assert.deepStrictEqual(h.pts.Y, [0, 2, 4]);
  assert.deepStrictEqual(h.rank.X, [1, 1, 2]);
  assert.deepStrictEqual(S.movement(h, 'Y'), { move: 0, gained: 2, since: '2026-11-04' }); // was tied for 1st, still 1st
  assert.deepStrictEqual(S.movement(h, 'X'), { move: -1, gained: -1, since: '2026-11-04' });
});

test('badges: 7-day window, ties share, leader = current 1st', () => {
  const h = {
    days: ['2026-11-01', '2026-11-03', '2026-11-08', '2026-11-10'],
    pts: { X: [2, 4, 6, 8], Y: [0, 2, 10, 12], Z: [4, 4, 4, 4] },
    rank: { X: [2, 1, 2, 2], Y: [3, 2, 1, 1], Z: [1, 1, 3, 3] },
  };
  const entries = [{ name: 'X', regRank: 2, regPts: 8 }, { name: 'Y', regRank: 1, regPts: 12 }, { name: 'Z', regRank: 3, regPts: 4 }];
  const b = S.weeklyBadges(h, entries);
  assert.strictEqual(b.from, '2026-11-03'); // last game day on/before Nov 3 (= Nov 10 - 7)
  assert.deepStrictEqual(b.leader, [{ name: 'Y', value: 12 }]);
  assert.deepStrictEqual(b.hot, [{ name: 'Y', value: 10 }]);
  assert.deepStrictEqual(b.mover, [{ name: 'Y', value: 1 }]);
  const tie = S.weeklyBadges({ days: ['2026-11-10'], pts: { X: [2], Y: [2] }, rank: { X: [1], Y: [1] } }, [{ name: 'X', regRank: 1, regPts: 2 }, { name: 'Y', regRank: 1, regPts: 2 }]);
  assert.deepStrictEqual(tie.hot.map((x) => x.name), ['X', 'Y']);
  assert.deepStrictEqual(tie.mover, []); // nobody climbed: no badge
});

console.log(`\n${passed} checks passed.`);
