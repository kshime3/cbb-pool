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
      { key: 'regRank', label: 'Rank', asc: true, html: (r) => rankPill(r.regRank, rr) },
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
      <div><b>${rankLabel(en.regRank, rr)}</b><span>of ${D.entries.length}</span></div>
      <div><b>${en.regPts}</b><span>points</span></div>
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

  // ---------- selection + tabs ----------
  function select(name) {
    selected = name;
    $('entry-pick').value = name;
    $('tour-pick').value = name;
    try { localStorage.setItem('cbbpool_entry', name); } catch (e) { /* private mode */ }
    roster();
    tourRoster();
  }

  const TABS = ['standings', 'roster', 'teams', 'tourney', 'rules'];
  function showTab(name, fromHash) {
    if (!TABS.includes(name)) name = 'standings';
    TABS.forEach((t) => {
      $('tab-' + t).hidden = t !== name;
      $('btn-' + t).setAttribute('aria-selected', String(t === name));
    });
    if (!fromHash && location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
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
    alerts(); tiles(); chart(); standings(); teamsTable(); tourney();
    select(selected);
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
