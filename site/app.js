(function () {
  'use strict';
  var D = null;            // site.json
  var raceById = {};
  var hasProfile = {};
  var known = {};          // every athlete seen in results or top lists: id -> {name, nat, born}
  var app = document.getElementById('app');
  var tip = document.getElementById('tip');
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DIST = { 'marathon': 'Marathon', 'half-marathon': 'Half marathon', '10km': '10 km', '5km': '5 km', '25km': '25 km', 'mile': 'Mile', 'multi': 'Several distances', 'other': 'Other' };
  var TODAY = new Date().toISOString().slice(0, 10);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(iso, withYear) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return esc(iso || '');
    var p = iso.split('-');
    return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1] + (withYear ? ' ' + p[0] : '');
  }
  function distName(d) { return DIST[d] || d; }
  function tierBadge(r) {
    return '<span class="badge"><span class="dot ' + esc(r.tier) + '"></span>' + esc(r.tier) + '</span>' +
      (r.major ? '<span class="major" title="World Marathon Major">MAJOR</span>' : '');
  }
  function athleteLink(id, name) {
    if (id && known[id]) return '<a href="#/athlete/' + esc(id) + '">' + esc(name) + '</a>';
    return esc(name);
  }
  function raceLink(r) { return '<a href="#/race/' + r.id + '">' + esc(r.name) + '</a>'; }
  function isRun(r) { return !!(r.events && r.events.length); }
  function winner(r, gender) {
    if (!isRun(r)) return null;
    var evs = r.events.filter(function (e) { return e.gender === gender; });
    if (!evs.length) return null;
    var ev = evs.filter(function (e) { return e.distance === r.distance; })[0] || evs[0];
    return ev.results[0] ? { row: ev.results[0], event: ev } : null;
  }
  function winnerText(r, gender) {
    var w = winner(r, gender);
    if (!w) return '<span class="muted">–</span>';
    return athleteLink(w.row.id, w.row.name) + ' <span class="muted">' + esc(w.row.nat) + '</span> ' + esc(w.row.mark);
  }
  /* ---------- latest runs ---------- */
  function secs(mark) {
    var m = /^(\d+(?::\d+){0,2})(\.\d+)?/.exec(mark || '');
    if (!m) return null;
    return m[1].split(':').reduce(function (t, p) { return t * 60 + parseInt(p, 10); }, 0) + parseFloat(m[2] || 0);
  }
  var RUN_WINDOW_DAYS = 30;
  function latestRuns(gender) {
    var run = D.races.filter(isRun);
    if (!run.length) return { from: null, rows: [] };
    var last = run[run.length - 1].startDate;
    var from = new Date(Date.parse(last) - RUN_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
    var rows = [];
    run.filter(function (r) { return r.startDate >= from; }).forEach(function (r) {
      r.events.filter(function (ev) { return ev.gender === gender; }).forEach(function (ev) {
        var list = D.toplists[ev.distance + '-' + (gender === 'W' ? 'women' : 'men')];
        if (!list) return;
        var times = list.rows.map(function (x) { return secs(x.mark); });
        ev.results.forEach(function (x) {
          var s = secs(x.mark);
          if (s === null) return;
          var rank = 1 + times.filter(function (t) { return t < s; }).length;
          rows.push({ r: r, ev: ev, x: x, rank: rank <= times.length ? rank : null });
        });
      });
    });
    rows.sort(function (a, b) { return (a.rank || 999) - (b.rank || 999) || parseInt(a.x.place, 10) - parseInt(b.x.place, 10); });
    return { from: from, to: last, rows: rows };
  }
  function runsTable(gender, limit) {
    var rows = latestRuns(gender).rows.slice(0, limit);
    if (!rows.length) return '<p class="muted">No results in this period.</p>';
    return simpleTable([['Time'], ['Athlete'], ['Race'], ['Place', 1], [D.season + ' list', 1]], rows.map(function (p) {
      return '<tr><td class="mark">' + esc(p.x.mark) + records(p.x.records) + '</td><td>' + athleteLink(p.x.id, p.x.name) + ' <span class="muted">' + esc(p.x.nat) + '</span></td><td>' +
        raceLink(p.r) + '<div class="muted">' + distName(p.ev.distance) + ' · ' + fmtDate(p.r.startDate) + '</div></td><td class="num">' + esc(p.x.place) +
        '</td><td class="num">' + (p.rank ? '#' + p.rank : '<span class="muted">–</span>') + '</td></tr>';
    }));
  }
  function runsNote() {
    var w = latestRuns('W');
    return 'Top-20 finishes in priority races from ' + fmtDate(w.from) + ' to ' + fmtDate(w.to) + ', ordered by where the time sits among the fastest athletes of ' + D.season +
      ' at that distance (– = outside the top 100).';
  }
  function viewRuns() {
    return '<h1>Latest runs</h1><p class="sub">' + runsNote() + '</p><div class="grid2"><div class="card"><h2>Women</h2>' + runsTable('W', 25) +
      '</div><div class="card"><h2>Men</h2>' + runsTable('M', 25) + '</div></div>';
  }

  /* ---------- announced entries ---------- */
  var REL = { official: ['●', 'Official', 'Race organiser or the athlete'], reported: ['◐', 'Reported', 'Major or specialist news outlet'], unconfirmed: ['○', 'Unconfirmed', 'Single secondary source or rumour'] };
  function relTag(rel) {
    var r = REL[rel] || REL.unconfirmed;
    return '<span class="badge" title="' + r[2] + '">' + r[0] + ' ' + r[1] + '</span>';
  }
  function srcLink(url) {
    return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) + ' ↗</a>' : '';
  }
  function entryName(e) { return athleteLink(e.id, e.name) + ' <span class="muted">' + esc(e.nat || '') + '</span>'; }
  function raceEntries(r) { return (D.entries || {})[r.id] || null; }
  function withdrawalsHtml(list) {
    if (!list.length) return '';
    return '<h3>Withdrawn</h3><ul class="racelist">' + list.map(function (e) {
      var h = e.history[e.history.length - 1];
      return '<li><div><s>' + esc(e.name) + '</s> ' + (e.id && known[e.id] ? '<a href="#/athlete/' + esc(e.id) + '">profile</a> ' : '') + '<span class="muted">' + esc(e.nat || '') +
        (e.pb ? ' · best ' + esc(e.pb) : '') + '</span></div><div class="meta"><span>' + fmtDate(e.lastDate, true) + '</span>' + relTag(e.reliability) + '<span>' + srcLink(h.source) + '</span></div>' +
        '<div class="win">' + esc(e.reason || 'No reason given.') + (h.note ? ' <span>' + esc(h.note) + '</span>' : '') + '</div></li>';
    }).join('') + '</ul>';
  }
  function entriesBody(r, compact) {
    var d = raceEntries(r);
    if (!d || !d.entries.length) return '<p class="muted" style="margin:0">No announced entries recorded yet for this race.</p>';
    var html = '';
    [['W', 'Women'], ['M', 'Men']].forEach(function (g) {
      var all = d.entries.filter(function (e) { return e.gender === g[0]; });
      var inn = all.filter(function (e) { return e.status === 'announced'; });
      var out = all.filter(function (e) { return e.status === 'withdrawn'; });
      if (!all.length) return;
      html += '<div><h3 style="margin-top:0">' + g[1] + '</h3>';
      if (inn.length) {
        html += simpleTable(compact ? [['Athlete'], ['Best'], ['Source']] : [['Athlete'], ['Best'], ['Source'], ['First named'], ['Last confirmed']], (compact ? inn.slice(0, 6) : inn).map(function (e) {
          return '<tr><td>' + entryName(e) + '</td><td class="mark">' + esc(e.pb || '') + '</td><td class="nowrap">' + relTag(e.reliability) + '</td>' +
            (compact ? '' : '<td class="nowrap">' + fmtDate(e.firstDate, true) + '</td><td class="nowrap">' + fmtDate(e.lastDate, true) + '</td>') + '</tr>';
        }));
        if (compact && inn.length > 6) html += '<p class="muted" style="margin:6px 0 0">and ' + (inn.length - 6) + ' more</p>';
      }
      html += withdrawalsHtml(out) + '</div>';
    });
    return '<div class="grid2" style="margin-bottom:0">' + html + '</div>';
  }
  function changeLog(r) {
    var d = raceEntries(r), ev = [];
    if (!d) return '';
    d.entries.forEach(function (e) { e.history.forEach(function (h) { ev.push({ e: e, h: h }); }); });
    ev.sort(function (a, b) { return a.h.date < b.h.date ? 1 : a.h.date > b.h.date ? -1 : 0; });
    var days = {}, order = [];
    ev.forEach(function (x) { var k = x.h.date + '|' + x.h.type + '|' + (x.h.source || ''); if (!days[k]) { days[k] = []; order.push(k); } days[k].push(x); });
    var verb = { announced: 'Announced', confirmed: 'Confirmed again', withdrawn: 'Withdrew' };
    return '<h3>Change log</h3><ul class="racelist">' + order.map(function (k) {
      var g = days[k], h = g[0].h;
      return '<li><div class="meta"><span>' + fmtDate(h.date, true) + '</span>' + relTag(h.reliability) + '<span>' + srcLink(h.source) + '</span></div><div class="win"><b>' +
        (verb[h.type] || esc(h.type)) + ':</b> ' + g.map(function (x) { return esc(x.e.name); }).join(', ') + (h.type === 'withdrawn' && h.reason ? ' <span>— ' + esc(h.reason) + '</span>' : '') + '</div></li>';
    }).join('') + '</ul>';
  }
  function entriesCard(r) {
    var d = raceEntries(r);
    if (!d && isRun(r)) return '';
    return '<div class="card"><h2>' + (isRun(r) ? 'Announced before the race' : 'Announced entries') + '</h2>' + entriesBody(r, false) +
      (d ? changeLog(r) + '<p class="muted" style="margin:10px 0 0">' + (d.note ? esc(d.note) + ' ' : '') + 'Last checked ' + fmtDate(d.checked, true) +
        '. ● Official = organiser or athlete; ◐ Reported = news outlet; ○ Unconfirmed = single secondary source.</p>' : '') + '</div>';
  }
  function upcoming() { return D.races.filter(function (r) { return !isRun(r) && r.endDate >= TODAY; }); }
  function viewNext() {
    var next = upcoming();
    return '<h1>Running next</h1><p class="sub">Athletes announced for the upcoming priority races, with how reliable each announcement is, and everyone who has withdrawn.</p>' +
      (next.length ? next.map(function (r) {
        var d = raceEntries(r);
        return '<div class="card"><h2>' + raceLink(r) + '</h2><div class="racelist"><div class="meta" style="margin-bottom:10px"><span>' + fmtDate(r.startDate, true) + '</span><span>' + esc(r.venue) + '</span>' +
          tierBadge(r) + '<span>' + distName(r.distance) + '</span>' + (d ? '<span>checked ' + fmtDate(d.checked, true) + '</span>' : '') + '</div></div>' + entriesBody(r, false) + '</div>';
      }).join('') : '<div class="card">No more priority races this season.</div>');
  }
  function athleteEntriesCard(id) {
    var rows = [];
    Object.keys(D.entries || {}).forEach(function (rid) {
      D.entries[rid].entries.forEach(function (e) { if (e.id === id && raceById[rid]) rows.push({ r: raceById[rid], e: e }); });
    });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return a.r.startDate < b.r.startDate ? 1 : -1; });
    return '<div class="card"><h2>Race plans and withdrawals</h2><ul class="racelist">' + rows.map(function (x) {
      var e = x.e, h = e.history[e.history.length - 1], out = e.status === 'withdrawn';
      return '<li><div>' + raceLink(x.r) + ' <span class="muted">' + fmtDate(x.r.startDate, true) + '</span></div><div class="meta"><span><b>' +
        (out ? 'Withdrew ' + fmtDate(e.lastDate, true) : (isRun(x.r) ? 'Was announced' : 'Announced') + ' ' + fmtDate(e.firstDate, true)) + '</b></span>' + relTag(e.reliability) + '<span>' + srcLink(h.source) + '</span></div>' +
        (out ? '<div class="win">' + esc(e.reason || 'No reason given.') + (h.note ? ' <span>' + esc(h.note) + '</span>' : '') + '</div>' : (h.note ? '<div class="win"><span>' + esc(h.note) + '</span></div>' : '')) + '</li>';
    }).join('') + '</ul></div>';
  }

  var SYMBOL = { USD: '$', EUR: '€', AUD: 'A$', GBP: '£', JPY: '¥' };
  function money(amount, currency) {
    return (SYMBOL[currency] || (currency + ' ')) + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function prizeCell(row, race) {
    if (!row.prize && !row.bonus) return '';
    var c = race.prize.currency;
    return (row.prize ? money(row.prize, c) : '') + (row.bonus ? '<div class="muted" title="' + esc(row.bonusNote) + '">+ ' + money(row.bonus, c) + ' bonus</div>' : '');
  }
  var prizeTotals = {};    // athlete id -> {usd, races, gender}
  function prizeCoverage() {
    var run = D.races.filter(isRun);
    return run.filter(function (r) { return r.prize; }).length + ' of the ' + run.length + ' races run so far';
  }
  function appearances(id) {
    var apps = [];
    D.races.forEach(function (r) {
      (r.events || []).forEach(function (ev) { ev.results.forEach(function (x) { if (x.id === id) apps.push({ r: r, ev: ev, x: x }); }); });
    });
    return apps.reverse();
  }
  function appsCard(id) {
    var apps = appearances(id), t = prizeTotals[id];
    var html = '<div class="card"><h2>Priority races ' + D.season + '</h2>' + (apps.length ? simpleTable([['Date'], ['Race'], ['Place', 1], ['Time'], ['Prize', 1]], apps.map(function (p) {
      return '<tr><td class="nowrap">' + fmtDate(p.r.startDate) + '</td><td>' + raceLink(p.r) + (p.r.distance === 'multi' ? '<div class="muted">' + esc(p.ev.event) + '</div>' : '') +
        '</td><td class="num">' + esc(p.x.place) + '</td><td class="mark">' + esc(p.x.mark) + '</td><td class="num">' +
        (p.r.prize ? (prizeCell(p.x, p.r) || '–') : '<span class="muted" title="Prize money not researched yet">?</span>') + '</td></tr>';
    })) : '<p class="muted">No top-20 finish in a priority race this season.</p>');
    if (apps.length) {
      html += '<h3>Known prize money ' + D.season + '</h3><p style="margin:0"><b style="font-size:20px">' + (t ? money(t.usd, 'USD') : '$0') + '</b> ' +
        '<span class="muted">from ' + (t ? t.races : 0) + ' race' + (t && t.races === 1 ? '' : 's') + '. Prize money is known for ' + prizeCoverage() +
        ' (“?” = not known). Excludes appearance fees and sponsor bonuses.</span></p>';
    }
    return html;
  }
  function records(rec) {
    return rec ? rec.split(/[,\s]+/).filter(Boolean).map(function (x) { return '<span class="rec">' + esc(x) + '</span>'; }).join('') : '';
  }

  /* ---------- season timeline ---------- */
  function timeline() {
    var year = D.season, W = 1000, left = 96, right = 14, top = 24;
    var t0 = Date.UTC(year, 0, 1), t1 = Date.UTC(year + 1, 0, 1);
    function x(iso) { return left + (Date.parse(iso + 'T00:00:00Z') - t0) / (t1 - t0) * (W - left - right); }
    var rows = [
      { label: 'Marathon', test: function (r) { return r.distance === 'marathon'; } },
      { label: 'Half marathon', test: function (r) { return r.distance === 'half-marathon'; } },
      { label: '10 km & other', test: function (r) { return r.distance !== 'marathon' && r.distance !== 'half-marathon'; } }
    ];
    var y = top, body = '', lane = 13;
    rows.forEach(function (row) {
      var lanes = [], marks = [];
      D.races.filter(row.test).forEach(function (r) {
        var cx = x(r.startDate), rad = r.major ? 6.5 : 4.5, i = 0;
        while (lanes[i] !== undefined && cx - lanes[i] < 12) i++;
        lanes[i] = cx;
        marks.push({ r: r, cx: cx, lane: i, rad: rad });
      });
      var h = Math.max(lanes.length, 1) * lane + 14;
      body += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + (y + h) + '" y2="' + (y + h) + '" stroke="var(--grid)"/>';
      body += '<text class="row" x="0" y="' + (y + h - 8) + '">' + row.label + '</text>';
      marks.forEach(function (m) {
        var cy = y + h - 10 - m.lane * lane, col = 'var(--' + (m.r.tier === 'Platinum' ? 'platinum' : m.r.tier === 'Gold' ? 'gold' : 'champ') + ')';
        var run = isRun(m.r);
        body += '<a href="#/race/' + m.r.id + '" data-race="' + m.r.id + '" aria-label="' + esc(m.r.name) + ', ' + fmtDate(m.r.startDate) + '">' +
          '<circle cx="' + m.cx.toFixed(1) + '" cy="' + cy + '" r="14" fill="transparent"/>' +
          '<circle cx="' + m.cx.toFixed(1) + '" cy="' + cy + '" r="' + m.rad + '" fill="' + (run ? col : 'var(--surface)') + '" stroke="' + col + '" stroke-width="' + (run ? 0 : 2) + '"/></a>';
      });
      y += h + 6;
    });
    var axis = '';
    for (var mth = 0; mth < 12; mth++) {
      var mx = left + (Date.UTC(year, mth, 1) - t0) / (t1 - t0) * (W - left - right);
      axis += '<line x1="' + mx.toFixed(1) + '" x2="' + mx.toFixed(1) + '" y1="' + top + '" y2="' + y + '" stroke="var(--grid)"/>' +
        '<text x="' + (mx + 4).toFixed(1) + '" y="14">' + MONTHS[mth] + '</text>';
    }
    var today = '';
    if (TODAY.slice(0, 4) === String(year)) {
      var tx = x(TODAY).toFixed(1);
      today = '<line x1="' + tx + '" x2="' + tx + '" y1="' + (top - 4) + '" y2="' + y + '" stroke="var(--ink-2)" stroke-dasharray="3 3"/>' +
        '<text x="' + tx + '" y="' + (y + 13) + '" text-anchor="middle">today</text>';
    }
    var H = y + 18;
    function sw(col, filled, rad) {
      return '<svg width="16" height="16"><circle cx="8" cy="8" r="' + rad + '" fill="' + (filled ? 'var(--' + col + ')' : 'var(--surface)') + '" stroke="var(--' + col + ')" stroke-width="' + (filled ? 0 : 2) + '"/></svg>';
    }
    return '<div class="scroll"><svg class="timeline" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Season timeline of priority road races">' +
      axis + body + today + '</svg></div>' +
      '<div class="legend"><span>' + sw('platinum', true, 4.5) + 'Platinum</span><span>' + sw('gold', true, 4.5) + 'Gold</span><span>' +
      sw('champ', true, 4.5) + 'Championship</span><span>' + sw('platinum', true, 6.5) + 'Larger = Marathon Major</span><span>' +
      sw('platinum', false, 4.5) + 'Outline = not yet run</span><span><a href="#/races">See all as a table</a></span></div>';
  }
  function tipFor(el, ev) {
    var r = raceById[el.getAttribute('data-race')];
    if (!r) return;
    var html = '<b>' + esc(r.name) + '</b><span class="muted">' + fmtDate(r.startDate, true) + ' · ' + esc(r.venue) + '<br>' +
      esc(r.tier) + (r.major ? ' · Marathon Major' : '') + ' · ' + distName(r.distance) + '</span>';
    ['W', 'M'].forEach(function (g) {
      var w = winner(r, g);
      if (w) html += '<br>' + (g === 'W' ? 'Women' : 'Men') + ': ' + esc(w.row.name) + ' ' + esc(w.row.mark);
    });
    tip.innerHTML = html;
    tip.hidden = false;
    var box = ev && ev.clientX !== undefined ? { x: ev.clientX, y: ev.clientY } : (function () { var b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top }; })();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var lx = Math.min(Math.max(8, box.x + 14), window.innerWidth - tw - 8);
    var ly = box.y - th - 12;
    if (ly < 8) ly = box.y + 18;
    tip.style.left = lx + 'px';
    tip.style.top = ly + 'px';
  }
  function hideTip() { tip.hidden = true; }
  document.addEventListener('mousemove', function (e) {
    var a = e.target.closest ? e.target.closest('[data-race]') : null;
    if (a) tipFor(a, e); else hideTip();
  });
  document.addEventListener('focusin', function (e) {
    var a = e.target.closest ? e.target.closest('[data-race]') : null;
    if (a) tipFor(a, null); else hideTip();
  });

  /* ---------- views ---------- */
  function raceItem(r) {
    var html = '<li><div>' + raceLink(r) + '</div><div class="meta"><span>' + fmtDate(r.startDate) + '</span><span>' + esc(r.venue) + '</span>' +
      tierBadge(r) + '<span>' + distName(r.distance) + '</span></div>';
    if (isRun(r) && r.distance !== 'multi') {
      html += '<div class="win"><span>W</span> ' + winnerText(r, 'W') + ' &nbsp; <span>M</span> ' + winnerText(r, 'M') + '</div>';
    }
    return html + '</li>';
  }
  function viewOverview() {
    var run = D.races.filter(isRun), next = D.races.filter(function (r) { return !isRun(r) && r.endDate >= TODAY; });
    var majors = D.races.filter(function (r) { return r.major; });
    var nxt = next[0];
    var html = '<h1>Road running ' + D.season + '</h1><p class="sub">The ' + D.races.length +
      ' priority races of the season: Platinum and Gold label races plus championships.</p>';
    html += '<div class="tiles">' +
      '<div class="tile"><div class="k">Races run</div><div class="v">' + run.length + ' of ' + D.races.length + '</div><div class="n">' + next.length + ' still to come</div></div>' +
      '<div class="tile"><div class="k">Marathon Majors run</div><div class="v">' + majors.filter(isRun).length + ' of ' + majors.length + '</div><div class="n">All Platinum label</div></div>' +
      '<div class="tile"><div class="k">Next race</div><div class="v">' + (nxt ? fmtDate(nxt.startDate) : '–') + '</div><div class="n">' + (nxt ? raceLink(nxt) : 'Season complete') + '</div></div>' +
      '<div class="tile"><div class="k">Label races worldwide</div><div class="v">' + Object.keys(D.labelRaceCounts || {}).reduce(function (s, k) { return s + D.labelRaceCounts[k]; }, 0) +
      '</div><div class="n">' + ((D.labelRaceCounts || {}).Platinum || 0) + ' Platinum, ' + ((D.labelRaceCounts || {}).Gold || 0) + ' Gold</div></div></div>';
    html += '<div class="card"><h2>Season at a glance</h2>' + timeline() + '</div>';
    html += '<div class="grid2"><div class="card"><h2>Latest results</h2><ul class="racelist">' +
      run.slice(-6).reverse().map(raceItem).join('') + '</ul></div>' +
      '<div class="card"><h2>Coming up</h2><ul class="racelist">' +
      (next.length ? next.slice(0, 6).map(raceItem).join('') : '<li class="muted">No more priority races this season.</li>') + '</ul></div></div>';
    html += '<div class="card"><h2><a href="#/runs">Latest runs</a></h2><div class="grid2" style="margin-bottom:0"><div><h3 style="margin-top:0">Women</h3>' + runsTable('W', 5) +
      '</div><div><h3 style="margin-top:0">Men</h3>' + runsTable('M', 5) + '</div></div><p class="muted" style="margin:10px 0 0">' + runsNote() + ' <a href="#/runs">See all</a></p></div>';
    var nextWith = next.filter(function (r) { return raceEntries(r); })[0];
    html += '<div class="card"><h2><a href="#/next">Running next</a>' + (nextWith ? ': ' + esc(nextWith.name) + ', ' + fmtDate(nextWith.startDate) : '') + '</h2>' +
      (nextWith ? entriesBody(nextWith, true) : '<p class="muted" style="margin:0">No announced entries recorded yet for the upcoming races.</p>') +
      '<p class="muted" style="margin:10px 0 0"><a href="#/next">All upcoming races and announced athletes</a></p></div>';
    var earners = Object.keys(prizeTotals).map(function (id) { return { id: id, t: prizeTotals[id] }; }).sort(function (a, b) { return b.t.usd - a.t.usd; });
    if (earners.length) {
      html += '<div class="card"><h2>Prize money leaders</h2><div class="grid2" style="margin-bottom:0">' + [['W', 'Women'], ['M', 'Men']].map(function (g) {
        return '<div><h3 style="margin-top:0">' + g[1] + '</h3><table>' + earners.filter(function (e) { return e.t.gender === g[0]; }).slice(0, 5).map(function (e) {
          return '<tr><td class="mark">' + money(e.t.usd, 'USD') + '</td><td>' + athleteLink(e.id, known[e.id].name) + ' <span class="muted">' + esc(known[e.id].nat) + '</span></td><td class="num muted">' +
            e.t.races + ' race' + (e.t.races === 1 ? '' : 's') + '</td></tr>';
        }).join('') + '</table></div>';
      }).join('') + '</div><p class="muted" style="margin:10px 0 0">Known prize money only: place prizes and reported bonuses at ' + prizeCoverage() +
        ', converted to US dollars at approximate rates. Appearance fees and sponsor bonuses are not public.</p></div>';
    }
    html += '<h2>Fastest of ' + D.season + '</h2><div class="grid3">';
    ['marathon', 'half-marathon', '10km'].forEach(function (d) {
      html += '<div class="card"><h2><a href="#/distance/' + d + '">' + distName(d) + '</a></h2>';
      ['women', 'men'].forEach(function (g) {
        var t = D.toplists[d + '-' + g];
        if (!t) return;
        html += '<h3>' + (g === 'women' ? 'Women' : 'Men') + '</h3><table>' + t.rows.slice(0, 3).map(function (r) {
          return '<tr><td class="mark">' + esc(r.mark) + '</td><td>' + athleteLink(r.id, r.name) + ' <span class="muted">' + esc(r.nat) + '</span></td></tr>';
        }).join('') + '</table>';
      });
      html += '</div>';
    });
    return html + '</div>';
  }

  var raceFilter = { tier: 'All', dist: 'All' };
  function seg(name, options, current) {
    return '<div class="seg" role="group" aria-label="' + name + '">' + options.map(function (o) {
      return '<button data-filter="' + name + '" data-value="' + esc(o) + '"' + (o === current ? ' class="on" aria-pressed="true"' : '') + '>' + esc(distName(o)) + '</button>';
    }).join('') + '</div>';
  }
  function viewRaces() {
    var rows = D.races.filter(function (r) {
      var okT = raceFilter.tier === 'All' || (raceFilter.tier === 'Majors' ? r.major : r.tier === raceFilter.tier);
      var d = (r.distance === 'marathon' || r.distance === 'half-marathon' || r.distance === '10km') ? r.distance : 'other';
      return okT && (raceFilter.dist === 'All' || d === raceFilter.dist);
    });
    return '<h1>Races</h1><p class="sub">All priority races of ' + D.season + ' with winners.</p><div class="card">' +
      '<div class="filters">' + seg('tier', ['All', 'Majors', 'Platinum', 'Gold', 'Championship'], raceFilter.tier) +
      seg('dist', ['All', 'marathon', 'half-marathon', '10km', 'other'], raceFilter.dist) +
      '<span class="muted">' + rows.length + ' races</span></div><div class="scroll"><table><thead><tr><th>Date</th><th>Race</th><th>Label</th><th>Distance</th><th>Women</th><th>Men</th><th class="num">1st prize</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var multi = r.distance === 'multi';
        var first = r.prize && r.prize.first ? money(r.prize.first, r.prize.currency) : '<span class="muted">' + (isRun(r) ? '?' : '') + '</span>';
        return '<tr><td class="nowrap">' + fmtDate(r.startDate) + '</td><td>' + raceLink(r) + '<div class="muted">' + esc(r.venue) + '</div></td><td class="nowrap">' +
          tierBadge(r) + '</td><td class="nowrap">' + distName(r.distance) + '</td>' +
          (multi ? '<td colspan="2">' + (isRun(r) ? '<a href="#/race/' + r.id + '">' + r.events.length + ' events</a>' : '<span class="muted">–</span>') + '</td>'
            : '<td>' + winnerText(r, 'W') + '</td><td>' + winnerText(r, 'M') + '</td>') + '<td class="num">' + first + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  function resultsTable(ev, race) {
    var p = !!race.prize;
    return '<div class="scroll"><table><thead><tr><th class="num">#</th><th>Time</th><th>Athlete</th><th>Country</th><th class="num">Born</th>' + (p ? '<th class="num">Prize</th>' : '') + '</tr></thead><tbody>' +
      ev.results.map(function (r) {
        return '<tr><td class="num">' + esc(r.place) + '</td><td class="mark">' + esc(r.mark) + records(r.records) + '</td><td>' + athleteLink(r.id, r.name) +
          '</td><td>' + esc(r.nat) + '</td><td class="num">' + esc(r.born) + '</td>' + (p ? '<td class="num">' + prizeCell(r, race) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function prizeCard(r) {
    if (!r.prize) {
      return '<div class="card"><h2>Prize money</h2><p class="muted" style="margin:0">Not researched yet for this race. World Athletics does not publish prize money, so it is added race by race from organisers and press.</p></div>';
    }
    var p = r.prize, conf = { high: 'Organiser or several agreeing sources', medium: 'One source', low: 'Partial or conflicting sources' }[p.confidence] || '';
    return '<div class="card"><h2>Prize money</h2><dl class="kv">' +
      '<dt>Winner</dt><dd>' + money(p.first, p.currency) + ' each for women and men' + (p.currency !== 'USD' && p.usdRate ? ' <span class="muted">(about ' + money(p.first * p.usdRate, 'USD') + ')</span>' : '') + '</dd>' +
      (p.bonusRules ? '<dt>Bonuses</dt><dd>' + esc(p.bonusRules) + '</dd>' : '') +
      (p.placesNote ? '<dt>Note</dt><dd>' + esc(p.placesNote) + '</dd>' : '') +
      '<dt>Reliability</dt><dd>' + conf + ' <span class="muted">· checked ' + fmtDate(p.checked, true) + '</span></dd>' +
      '<dt>Sources</dt><dd>' + p.sources.map(function (s, i) { return '<a href="' + esc(s) + '" target="_blank" rel="noopener">' + esc(s.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) + ' ↗</a>'; }).join(', ') + '</dd></dl>' +
      '<p class="muted" style="margin:10px 0 0">Open-division place prizes, plus bonuses reported as paid. Appearance fees, sponsor bonuses and national-division prizes are not included.</p></div>';
  }
  function viewRace(id) {
    var r = raceById[id];
    if (!r) return notFound();
    var html = '<a class="back" href="#/races">← All races</a><h1>' + esc(r.name) + '</h1><p class="sub">' + fmtDate(r.startDate, true) + ' · ' + esc(r.venue) +
      ' · ' + distName(r.distance) + ' &nbsp; ' + tierBadge(r) + '</p>';
    if (!isRun(r)) {
      return html + '<div class="card">' + (r.startDate > TODAY ? 'This race has not been run yet.' : 'Results are not available from World Athletics yet.') + '</div>' + entriesCard(r);
    }
    var evs = r.events.slice().sort(function (a, b) { return (a.distance < b.distance ? -1 : a.distance > b.distance ? 1 : 0) || (a.gender === 'W' ? -1 : 1); });
    html += '<div class="grid2">' + evs.map(function (ev) {
      return '<div class="card"><h2>' + esc(ev.event) + '</h2>' + resultsTable(ev, r) + '<p class="muted" style="margin:10px 0 0">Top ' + ev.results.length +
        ' of ' + ev.finishers + ' listed finishers.</p></div>';
    }).join('') + '</div>' + prizeCard(r) + entriesCard(r);
    return html + '<p><a href="' + esc(r.source) + '" target="_blank" rel="noopener">Full results at World Athletics ↗</a></p>';
  }

  var listGender = 'women';
  function viewDistance(d) {
    if (!D.toplists[d + '-women']) return notFound();
    var t = D.toplists[d + '-' + listGender];
    var races = D.races.filter(function (r) { return r.distance === d; });
    var html = '<h1>' + distName(d) + '</h1><p class="sub">Fastest athletes of ' + D.season + ' (best time per athlete, all races worldwide) and the priority races at this distance.</p>';
    html += '<div class="card"><div class="filters"><h2 style="margin:0 8px 0 0">' + D.season + ' top 100</h2>' +
      '<div class="seg" role="group" aria-label="gender">' + ['women', 'men'].map(function (g) {
        return '<button data-gender="' + g + '"' + (g === listGender ? ' class="on" aria-pressed="true"' : '') + '>' + (g === 'women' ? 'Women' : 'Men') + '</button>';
      }).join('') + '</div></div><div class="scroll"><table><thead><tr><th class="num">#</th><th>Time</th><th>Athlete</th><th>Country</th><th class="num">Born</th><th class="num">Place</th><th>Where</th><th>Date</th></tr></thead><tbody>' +
      t.rows.map(function (r) {
        return '<tr><td class="num">' + esc(r.rank) + '</td><td class="mark">' + esc(r.mark) + '</td><td>' + athleteLink(r.id, r.name) + '</td><td>' + esc(r.nat) +
          '</td><td class="num">' + esc(r.born) + '</td><td class="num">' + esc(r.pos) + '</td><td>' + esc(r.venue) + '</td><td class="nowrap">' + fmtDate(r.date) + '</td></tr>';
      }).join('') + '</tbody></table></div><p style="margin:10px 0 0"><a href="' + esc(t.source) + '" target="_blank" rel="noopener">Full list at World Athletics ↗</a></p></div>';
    html += '<div class="card"><h2>Priority ' + distName(d).toLowerCase() + ' races (' + races.length + ')</h2><ul class="racelist">' + races.map(raceItem).join('') + '</ul></div>';
    return html;
  }

  function simpleTable(head, rows) {
    return '<div class="scroll"><table><thead><tr>' + head.map(function (h) { return '<th' + (h[1] ? ' class="num"' : '') + '>' + h[0] + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  function isRoad(name) { return /marathon|kilometres|road|mile/i.test(name || ''); }
  function viewAthlete(id) {
    if (!known[id]) return Promise.resolve(notFound());
    var k = known[id];
    var load = hasProfile[id]
      ? fetch('data/athletes/' + encodeURIComponent(id) + '.json').then(function (r) { return r.json(); }).catch(function () { return null; })
      : Promise.resolve(null);
    return load.then(function (a) {
      var full = !!a;
      a = a || {};
      var name = full ? (a.givenName || '') + ' ' + (a.familyName || '') : k.name;
      var age = /^\d{4}-/.test(a.birthDate || '') ? Math.floor((Date.parse(TODAY) - Date.parse(a.birthDate)) / 31557600000) : null;
      var html = '<a class="back" href="javascript:history.back()">← Back</a><h1>' + esc(name) + '</h1><p class="sub">' + esc(a.countryName || a.country || k.nat) +
        (a.birthDate ? ' · born ' + fmtDate(a.birthDate, true) + (age !== null ? ' (age ' + age + ')' : '') : (k.born ? ' · born ' + esc(k.born) : '')) + '</p>';
      if (!full) {
        var best = [];
        Object.keys(D.toplists).forEach(function (key) {
          D.toplists[key].rows.forEach(function (r) { if (r.id === id) best.push({ d: key.replace(/-(women|men)$/, ''), r: r }); });
        });
        html += '<div class="grid2"><div class="card"><h2>Season bests ' + D.season + '</h2>' + (best.length ? simpleTable([['Distance'], ['Time'], ['World rank', 1], ['Where'], ['Date']], best.map(function (b) {
          return '<tr><td><a href="#/distance/' + b.d + '">' + distName(b.d) + '</a></td><td class="mark">' + esc(b.r.mark) + '</td><td class="num">' + esc(b.r.rank) + '</td><td>' + esc(b.r.venue) + '</td><td class="nowrap">' + fmtDate(b.r.date) + '</td></tr>';
        })) : '<p class="muted">Not in the season top 100 at marathon, half marathon or 10 km.</p>') + '</div>' +
          appsCard(id) + '</div></div>' + athleteEntriesCard(id);
        return html + '<p class="muted">Career details (personal bests, full results, honours) are added gradually, a few athletes per update. ' +
          '<a href="https://worldathletics.org/athletes/athlete=' + esc(id) + '" target="_blank" rel="noopener">Profile at World Athletics ↗</a></p>';
      }

      var pbs = (a.personalBests || []).filter(function (p) { return isRoad(p.discipline); });
      var left = '<div class="card"><h2>Road personal bests</h2>' + (pbs.length ? simpleTable([['Distance'], ['Time'], ['Where'], ['Date']], pbs.map(function (p) {
        return '<tr><td>' + esc(p.discipline) + '</td><td class="mark">' + esc(p.mark) + '</td><td>' + esc(p.venue) + '</td><td class="nowrap">' + esc(p.date) + '</td></tr>';
      })) : '<p class="muted">None listed.</p>');
      var other = (a.personalBests || []).filter(function (p) { return !isRoad(p.discipline); });
      if (other.length) {
        left += '<h3>Track and other</h3>' + simpleTable([['Event'], ['Mark'], ['Date']], other.map(function (p) {
          return '<tr><td>' + esc(p.discipline) + (p.indoor ? ' (indoor)' : '') + '</td><td class="mark">' + esc(p.mark) + '</td><td class="nowrap">' + esc(p.date) + '</td></tr>';
        }));
      }
      left += '</div>';
      var right = appsCard(id);
      if ((a.worldRankings || []).length) {
        right += '<h3>World ranking</h3><dl class="kv">' + a.worldRankings.map(function (w) {
          return '<dt>' + esc(w.eventGroup) + '</dt><dd>#' + esc(w.place) + ' <span class="muted">(' + esc(w.rankingScore) + ' pts)</span></dd>';
        }).join('') + '</dl>';
      }
      right += '</div>';
      html += '<div class="grid2">' + left + right + '</div>' + athleteEntriesCard(id);

      if ((a.seasonResults || []).length) {
        html += '<div class="card"><h2>All results ' + esc(a.seasonYear || '') + '</h2>' + simpleTable([['Date'], ['Event'], ['Competition'], ['Place', 1], ['Mark']], a.seasonResults.map(function (s) {
          var race = raceById[s.competitionId];
          return '<tr><td class="nowrap">' + fmtDate(s.date) + '</td><td>' + esc(s.discipline) + '</td><td>' + (race ? raceLink(race) : esc(s.competition)) +
            '</td><td class="num">' + esc(s.place) + '</td><td class="mark">' + esc(s.mark) + '</td></tr>';
        })) + '</div>';
      }
      var prog = (a.roadProgression || []).filter(function (p) { return /marathon|10 kilometres/i.test(p.discipline) && p.results && p.results.length; });
      if (prog.length) {
        html += '<div class="grid' + (prog.length > 2 ? 3 : 2) + '">' + prog.map(function (p) {
          return '<div class="card"><h2>' + esc(p.discipline) + ' by season</h2>' + simpleTable([['Season'], ['Best'], ['Where']], p.results.slice().sort(function (x, y) { return y.season - x.season; }).map(function (x) {
            return '<tr><td>' + esc(x.season) + '</td><td class="mark">' + esc(x.mark) + '</td><td>' + esc(x.venue) + '</td></tr>';
          })) + '</div>';
        }).join('') + '</div>';
      }
      var hon = (a.honours || []).filter(function (h) { return h.results && h.results.length; });
      if (hon.length) {
        html += '<div class="card"><h2>Honours</h2>' + hon.map(function (h) {
          return '<h3>' + esc(h.category) + '</h3>' + simpleTable([['Place', 1], ['Event'], ['Competition'], ['Mark']], h.results.map(function (x) {
            return '<tr><td class="num">' + esc((x.place || '').replace(/\.$/, '')) + '</td><td>' + esc(x.discipline) + '</td><td>' + esc(x.competition) + '</td><td class="mark">' + esc(x.mark) + '</td></tr>';
          }));
        }).join('') + '</div>';
      }
      return html + '<p><a href="' + esc(a.source) + '" target="_blank" rel="noopener">Profile at World Athletics ↗</a> <span class="muted">· profile read ' + fmtDate(a.fetched, true) + '</span></p>';
    });
  }

  function inline(s) {
    return esc(s).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  }
  function markdown(text) {
    var out = '', list = false, para = [];
    function flush() { if (para.length) { out += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } if (list) { out += '</ul>'; list = false; } }
    text.split(/\r?\n/).forEach(function (line) {
      var m;
      if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flush(); out += '<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'; }
      else if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) { if (para.length) flush(); if (!list) { out += '<ul>'; list = true; } out += '<li>' + inline(m[1]) + '</li>'; }
      else if (!line.trim()) flush();
      else { if (list) flush(); para.push(line.trim()); }
    });
    flush();
    return out;
  }
  function viewNews(id) {
    var list = D.newsletters || [];
    if (!list.length) return '<h1>Newsletter</h1><div class="card">No newsletters yet. The first one arrives after the next weekly update.</div>';
    var cur = list.filter(function (n) { return n.id === id; })[0] || list[0];
    return '<h1>Newsletter</h1><p class="sub">Weekly summary, also sent to Telegram.</p><div class="filters">' + list.slice(0, 12).map(function (n) {
      return '<a href="#/news/' + esc(n.id) + '"' + (n === cur ? ' style="font-weight:700"' : '') + '>' + esc(n.id) + '</a>';
    }).join('') + '</div><div class="card news">' + markdown(cur.text) + '</div>';
  }
  function notFound() { return '<h1>Not found</h1><p><a href="#/">Back to the overview</a></p>'; }

  /* ---------- router ---------- */
  function route() {
    hideTip();
    var h = location.hash.replace(/^#\/?/, ''), parts = h.split('/'), out;
    if (!h) out = viewOverview();
    else if (parts[0] === 'races') out = viewRaces();
    else if (parts[0] === 'runs') out = viewRuns();
    else if (parts[0] === 'next') out = viewNext();
    else if (parts[0] === 'race') out = viewRace(parts[1]);
    else if (parts[0] === 'distance') out = viewDistance(parts[1]);
    else if (parts[0] === 'athlete') out = viewAthlete(parts[1]);
    else if (parts[0] === 'news') out = viewNews(parts[1]);
    else out = notFound();
    Promise.resolve(out).then(function (html) { app.innerHTML = html; }, function () { app.innerHTML = notFound(); });
    var key = parts[0] === 'distance' ? h : parts[0] === 'race' ? 'races' : parts[0];
    Array.prototype.forEach.call(document.querySelectorAll('#nav a'), function (a) {
      a.classList.toggle('on', a.getAttribute('data-nav') === (key || ''));
    });
  }
  app.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-filter')) { raceFilter[b.getAttribute('data-filter')] = b.getAttribute('data-value'); route(); }
    if (b.hasAttribute('data-gender')) { listGender = b.getAttribute('data-gender'); route(); }
  });
  window.addEventListener('hashchange', function () { window.scrollTo(0, 0); route(); });

  fetch('data/site.json').then(function (r) { return r.json(); }).then(function (data) {
    D = data;
    D.races.forEach(function (r) { raceById[r.id] = r; });
    D.athleteIds.forEach(function (i) { hasProfile[i] = true; });
    D.races.forEach(function (r) {
      (r.events || []).forEach(function (ev) {
        ev.results.forEach(function (x) {
          if (x.id && !known[x.id]) known[x.id] = { name: x.name, nat: x.nat, born: x.born };
          if (x.id && x.usd) {
            var t = prizeTotals[x.id] || (prizeTotals[x.id] = { usd: 0, races: 0, gender: ev.gender });
            t.usd += x.usd;
            t.races += 1;
          }
        });
      });
    });
    Object.keys(D.toplists).forEach(function (key) {
      D.toplists[key].rows.forEach(function (x) { if (x.id && !known[x.id]) known[x.id] = { name: x.name, nat: x.nat, born: x.born }; });
    });
    Object.keys(D.entries || {}).forEach(function (rid) {
      D.entries[rid].entries.forEach(function (e) { if (e.id && !known[e.id]) known[e.id] = { name: e.name, nat: e.nat, born: '' }; });
    });
    document.getElementById('season').textContent = D.season;
    document.getElementById('updated').textContent = 'Updated ' + fmtDate(D.updated, true) + '. ';
    route();
  }).catch(function (err) {
    app.innerHTML = '<div class="card">Could not load the data (' + esc(err.message) + '). If you opened this file directly, start it with <code>python scripts/serve.py</code> instead.</div>';
  });
})();
