// Logic for the Tonight tab: reads ESPN's scoreboard and picks out games that
// involve pool teams. No page drawing here (that's in app.js), so tools/test.js
// can check it without a browser.
'use strict';
(function (root) {
  const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

  // YYYYMMDD for "today" in US Eastern time, shifted by offsetDays (-1 = yesterday).
  function easternDate(offsetDays, now) {
    const d = new Date((now || Date.now()) + (offsetDays || 0) * 864e5);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t).value;
    return get('year') + get('month') + get('day');
  }

  function scoreboardUrl(yyyymmdd) {
    return `${SCOREBOARD}?dates=${yyyymmdd}&groups=50&limit=500`;
  }

  // ESPN scoreboard JSON -> games with at least one pool team.
  // poolTeams: { espnId: { name, owners: [entry names] } }
  function parseGames(json, poolTeams) {
    const out = [];
    for (const e of (json && json.events) || []) {
      const c = e.competitions && e.competitions[0];
      if (!c) continue;
      const st = (c.status && c.status.type) || {};
      const sides = (c.competitors || []).map((x) => {
        const pool = poolTeams[String(x.id)] || null;
        const rank = x.curatedRank && x.curatedRank.current;
        return {
          id: String(x.id),
          name: pool ? pool.name : (x.team && (x.team.shortDisplayName || x.team.displayName)) || 'TBD',
          abbr: (x.team && x.team.abbreviation) || '',
          home: x.homeAway === 'home',
          score: x.score != null && x.score !== '' ? Number(x.score) : null,
          winner: x.winner === true,
          rank: Number.isInteger(rank) && rank >= 1 && rank <= 25 ? rank : null,
          pool,
        };
      });
      if (!sides.some((s) => s.pool)) continue;
      // away team first, like a scoreboard
      sides.sort((a, b) => Number(a.home) - Number(b.home));
      const tv = ((c.broadcasts || [])[0] || {}).names;
      out.push({
        id: String(e.id),
        date: e.date,
        state: st.state || 'pre', // pre | in | post
        detail: st.shortDetail || st.detail || '',
        canceled: /POSTPONED|CANCELED|CANCELLED/i.test(st.name || ''),
        neutral: !!c.neutralSite,
        tv: tv && tv.length ? tv.join(', ') : '',
        note: ((c.notes || [])[0] || {}).headline || '',
        sides,
      });
    }
    const order = { in: 0, pre: 1, post: 2 };
    return out.sort((a, b) => (order[a.state] - order[b.state]) || String(a.date).localeCompare(String(b.date)));
  }

  const api = { easternDate, scoreboardUrl, parseGames };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tonight = api;
})(typeof window !== 'undefined' ? window : this);
