// Draws the dashboard from data/standings.json (written each morning by tools/update.js).
'use strict';
(function () {
  const STALE_HOURS = 36;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  let D = null;
  let selected = null;

  function rankLabel(rank, all) {
    return (all.filter((r) => r === rank).length > 1 ? 'T' : '') + rank;
  }
  function leaders(key) {
    const best = Math.max(...D.entries.map((e) => e[key]));
    return { best, names: D.entries.filter((e) => e[key] === best).map((e) => e.name) };
  }
  function joinNames(n) {
    return n.length <= 2 ? n.join(' & ') : `${n.length}-way tie`;
  }

  // ---------- sortable tables ----------
  // cols: [{ key, label, cls, html(row), sort(row) }]
  function sortableTable(el, cols, rows, opts) {
    let sortKey = opts.sortKey, dir = opts.dir || -1;
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
      const body = sorted.map((r) => `<tr class="${opts.rowClass ? opts.rowClass(r) : ''}" data-name="${esc(r.name)}">${cols.map((c) => `<td class="${c.cls || ''}">${c.html ? c.html(r) : esc(r[c.key] ?? '—')}</td>`).join('')}</tr>`).join('');
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
      const tr = ev.target.closest('tbody tr');
      if (tr && opts.onRow) opts.onRow(tr.dataset.name);
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
    $('t-reg-s').textContent = D.gamesPlayed ? `${reg.best} pts · ${money(regMoney)} if it ended today` : 'No games yet';
    if (D.tournamentStarted) {
      const t = leaders('tourPts');
      const tMoney = D.entries.find((e) => e.name === t.names[0]).tourPayout;
      $('t-tour').textContent = joinNames(t.names);
      $('t-tour-s').textContent = `${t.best} pts · ${money(tMoney)} if it ended today`;
    } else {
      $('t-tour').textContent = '—';
      $('t-tour-s').textContent = 'Starts on Selection Sunday';
    }
    $('t-entries').textContent = D.entries.length;
    $('t-entries-s').textContent = `${money(D.entryFee)} each`;
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    $('t-pot').textContent = money(D.pot.total);
    $('t-pot-s').textContent = `Regular ${money(sum(D.pot.regular))} · Tourney ${money(sum(D.pot.tournament))}`;
    const place = (a) => a.map((v, i) => `${['1st', '2nd', '3rd'][i]} ${money(v)}`).join(', ');
    $('payout-text').textContent = `Regular season ${money(sum(D.pot.regular))} (${place(D.pot.regular)}); tournament ${money(sum(D.pot.tournament))} (${place(D.pot.tournament)}).`;
  }

  function chart() {
    const rows = D.entries.slice().sort((a, b) => b.regPts - a.regPts || a.name.localeCompare(b.name));
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
      return `<button type="button" role="listitem" class="bar-row${r.name === selected ? ' sel' : ''}" data-name="${esc(r.name)}" aria-label="${esc(r.name)}: ${r.regPts} points">
        <span class="bar-name">${esc(r.name)}</span>
        <span class="bar-track"><span class="bar-zero" style="left:${zero}%"></span>${w ? `<span class="bar${neg ? ' neg' : ''}" style="left:${left}%;width:${w}%"></span>` : ''}<span class="bar-val" style="${lab}">${r.regPts}</span></span>
      </button>`;
    }).join('');
  }

  let standingsTable;
  function standings() {
    const rr = D.entries.map((e) => e.regRank), tr = D.entries.map((e) => e.tourRank);
    const cols = [
      { key: 'name', label: 'Entry', cls: 'l', asc: true, html: (r) => esc(r.name) },
      { key: 'regRank', label: 'Reg<br>rank', asc: true, html: (r) => rankLabel(r.regRank, rr) },
      { key: 'regPts', label: 'Reg<br>pts', html: (r) => r.regPts + (r.regPayout && D.gamesPlayed ? `<span class="money">${money(r.regPayout)}</span>` : '') },
      { key: 'tourRank', label: 'Tourn<br>rank', asc: true, html: (r) => (D.tournamentStarted ? rankLabel(r.tourRank, tr) : '—') },
      { key: 'tourPts', label: 'Tourn<br>pts', html: (r) => r.tourPts + (r.tourPayout && D.tournamentStarted ? `<span class="money">${money(r.tourPayout)}</span>` : '') },
      { key: 'dropped', label: 'Dropped', cls: 'l', sort: (r) => r.dropped.join(), html: (r) => esc(r.dropped.join(', ')) },
      { key: 'salary', label: 'Salary', html: (r) => money(r.salary) },
    ];
    standingsTable = sortableTable($('standings'), cols, D.entries, {
      sortKey: 'regRank', dir: 1,
      rowClass: (r) => 'click' + (r.name === selected ? ' sel' : ''),
      onRow: (n) => select(n, true),
    });
  }

  function roster() {
    const en = D.entries.find((e) => e.name === selected);
    const byName = Object.fromEntries(D.teams.map((t) => [t.name, t]));
    const teams = en.teams.map((n) => byName[n]).sort((a, b) => b.regPts - a.regPts);
    const when = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const row = (t) => {
      const drop = en.dropped.includes(t.name);
      const next = t.next ? `<span class="nextg">Next: ${t.next.home ? 'vs' : 'at'} ${esc(t.next.opp)}, ${when(t.next.date)}</span>` : '';
      return `<tr class="${drop ? 'dropped' : ''}"><td class="l"><span class="team">${esc(t.name)}</span>${drop ? '<span class="tag">dropped</span>' : ''}${next}</td>
        <td>${t.w}-${t.l}</td><td class="rp">${signed(t.regPts)}</td><td>${t.seed || '—'}</td><td>${t.tourPts}</td></tr>`;
    };
    $('roster').innerHTML = `<thead><tr><th class="l">Team</th><th>Record</th><th>Pts</th><th>Seed</th><th>Tourn<br>pts</th></tr></thead>
      <tbody>${teams.map(row).join('')}</tbody>
      <tfoot><tr><td class="l">Total</td><td></td><td>${en.regPts}</td><td></td><td>${en.tourPts}</td></tr></tfoot>`;
    const rr = D.entries.map((e) => e.regRank);
    $('roster-note').textContent = `Regular-season rank ${rankLabel(en.regRank, rr)} of ${D.entries.length} · salary ${money(en.salary)}. The crossed-out team is the lowest scorer and doesn't count in the regular season (it still counts in the tournament).`;
  }

  function teamsTable() {
    const cols = [
      { key: 'name', label: 'Team', cls: 'l', asc: true, html: (r) => esc(r.name) + (r.overridden && r.overridden.length ? '<span class="tag" title="Entered by hand">✎</span>' : '') },
      { key: 'conf', label: 'Conf', cls: 'l', asc: true },
      { key: 'salary', label: 'Salary', html: (r) => money(r.salary) },
      { key: 'record', label: 'Record', sort: (r) => r.w - r.l, html: (r) => `${r.w}-${r.l}` },
      { key: 'regPts', label: 'Pts', html: (r) => signed(r.regPts) },
      { key: 'ptsPerDollar', label: 'Pts<br>per $', html: (r) => r.ptsPerDollar.toFixed(2) },
      { key: 'owners', label: 'Owned<br>by' },
      { key: 'seed', label: 'Seed', asc: true, sort: (r) => r.seed ?? 99, html: (r) => r.seed || '—' },
      { key: 'tourPts', label: 'Tourn<br>pts' },
    ];
    sortableTable($('teams'), cols, D.teams, { sortKey: 'regPts' });
  }

  function select(name, scroll) {
    selected = name;
    $('entry-pick').value = name;
    try { localStorage.setItem('cbbpool_entry', name); } catch (e) { /* private mode */ }
    chart();
    standingsTable.redraw();
    roster();
    if (scroll) $('roster-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render() {
    document.title = D.title;
    $('title').textContent = D.title;
    $('season').textContent = D.season + ' season';
    const t = new Date(D.checkedAt);
    $('updated').dateTime = D.checkedAt;
    $('updated').textContent = t.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    let saved = null;
    try { saved = localStorage.getItem('cbbpool_entry'); } catch (e) { /* ignore */ }
    const names = D.entries.map((e) => e.name);
    selected = names.includes(saved) ? saved : names.includes(D.defaultEntry) ? D.defaultEntry : names[0];
    $('entry-pick').innerHTML = names.slice().sort().map((n) => `<option>${esc(n)}</option>`).join('');
    $('entry-pick').onchange = (e) => select(e.target.value, false);
    $('chart').onclick = (e) => { const b = e.target.closest('.bar-row'); if (b) select(b.dataset.name, true); };
    alerts(); tiles(); chart(); standings(); teamsTable();
    select(selected, false);
  }

  fetch('data/standings.json?t=' + Date.now(), { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { D = d; render(); })
    .catch((err) => {
      $('alerts').innerHTML = `<div class="alert bad">Couldn't load the standings (${esc(err.message)}). Try reloading the page.</div>`;
    });
})();
