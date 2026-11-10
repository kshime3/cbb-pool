// Draws the dashboard from data/standings.json (written each morning by tools/update.js).
'use strict';
(function () {
  const STALE_HOURS = 36;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  const ptsHtml = (n) => `<span class="${n > 0 ? 'up' : n < 0 ? 'down' : ''}">${signed(n)}</span>`;
  const seedHtml = (s) => (s ? `<span class="seed">${s}</span>` : '—');
  const hasProj = () => !!D.projections;
  const proj = (n) => (typeof n === 'number' ? String(Math.round(n)) : '—');
  const badge = (n) => `<span class="money">$${Math.round(n)}</span>`;
  let D = null;
  let selected = null;

  function rankLabel(rank, all) {
    return (all.filter((r) => r === rank).length > 1 ? 'T' : '') + rank;
  }
  function leaders(key) {
    const best = Math.max(...D.entries.map((e) => e[key]));
    return { best, names: D.entries.filter((e) => e[key] === best).map((e) => e.name) };
  }
  function rankPill(rank, all) {
    return `<span class="rank-pill${rank <= 2 ? ' p' + rank : ''}">${rankLabel(rank, all)}</span>`;
  }
  function joinNames(n) {
    return n.length <= 2 ? n.join(' & ') : `${n.length}-way tie`;
  }

  // ---------- sortable tables ----------
  // cols: [{ key, label, cls, html(row), sort(row) }]
  function sortableTable(el, cols, rows, opts) {
    let sortKey = opts.sortKey, dir = opts.dir || -1;
    let open = null; // row whose detail panel is showing
    function draw() {
      const col = cols.find((c) => c.key === sortKey);
      const val = col.sort || ((r) => r[col.key]);
      const sorted = rows.slice().sort((a, b) => {
        const x = val(a), y = val(b);
        const c = typeof x === 'string' || typeof y === 'string'
          ? String(x ?? '').localeCompare(String(y ?? ''))
          : (x ?? -Infinity) - (y ?? -Infinity);
        return c * dir || String(a.name).localeCompare(String(b.name));
      });
      const head = cols.map((c) => {
        const on = c.key === sortKey;
        const aria = on ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : '';
        return `<th class="${c.cls || ''}"${aria}><button type="button" data-k="${c.key}">${c.label}<span class="arrow">${on ? (dir > 0 ? '▲' : '▼') : ''}</span></button></th>`;
      }).join('');
      const body = sorted.map((r) => {
        const isOpen = opts.detail && open === r.name;
        const cls = [opts.rowClass ? opts.rowClass(r) : '', opts.detail ? 'click' : '', isOpen ? 'open' : ''].join(' ').trim();
        const aria = opts.detail ? ` aria-expanded="${isOpen}"` : '';
        const main = `<tr class="${cls}" data-name="${esc(r.name)}"${aria}>${cols.map((c) => `<td class="${c.cls || ''}">${c.html ? c.html(r) : esc(r[c.key] ?? '—')}</td>`).join('')}</tr>`;
        return isOpen ? main + `<tr class="detail"><td colspan="${cols.length}"><div class="detail-in">${opts.detail(r)}</div></td></tr>` : main;
      }).join('');
      el.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
    }
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('th button');
      if (b) {
        const k = b.dataset.k;
        const col = cols.find((c) => c.key === k);
        if (k === sortKey) dir = -dir; else { sortKey = k; dir = col.asc ? 1 : -1; }
        draw();
        return;
      }
      const chip = ev.target.closest('[data-entry]');
      if (chip) { select(chip.dataset.entry); showTab('roster'); return; }
      const tr = ev.target.closest('tbody tr[data-name]');
      if (!tr) return;
      if (opts.detail) { open = open === tr.dataset.name ? null : tr.dataset.name; draw(); return; }
      if (opts.onRow) opts.onRow(tr.dataset.name);
    });
    draw();
    return { redraw: draw };
  }

  // ---------- sections ----------
  function alerts() {
    const out = [];
    const ageH = (Date.now() - new Date(D.checkedAt)) / 3600e3;
    if (ageH > STALE_HOURS) {
      out.push(`<div class="alert"><b>These numbers may be out of date.</b> The last successful update was ${Math.floor(ageH / 24)} day(s) ago. The daily update may have failed; the pool organizer has been emailed.</div>`);
    }
    if (D.problems && D.problems.length) {
      out.push(`<div class="alert bad"><b>Some tournament results need a manual check:</b><ul>${D.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`);
    }
    $('alerts').innerHTML = out.join('');
  }

  function tiles() {
    const reg = leaders('regPts');
    const regMoney = D.entries.find((e) => e.name === reg.names[0]).regPayout;
    $('t-reg').textContent = D.gamesPlayed ? joinNames(reg.names) : '—';
    $('t-reg-s').textContent = D.gamesPlayed ? `${reg.best} pts · ${money(regMoney)} if it ended now` : 'No games yet';
    if (D.tournamentStarted) {
      const t = leaders('tourPts');
      const tMoney = D.entries.find((e) => e.name === t.names[0]).tourPayout;
      $('t-tour').textContent = joinNames(t.names);
      $('t-tour-s').textContent = `${t.best} pts · ${money(tMoney)} if it ended now`;
    } else {
      $('t-tour').textContent = '—';
      $('t-tour-s').textContent = 'Starts in March';
    }
    $('t-entries').textContent = D.entries.length;
    $('t-entries-s').textContent = `${money(D.entryFee)} each`;
    $('t-pot').textContent = money(D.pot.total);
    $('t-pot-s').textContent = `Regular ${money(sum(D.pot.regular))} · Tourney ${money(sum(D.pot.tournament))}`;
  }

  function chart() {
    const rows = D.entries.slice().sort((a, b) => b.regPts - a.regPts || a.name.localeCompare(b.name));
    const rankList = D.entries.map((e) => e.regRank);
    const max = Math.max(0, ...rows.map((r) => r.regPts));
    const min = Math.min(0, ...rows.map((r) => r.regPts));
    const span = max - min || 1;
    // leave room at the right for the value label
    const zero = (-min / span) * 82;
    $('chart').innerHTML = rows.map((r) => {
      const w = (Math.abs(r.regPts) / span) * 82;
      const neg = r.regPts < 0;
      const left = neg ? zero - w : zero;
      const lab = neg ? `right:${100 - left + 1}%` : `left:${zero + w + 1.5}%`;
      return `<button type="button" role="listitem" class="bar-row" data-name="${esc(r.name)}" aria-label="${esc(r.name)}: ${r.regPts} points">
        <span class="bar-rank">${rankLabel(r.regRank, rankList)}</span>
        <span class="bar-name">${esc(r.name)}</span>
        <span class="bar-track"><span class="bar-zero" style="left:${zero}%"></span>${w ? `<span class="bar${neg ? ' neg' : ''}" style="left:${left}%;width:${w}%"></span>` : ''}<span class="bar-val" style="${lab}">${r.regPts}</span></span>
      </button>`;
    }).join('');
  }

  const ROUND_SHORT = { PI: 'Play-in', R64: 'R64', R32: 'R32', S16: 'S16', E8: 'E8', F4: 'F4', C: 'Title' };
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const place = (a) => a.map((v, i) => `${['1st', '2nd', '3rd'][i]} ${money(v)}`).join(', ');
  const byName = () => Object.fromEntries(D.teams.map((t) => [t.name, t]));
  function status(t) {
    if (!t.seed) return '<span class="st out">Not in field</span>';
    return t.eliminated ? '<span class="st out">Out</span>' : '<span class="st alive">Alive</span>';
  }
  function aliveCount(en) {
    const T = byName();
    return en.teams.filter((n) => T[n].seed && !T[n].eliminated).length;
  }

  // ---------- Standings tab ----------
  let standingsTable;
  function standings() {
    const rr = D.entries.map((e) => e.regRank);
    const cols = [
      { key: 'name', label: 'Entry', cls: 'l', asc: true, html: (r) => esc(r.name) },
      { key: 'regRank', label: 'Rank', asc: true, html: (r) => rankPill(r.regRank, rr) + (D.history ? moveHtml(r.move) : '') },
      ...(D.history ? [{ key: 'gained', label: 'Last<br>day', html: (r) => ptsHtml(r.gained) }] : []),
      { key: 'regPts', label: 'Pts', html: (r) => r.regPts + (r.regPayout && D.gamesPlayed ? badge(r.regPayout) : '') },
      ...(hasProj() ? [
        { key: 'projRegPts', label: 'Proj<br>pts', html: (r) => `<span class="proj">${proj(r.projRegPts)}</span>` },
        { key: 'projRank', label: 'Proj<br>rank', asc: true, html: (r) => `<span class="proj">${rankLabel(r.projRank, D.entries.map((e) => e.projRank))}</span>` },
      ] : []),
      { key: 'gamesLeft', label: 'Games<br>left' },
      { key: 'dropped', label: 'Dropped', cls: 'l', sort: (r) => r.dropped.join(), html: (r) => esc(r.dropped.join(', ')) },
      { key: 'salary', label: 'Salary', html: (r) => money(r.salary) },
    ];
    standingsTable = sortableTable($('standings'), cols, D.entries, {
      sortKey: 'regRank', dir: 1,
      rowClass: () => 'click',
      onRow: (n) => { select(n); showTab('roster'); },
    });
  }

  // ---------- Roster tab ----------
  function roster() {
    const en = D.entries.find((e) => e.name === selected);
    const T = byName();
    const teams = en.teams.map((n) => T[n]).sort((a, b) => b.regPts - a.regPts);
    const when = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const row = (t) => {
      const drop = en.dropped.includes(t.name);
      const next = `<span class="nextg">${money(t.salary)}${t.next ? ` · Next: ${t.next.home ? 'vs' : 'at'} ${esc(t.next.opp)}, ${when(t.next.date)}` : ''}</span>`;
      return `<tr class="${drop ? 'dropped' : ''}"><td class="l"><span class="team">${esc(t.name)}</span>${drop ? '<span class="tag-drop">Dropped</span>' : ''}${next}</td>
        <td>${t.w}-${t.l}</td><td class="rp">${drop ? signed(t.regPts) : ptsHtml(t.regPts)}</td>${hasProj() ? `<td class="proj">${proj(t.projPts)}</td>` : ''}<td>${t.gamesLeft}</td></tr>`;
    };
    $('roster').innerHTML = `<thead><tr><th class="l">Team</th><th>Record</th><th>Pts</th>${hasProj() ? '<th>Proj<br>pts</th>' : ''}<th>Games<br>left</th></tr></thead>
      <tbody>${teams.map(row).join('')}</tbody>
      <tfoot><tr><td class="l">Total <span class="nextg">best 5 · salary ${money(en.salary)}</span></td><td></td><td>${en.regPts}</td>${hasProj() ? `<td>${proj(en.projRegPts)}</td>` : ''}<td>${en.gamesLeft}</td></tr></tfoot>`;
    const rr = D.entries.map((e) => e.regRank);
    $('roster-summary').innerHTML = `
      <div><b>${rankLabel(en.regRank, rr)}</b><span>of ${D.entries.length}${D.history ? ' ' + moveHtml(en.move) : ''}</span></div>
      <div><b>${en.regPts}</b><span>points${D.history && en.gained ? ` (${signed(en.gained)})` : ''}</span></div>
      <div><b>${en.gamesLeft}</b><span>games left</span></div>
      ${hasProj() ? `<div><b>${rankLabel(en.projRank, D.entries.map((e) => e.projRank))}</b><span>proj. finish</span></div>` : ''}`;
  }

  // Who drafted a team (tap a team on the Teams or Tourney tab).
  function ownersPanel(t) {
    const owners = D.entries.filter((e) => e.teams.includes(t.name)).sort((a, b) => a.name.localeCompare(b.name));
    if (!owners.length) return '<span class="muted">Nobody drafted this team.</span>';
    const chips = owners.map((e) => `<button type="button" class="owner" data-entry="${esc(e.name)}">${esc(e.name)}${e.dropped.includes(t.name) ? '<small>dropped</small>' : ''}</button>`).join('');
    return `<div class="owners-head">Owned by ${owners.length} of ${D.entries.length} entries</div><div class="owners">${chips}</div><div class="owners-hint">Tap a name to see that roster.</div>`;
  }

  // ---------- Teams tab ----------
  function teamsTable() {
    const cols = [
      { key: 'name', label: 'Team', cls: 'l', asc: true, html: (r) => esc(r.name) + (r.overridden && r.overridden.length ? '<span class="tag" title="Entered by hand">✎</span>' : '') },
      { key: 'record', label: 'Record', sort: (r) => r.w - r.l, html: (r) => `${r.w}-${r.l}` },
      { key: 'regPts', label: 'Pts', html: (r) => ptsHtml(r.regPts) },
      ...(hasProj() ? [
        { key: 'projPts', label: 'Proj<br>pts', html: (r) => `<span class="proj">${proj(r.projPts)}</span>` },
        { key: 'projRec', label: 'Proj<br>record', sort: (r) => r.projW - r.projL, html: (r) => `<span class="proj">${Math.round(r.projW)}-${Math.round(r.projL)}</span>` },
      ] : []),
      { key: 'gamesLeft', label: 'Games<br>left' },
      { key: 'salary', label: 'Salary', html: (r) => money(r.salary) },
      { key: 'ptsPerDollar', label: 'Pts<br>per $', html: (r) => r.ptsPerDollar.toFixed(2) },
      { key: 'owners', label: 'Owned<br>by' },
      { key: 'conf', label: 'Conf', cls: 'l', asc: true },
    ];
    sortableTable($('teams'), cols, D.teams, { sortKey: 'regPts', detail: ownersPanel });
  }

  // ---------- Tourney tab ----------
  let tourTable;
  function tourney() {
    $('tour-payout-text').textContent = `${money(sum(D.pot.tournament))} total (${place(D.pot.tournament)})`;
    $('tour-waiting').hidden = D.tournamentStarted;
    $('tour-live').hidden = !D.tournamentStarted;
    if (!D.tournamentStarted) return;
    const tr = D.entries.map((e) => e.tourRank);
    const rows = D.entries.map((e) => Object.assign({}, e, { alive: aliveCount(e) }));
    tourTable = sortableTable($('tour-standings'), [
      { key: 'name', label: 'Entry', cls: 'l', asc: true, html: (r) => esc(r.name) },
      { key: 'tourRank', label: 'Rank', asc: true, html: (r) => rankPill(r.tourRank, tr) },
      { key: 'tourPts', label: 'Pts', html: (r) => r.tourPts + (r.tourPayout ? `<span class="money">${money(r.tourPayout)}</span>` : '') },
      { key: 'alive', label: 'Teams<br>alive', html: (r) => `${r.alive} of 6` },
    ], rows, {
      sortKey: 'tourRank', dir: 1,
      rowClass: () => 'click',
      onRow: (n) => { select(n); $('tour-pick').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    });
    const field = D.teams.filter((t) => t.seed);
    sortableTable($('tour-teams'), [
      { key: 'name', label: 'Team', cls: 'l', asc: true, html: (r) => esc(r.name) + (r.overridden && r.overridden.length ? '<span class="tag" title="Entered by hand">✎</span>' : '') },
      { key: 'seed', label: 'Seed', asc: true, html: (r) => seedHtml(r.seed) },
      { key: 'wins', label: 'Wins', sort: (r) => r.roundsWon.length, html: (r) => r.roundsWon.length },
      { key: 'tourPts', label: 'Pts' },
      { key: 'owners', label: 'Owned<br>by' },
      { key: 'st', label: 'Status', cls: 'l', sort: (r) => (r.eliminated ? 0 : 1), html: status },
    ], field, { sortKey: 'tourPts', detail: ownersPanel });
  }

  function tourRoster() {
    if (!D.tournamentStarted) return;
    const en = D.entries.find((e) => e.name === selected);
    const T = byName();
    const teams = en.teams.map((n) => T[n]).sort((a, b) => b.tourPts - a.tourPts);
    const wins = (t) => (t.roundsWon.length ? t.roundsWon.map((r) => `<span class="rd">${ROUND_SHORT[r] || r}</span>`).join('') : '<span class="muted">—</span>');
    $('tour-roster').innerHTML = `<thead><tr><th class="l">Team</th><th>Seed</th><th class="l">Wins</th><th>Pts</th></tr></thead>
      <tbody>${teams.map((t) => `<tr><td class="l">${esc(t.name)}<span class="under">${status(t)}</span></td><td>${seedHtml(t.seed)}</td><td class="l wins">${wins(t)}</td>
        <td title="Seed ${t.seedPts} + wins ${t.winPts}">${t.tourPts}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td class="l">Total</td><td></td><td></td><td>${en.tourPts}</td></tr></tfoot>`;
  }


  // ---------- Movement: ticker, arrows, rank race ----------
  const sinceLabel = () => {
    const d = D.entries[0] && D.entries[0].since;
    return d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  };
  const moveHtml = (m) => (m > 0 ? `<span class="mv up">▲${m}</span>` : m < 0 ? `<span class="mv down">▼${-m}</span>` : '<span class="mv same">–</span>');
  function ticker() {
    if (!D.history || D.history.days.length < 2) return;
    const movers = D.entries.filter((e) => e.move).sort((a, b) => Math.abs(b.move) - Math.abs(a.move) || b.gained - a.gained || a.name.localeCompare(b.name));
    const day = new Date(D.entries[0].since + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
    $('ticker-label').textContent = 'SINCE ' + day;
    const items = movers.length
      ? movers.map((e) => `<span class="tk ${e.move > 0 ? 'up' : 'down'}">${e.move > 0 ? '▲' : '▼'} ${esc(e.name.toUpperCase())} ${e.move > 0 ? '+' : '−'}${Math.abs(e.move)}</span>`)
      : [`<span class="tk">NO PLACE CHANGES</span>`];
    const one = items.join('<span class="tk-sep">·</span>') + '<span class="tk-sep">·</span>';
    $('ticker-track').innerHTML = `<span class="tk-run">${one}</span><span class="tk-run" aria-hidden="true">${one}</span>`;
    $('ticker-track').style.setProperty('--dur', Math.max(12, movers.length * 2.6) + 's');
    $('ticker').hidden = false;
    $('since-day').textContent = sinceLabel();
  }

  let raceSel = '';
  function race() {
    const H = D.history;
    if (!H || H.days.length < 2) { $('race-card').hidden = true; return; }
    const names = D.entries.map((e) => e.name).sort();
    const sel = $('race-pick');
    sel.innerHTML = `<option value="">Nobody</option>` + names.map((n) => `<option${n === raceSel ? ' selected' : ''}>${esc(n)}</option>`).join('');
    sel.onchange = (e) => { raceSel = e.target.value; race(); };
    const W = 340, Hh = 290, L = 30, R = 40, T = 10, B = 26;
    const n = H.days.length, N = D.entries.length;
    const x = (i) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R));
    const y = (r) => T + ((r - 1) / Math.max(1, N - 1)) * (Hh - T - B);
    const path = (name) => H.rank[name].map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(' ');
    const ord = (k) => k + (k % 10 === 1 && k !== 11 ? 'st' : k % 10 === 2 && k !== 12 ? 'nd' : k % 10 === 3 && k !== 13 ? 'rd' : 'th');
    const grid = [1, 6, 12, N].map((r) => `<line class="rg" x1="${L}" x2="${W - R}" y1="${y(r)}" y2="${y(r)}"/><text class="rl" x="${L - 6}" y="${y(r) + 4}" text-anchor="end">${ord(r)}</text>`).join('');
    const dfmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const xl = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i)
      .map((i) => `<text class="rl" x="${x(i)}" y="${Hh - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${dfmt(H.days[i])}</text>`).join('');
    const others = names.filter((nm) => nm !== raceSel).map((nm) => `<g class="ln" data-name="${esc(nm)}"><title>${esc(nm)}: now ${ord(H.rank[nm][n - 1])}</title><path class="hit" d="${path(nm)}"/><path class="line" d="${path(nm)}"/></g>`).join('');
    let hi = '';
    if (raceSel && H.rank[raceSel]) {
      const last = H.rank[raceSel][n - 1];
      hi = `<g class="ln on" data-name="${esc(raceSel)}"><path class="line" d="${path(raceSel)}"/>
        ${H.rank[raceSel].map((r, i) => `<circle cx="${x(i)}" cy="${y(r)}" r="3.5"/>`).join('')}
        <text class="end" x="${x(n - 1) + 8}" y="${y(last) + 4}">${ord(last)}</text></g>`;
    }
    $('race').innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Rank of every entry after each game day${raceSel ? ', ' + esc(raceSel) + ' highlighted' : ''}">${grid}${xl}${others}${hi}</svg>`;
    $('race').onclick = (e) => { const g = e.target.closest('.ln'); if (g) { raceSel = g.dataset.name === raceSel ? '' : g.dataset.name; race(); } };
  }

  // ---------- Tonight tab ----------
  const NIGHT = { day: 0, games: null, error: null, loading: false, open: null, timer: null, loadedFor: null };
  const DAY_LABELS = { '-1': 'Yesterday', 0: 'Today', 1: 'Tomorrow' };
  function poolTeamsById() {
    const owners = {};
    D.entries.forEach((e) => e.teams.forEach((n) => { (owners[n] = owners[n] || []).push(e.name); }));
    const out = {};
    D.teams.forEach((t) => { out[String(t.espnId)] = { name: t.name, owners: (owners[t.name] || []).sort() }; });
    return out;
  }
  function nightFilter() {
    try { return localStorage.getItem('cbbpool_tonight_filter') || ''; } catch (e) { return ''; }
  }
  function loadTonight(force) {
    if (!D || !window.Tonight) return;
    const ymd = Tonight.easternDate(NIGHT.day);
    if (!force && NIGHT.loadedFor === ymd && NIGHT.games) { drawTonight(); return; }
    NIGHT.loading = true; drawTonight();
    fetch(Tonight.scoreboardUrl(ymd), { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('ESPN ' + r.status); return r.json(); })
      .then((json) => { NIGHT.games = Tonight.parseGames(json, poolTeamsById()); NIGHT.error = null; NIGHT.loadedFor = ymd; })
      .catch((err) => { NIGHT.error = err.message; if (NIGHT.loadedFor !== ymd) NIGHT.games = null; })
      .finally(() => { NIGHT.loading = false; drawTonight(); scheduleTonight(); });
  }
  // Re-check every 60 s while a game is live, the tab is showing and the phone screen is on.
  function scheduleTonight() {
    clearTimeout(NIGHT.timer);
    const live = NIGHT.games && NIGHT.games.some((g) => g.state === 'in');
    if (live && NIGHT.day === 0 && !$('tab-tonight').hidden) {
      NIGHT.timer = setTimeout(() => { if (document.visibilityState === 'visible') loadTonight(true); else scheduleTonight(); }, 60000);
    }
  }
  // If ESPN can't be reached: the morning update's "next game" for each team.
  function fallbackGames() {
    const ymd = Tonight.easternDate(NIGHT.day);
    return D.teams.filter((t) => t.next && Tonight.easternDate(0, new Date(t.next.date).getTime()) === ymd)
      .sort((a, b) => String(a.next.date).localeCompare(String(b.next.date)));
  }
  function drawTonight() {
    if (!D) return;
    $('night-days').innerHTML = [-1, 0, 1].map((d) => `<button type="button" data-day="${d}" aria-pressed="${d === NIGHT.day}">${DAY_LABELS[d]}</button>`).join('');
    const filter = nightFilter();
    const entry = D.entries.find((e) => e.name === filter);
    const fsel = $('night-filter');
    fsel.innerHTML = `<option value="">All pool teams</option>` + D.entries.map((e) => e.name).sort().map((n) => `<option${n === filter ? ' selected' : ''}>${esc(n)}</option>`).join('');
    const box = $('night-games');
    if (NIGHT.loading && !NIGHT.games) { box.innerHTML = '<p class="night-msg">Loading games…</p>'; $('night-summary').textContent = ''; return; }
    const tipTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (!NIGHT.games) {
      const fb = fallbackGames().filter((t) => !entry || entry.teams.includes(t.name));
      $('night-summary').textContent = '';
      box.innerHTML = `<div class="alert">Live scores aren't available right now. ${fb.length ? 'Here are the scheduled games from this morning\'s update:' : ''}</div>` +
        fb.map((t) => `<div class="game led"><div class="g-top"><span class="g-status">${tipTime(t.next.date)}</span></div>
          <div class="g-team"><span class="g-name">${esc(t.name)}</span><span class="g-own">${t.owners} own</span></div>
          <div class="g-team"><span class="g-name dim">${t.next.home ? 'vs' : 'at'} ${esc(t.next.opp)}</span></div></div>`).join('');
      return;
    }
    let games = NIGHT.games;
    if (entry) games = games.filter((g) => g.sides.some((s) => s.pool && entry.teams.includes(s.pool.name)));
    const live = games.filter((g) => g.state === 'in').length;
    const teamsPlaying = new Set(games.flatMap((g) => g.sides.filter((s) => s.pool).map((s) => s.pool.name))).size;
    $('night-summary').innerHTML = games.length
      ? `${games.length} game${games.length > 1 ? 's' : ''} · ${teamsPlaying} pool team${teamsPlaying > 1 ? 's' : ''}${live ? ` · <b class="live-txt">${live} live</b>` : ''}`
      : '';
    if (!games.length) {
      box.innerHTML = `<p class="night-msg">${entry ? `None of ${esc(entry.name)}'s teams play` : 'No pool teams play'} ${DAY_LABELS[NIGHT.day].toLowerCase()}.</p>`;
      return;
    }
    box.innerHTML = games.map((g) => {
      const status = g.canceled ? 'POSTPONED'
        : g.state === 'pre' ? `${tipTime(g.date)}`
        : g.state === 'in' ? `<span class="dot"></span>LIVE · ${esc(g.detail)}`
        : esc(g.detail.toUpperCase() || 'FINAL');
      const rows = g.sides.map((s) => `<div class="g-team${g.state === 'post' && s.winner ? ' win' : ''}${!s.pool ? ' other' : ''}">
          ${s.rank ? `<span class="g-rank">${s.rank}</span>` : '<span class="g-rank"></span>'}
          <span class="g-name">${esc(s.name)}</span>
          ${s.pool ? `<span class="g-own">${s.pool.owners.length} own</span>` : ''}
          <span class="g-score">${g.state === 'pre' || s.score === null ? '' : s.score}</span>
        </div>`).join('');
      const impact = g.sides.filter((s) => s.pool && s.pool.owners.length).map((s) => {
        const n = s.pool.owners.length, who = `${n} entr${n > 1 ? 'ies' : 'y'}`;
        if (g.state === 'post' && !g.canceled) return s.winner ? `${esc(s.name)} won: <b class="up">+2</b> for ${who}` : `${esc(s.name)} lost: <b class="down">−1</b> for ${who}`;
        return `${esc(s.name)}: win <b class="up">+2</b> / loss <b class="down">−1</b> for ${who}`;
      }).join('<br>');
      const open = NIGHT.open === g.id;
      const owners = open ? `<div class="g-owners">${g.sides.filter((s) => s.pool).map((s) => `<div class="owners-head">${esc(s.name)} · owned by ${s.pool.owners.length}</div>
          <div class="owners">${s.pool.owners.map((n) => `<button type="button" class="owner" data-entry="${esc(n)}">${esc(n)}</button>`).join('') || '<span class="muted">Nobody</span>'}</div>`).join('')}
          <div class="owners-hint">Tap a name to see that roster.</div></div>` : '';
      return `<div class="game led${g.state === 'in' ? ' is-live' : ''}${open ? ' open' : ''}" data-game="${g.id}" role="button" tabindex="0" aria-expanded="${open}">
        <div class="g-top"><span class="g-status">${status}</span><span class="g-tv">${esc(g.tv)}</span></div>
        ${rows}
        ${g.note ? `<div class="g-note">${esc(g.note)}</div>` : ''}
        <div class="g-impact">${impact}</div>${owners}
      </div>`;
    }).join('') + (NIGHT.error ? `<p class="night-msg">Couldn't refresh just now (${esc(NIGHT.error)}); showing the last scores.</p>` : '');
  }
  function wireTonight() {
    $('night-days').onclick = (e) => {
      const b = e.target.closest('button[data-day]');
      if (!b) return;
      NIGHT.day = Number(b.dataset.day); NIGHT.games = null; NIGHT.open = null; NIGHT.loadedFor = null;
      loadTonight(true);
    };
    $('night-filter').onchange = (e) => {
      try { localStorage.setItem('cbbpool_tonight_filter', e.target.value); } catch (err) { /* ignore */ }
      drawTonight();
    };
    const toggle = (e) => {
      const chip = e.target.closest('[data-entry]');
      if (chip) { select(chip.dataset.entry); showTab('roster'); return; }
      const card = e.target.closest('[data-game]');
      if (!card) return;
      NIGHT.open = NIGHT.open === card.dataset.game ? null : card.dataset.game;
      drawTonight();
    };
    $('night-games').onclick = toggle;
    $('night-games').onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-game]')) { e.preventDefault(); toggle(e); } };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !$('tab-tonight').hidden && NIGHT.day === 0) loadTonight(true);
    });
  }

  // ---------- selection + tabs ----------
  function select(name) {
    selected = name;
    $('entry-pick').value = name;
    $('tour-pick').value = name;
    try { localStorage.setItem('cbbpool_entry', name); } catch (e) { /* private mode */ }
    roster();
    tourRoster();
  }

  const TABS = ['standings', 'tonight', 'roster', 'teams', 'tourney', 'rules'];
  function showTab(name, fromHash) {
    if (!TABS.includes(name)) name = 'standings';
    TABS.forEach((t) => {
      $('tab-' + t).hidden = t !== name;
      $('btn-' + t).setAttribute('aria-selected', String(t === name));
    });
    if (!fromHash && location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (name === 'tonight') loadTonight(false); else clearTimeout(NIGHT.timer);
    // If you've scrolled past the header, jump back to the top of the new tab.
    const mainTop = document.querySelector('main').getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > mainTop) window.scrollTo(0, mainTop - 8);
  }

  function render() {
    document.title = D.title;
    $('season').textContent = D.season;
    const t = new Date(D.checkedAt);
    $('updated').dateTime = D.checkedAt;
    $('updated').textContent = t.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    $('reg-payout-text').textContent = `${money(sum(D.pot.regular))} total (${place(D.pot.regular)})`;
    let saved = null;
    try { saved = localStorage.getItem('cbbpool_entry'); } catch (e) { /* ignore */ }
    const names = D.entries.map((e) => e.name);
    const leader = D.entries.slice().sort((a, b) => a.regRank - b.regRank || a.name.localeCompare(b.name))[0].name;
    selected = names.includes(saved) ? saved : leader;
    const opts = names.slice().sort().map((n) => `<option>${esc(n)}</option>`).join('');
    $('entry-pick').innerHTML = opts;
    $('tour-pick').innerHTML = opts;
    $('entry-pick').onchange = (e) => select(e.target.value);
    $('tour-pick').onchange = (e) => select(e.target.value);
    $('chart').onclick = (e) => { const b = e.target.closest('.bar-row'); if (b) { select(b.dataset.name); showTab('roster'); } };
    document.body.classList.toggle('no-proj', !hasProj());
    alerts(); tiles(); chart(); standings(); teamsTable(); tourney(); ticker(); race();
    select(selected);
    wireTonight();
    if (!$('tab-tonight').hidden) loadTonight(false);
  }

  document.querySelector('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) showTab(b.dataset.tab);
  });
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1), true));
  showTab(location.hash.slice(1), true);

  fetch('data/standings.json?t=' + Date.now(), { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { D = d; render(); })
    .catch((err) => {
      $('alerts').innerHTML = `<div class="alert bad">Couldn't load the standings (${esc(err.message)}). Try reloading the page.</div>`;
    });
})();
