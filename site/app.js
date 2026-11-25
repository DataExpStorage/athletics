(function () {
  'use strict';
  var D = null;            // site.json; races, toplists and labelRaceCounts are narrowed to the selected season
  var ALL = null;          // the same three for every season
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
  function distName(d) { return DIST[d] || esc(d); }   // always safe to put in HTML
  function tierBadge(r) {
    return '<span class="badge"><span class="dot ' + esc(r.tier) + '"></span>' + esc(r.tier) + '</span>' +
      (r.major ? '<span class="major" title="World Marathon Major">MAJOR</span>' : '');
  }
  function athleteLink(id, name) {
    if (id && known[id]) return '<a href="#/athlete/' + esc(id) + '">' + esc(name) + '</a>';
    return esc(name);
  }
  function raceLink(r) { return '<a href="#/race/' + esc(r.id) + '">' + esc(r.name) + '</a>'; }
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
  function addDays(iso, n) { return new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10); }
  function listRank(list, mark) {
    var s = secs(mark);
    if (s === null) return undefined;
    var rank = 1 + list.rows.filter(function (x) { var t = secs(x.mark); return t !== null && t < s; }).length;
    return rank <= list.rows.length ? rank : null;
  }
  // Priority-race top 20s plus, from the season top lists, marks set at other races
  // (the lists hold each athlete's season best only). The window is the 30 days up to
  // the latest of either.
  // season-list marks of one gender ('women'/'men') that were not set at a followed race
  function otherMarks(run, g) {
    var others = [];
    Object.keys(D.toplists).forEach(function (key) {
      if (key.slice(-g.length - 1) !== '-' + g) return;
      var dist = key.slice(0, -g.length - 1);
      D.toplists[key].rows.forEach(function (x) {
        if (!x.date || x.date > TODAY) return;
        var atPriority = run.some(function (r) {
          return x.date >= r.startDate && x.date <= r.endDate && (r.venue === x.venue ||
            r.events.some(function (ev) { return ev.results.some(function (y) { return y.id && y.id === x.id; }); }));
        });
        if (!atPriority) others.push({ dist: dist, x: x });
      });
    });
    return others;
  }
  function latestRuns(gender) {
    var run = D.races.filter(isRun);
    var g = gender === 'W' ? 'women' : 'men';
    var others = otherMarks(run, g);
    // one window for both genders
    var dates = run.map(function (r) { return r.startDate; })
      .concat(others.concat(otherMarks(run, gender === 'W' ? 'men' : 'women')).map(function (o) { return o.x.date; }));
    if (!dates.length) return { from: null, rows: [] };
    var last = dates.reduce(function (a, b) { return a > b ? a : b; });
    var from = addDays(last, -RUN_WINDOW_DAYS);
    var rows = [];
    run.filter(function (r) { return r.startDate >= from; }).forEach(function (r) {
      r.events.filter(function (ev) { return ev.gender === gender; }).forEach(function (ev) {
        var list = D.toplists[ev.distance + '-' + g];
        if (!list) return;
        ev.results.forEach(function (x) {
          var rank = listRank(list, x.mark);
          if (rank !== undefined) rows.push({ r: r, dist: ev.distance, date: r.startDate, x: x, place: x.place, rank: rank });
        });
      });
    });
    others.filter(function (o) { return o.x.date >= from; }).forEach(function (o) {
      var rank = listRank(D.toplists[o.dist + '-' + g], o.x.mark);
      if (rank !== undefined) rows.push({ r: null, dist: o.dist, date: o.x.date, x: o.x, place: o.x.pos, rank: rank });
    });
    rows.sort(function (a, b) { return (a.rank || 999) - (b.rank || 999) || (parseInt(a.place, 10) || 99) - (parseInt(b.place, 10) || 99); });
    return { from: from, to: last, rows: rows };
  }
  function runsTable(gender, limit) {
    var rows = latestRuns(gender).rows.slice(0, limit);
    if (!rows.length) return '<p class="muted">No results in this period.</p>';
    return simpleTable([['Time'], ['Athlete'], ['Race'], ['Place', 1], [D.season + ' list', 1]], rows.map(function (p) {
      var race = p.r ? raceLink(p.r) : esc(p.x.venue) + ' <span class="badge" title="Not one of the followed races; mark from the World Athletics season list">other race</span>';
      return '<tr><td class="mark">' + esc(p.x.mark) + (p.r ? records(p.x.records) : '') + '</td><td>' + athleteLink(p.x.id, p.x.name) + ' <span class="muted">' + esc(p.x.nat) + '</span></td><td>' +
        race + '<div class="muted">' + distName(p.dist) + ' · ' + fmtDate(p.date) + '</div></td><td class="num">' + esc(p.place) +
        '</td><td class="num">' + (p.rank ? '#' + p.rank : '<span class="muted">–</span>') + '</td></tr>';
    }));
  }
  function runsNote() {
    var w = latestRuns('W');
    if (!w.from) return 'No results yet this season.';
    return 'Top-20 finishes in priority races, plus top-100 marks set at other races (from the World Athletics season lists, which keep each athlete\'s best only), from ' +
      fmtDate(w.from) + ' to ' + fmtDate(w.to) + ', ordered by where the time sits among the fastest athletes of ' + D.season + ' at that distance (– = outside the top 100).';
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
  // Links taken from data are only ever followed when they are plain web addresses.
  function safeUrl(u) { return typeof u === 'string' && /^https?:\/\/[^\s<>"']+$/i.test(u) ? u : ''; }
  function srcLink(url) {
    url = safeUrl(url);
    return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0]) + ' ↗</a>' : '';
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
  function entriesBody(r, compact, show) {
    var d = raceEntries(r);
    show = show || 6;
    if (!d || !d.entries.length) return '<p class="muted" style="margin:0">No announced entries recorded yet for this race.</p>';
    var html = '';
    [['W', 'Women'], ['M', 'Men']].forEach(function (g) {
      var all = d.entries.filter(function (e) { return e.gender === g[0]; });
      var inn = all.filter(function (e) { return e.status === 'announced'; });
      var out = all.filter(function (e) { return e.status === 'withdrawn'; });
      if (!all.length) return;
      html += '<div><h3 style="margin-top:0">' + g[1] + '</h3>';
      if (inn.length) {
        html += simpleTable(compact ? [['Athlete'], ['Best'], ['Source']] : [['Athlete'], ['Best'], ['Source'], ['First named'], ['Last confirmed']], (compact ? inn.slice(0, show) : inn).map(function (e) {
          return '<tr><td>' + entryName(e) + '</td><td class="mark">' + esc(e.pb || '') + '</td><td class="nowrap">' + relTag(e.reliability) + '</td>' +
            (compact ? '' : '<td class="nowrap">' + fmtDate(e.firstDate, true) + '</td><td class="nowrap">' + fmtDate(e.lastDate, true) + '</td>') + '</tr>';
        }));
        if (compact && inn.length > show) html += '<p class="muted" style="margin:6px 0 0">and ' + (inn.length - show) + ' more</p>';
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
  // Priority of a race: Major / Platinum / Championship / Gold / others, then marathon / half / 10 km / others.
  function priority(r) {
    var tier = r.major ? 0 : ({ Platinum: 1, Championship: 2, Gold: 3 }[r.tier] || 4);
    var dist = { 'marathon': 0, 'half-marathon': 1, '10km': 2 }[r.distance];
    return tier * 10 + (dist === undefined ? 3 : dist);
  }
  // upcoming races come from every season, so December shows January's races too;
  // in date order, and by priority within the same day
  function upcoming() {
    return ALL.races.filter(function (r) { return !isRun(r) && r.endDate >= TODAY; }).sort(function (a, b) {
      return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : priority(a) - priority(b);
    });
  }
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

  /* ---------- race reports ---------- */
  function reportCard(r) {
    var d = (D.reports || {})[r.id];
    if (!d) {
      return isRun(r) ? '<div class="card"><h2>Race report</h2><p class="muted" style="margin:0">No World Athletics race report has been summarised for this race yet.</p></div>' : '';
    }
    function people(list, g) {
      return list.filter(function (p) { return p.gender === g; }).map(function (p) {
        return '<li><div>' + athleteLink(p.id, p.name) + '</div><div class="win"><span>' + esc(p.note) + '</span></div></li>';
      }).join('');
    }
    var html = '<div class="card"><h2>Race report</h2><dl class="kv"><dt>Weather</dt><dd>' + (d.weather ? esc(d.weather) : '<span class="muted">Not mentioned in the report.</span>') + '</dd>' +
      '<dt>Did not finish</dt><dd>' + (d.dnf && d.dnf.length ? d.dnf.map(function (p) { return '<b>' + athleteLink(p.id, p.name) + '</b>: ' + esc(p.note); }).join('<br>') : '<span class="muted">No notable non-finishers mentioned in the report.</span>') + '</dd></dl>' +
      '<div class="grid2" style="margin:14px 0 0">' + [['W', 'Women'], ['M', 'Men']].map(function (g) {
        var ppl = people(d.performances || [], g[0]);
        return '<div><h3 style="margin-top:0">' + g[1] + '</h3>' + (d.story && d.story[g[0]] ? '<p style="margin:0 0 6px">' + esc(d.story[g[0]]) + '</p>' : '') + (ppl ? '<ul class="racelist">' + ppl + '</ul>' : '') + '</div>';
      }).join('') + '</div>' +
      '<p class="muted" style="margin:10px 0 0">Summary of the World Athletics report: ' + (safeUrl(d.source) ? '<a href="' + esc(safeUrl(d.source)) + '" target="_blank" rel="noopener noreferrer">' + esc(d.title) + ' ↗</a>' : esc(d.title)) + '</p></div>';
    return html;
  }
  function athleteNotesCard(id) {
    var rows = [];
    Object.keys(D.reports || {}).forEach(function (rid) {
      var d = D.reports[rid], r = raceById[rid];
      if (!r) return;
      (d.performances || []).forEach(function (p) { if (p.id === id) rows.push({ r: r, d: d, p: p, dnf: false }); });
      (d.dnf || []).forEach(function (p) { if (p.id === id) rows.push({ r: r, d: d, p: p, dnf: true }); });
    });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return a.r.startDate < b.r.startDate ? 1 : -1; });
    return '<div class="card"><h2>How the races went</h2><ul class="racelist">' + rows.map(function (x) {
      var res = null;
      (x.r.events || []).forEach(function (ev) { ev.results.forEach(function (y) { if (y.id === id) res = y; }); });
      return '<li><div>' + raceLink(x.r) + ' <span class="muted">' + fmtDate(x.r.startDate, true) + '</span></div><div class="meta"><span><b>' +
        (x.dnf ? 'Did not finish' : res ? 'Place ' + esc(res.place) + ' · ' + esc(res.mark) : 'Outside the top 20') + '</b></span>' +
        (x.d.weather ? '<span>Weather: ' + esc(x.d.weather) + '</span>' : '') + '</div><div class="win">' + esc(x.p.note) + ' <span>' + srcLink(x.d.source) + '</span></div></li>';
    }).join('') + '</ul></div>';
  }

  /* ---------- coach, manager, agency, shoe sponsor ---------- */
  var ROLES = { coach: ['Coach', 'Coaches'], manager: ['Manager', 'Managers'], agency: ['Agency', 'Agencies'], shoe: ['Shoe sponsor', 'Shoe sponsors'] };
  var ROLE_ORDER = ['coach', 'manager', 'agency', 'shoe'];
  var people = { coach: {}, manager: {}, agency: {}, shoe: {} };   // role -> slug -> {name, athletes: [id]}
  // brand marks come from the Simple Icons project; brands it does not carry are shown as text
  var BRAND_ICON = { 'adidas': 'adidas', 'nike': 'nike', 'puma': 'puma', 'new balance': 'newbalance', 'under armour': 'underarmour' };
  function slug(name) {
    var t = String(name || '').toLowerCase();
    if (t.normalize) t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    return t.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function properName(name) {   // 'Merhawi KEFLEZIGHI' -> 'Merhawi Keflezighi'
    return String(name || '').replace(/[A-Z\u00C0-\u00DE][A-Z\u00C0-\u00DE'\-]+/g, function (w) {
      return w.charAt(0) + w.slice(1).toLowerCase().replace(/(^|[-'])([a-z\u00e0-\u00fe])/g, function (m, a, b) { return a ? a + b.toUpperCase() : m; });
    });
  }
  function teamItem(id, role) { var t = (D.team || {})[id]; return t && t[role] ? t[role] : null; }
  function roleLink(role, value) {
    return '<a href="#/' + role + '/' + slug(value) + '">' + esc(role === 'manager' ? properName(value) : value) + '</a>';
  }
  function teamGrade(item) {
    return relTag(item.reliability) + (item.verified === false ? ' <span class="muted" title="Found through a search summary; the page itself has not been opened yet">· to verify</span>' : '');
  }
  function brandMark(value, size) {
    var icon = BRAND_ICON[String(value || '').toLowerCase()];
    var text = '<span class="brandtext">' + esc(value) + '</span>';
    if (!icon) return text;
    return '<img class="brandlogo" style="height:' + size + 'px" alt="' + esc(value) + '" title="' + esc(value) + '" src="https://cdn.simpleicons.org/' + icon +
      '/0b0b0b/f0efec" referrerpolicy="no-referrer">';
  }
  function teamBlock(id) {
    var t = (D.team || {})[id];
    if (!t) return '';
    var rows = ROLE_ORDER.map(function (role) {
      var item = t[role];
      if (!item) return '<dt>' + ROLES[role][0] + '</dt><dd class="muted">Not found</dd>';
      var src = srcLink(item.source);
      if (!item.value) return '<dt>' + ROLES[role][0] + '</dt><dd><span class="muted">' + esc(item.note || 'Not found') + '</span>' +
        (src ? '<div class="muted small">Source: ' + src + '</div>' : '') + '</dd>';
      return '<dt>' + ROLES[role][0] + '</dt><dd>' + roleLink(role, item.value) + ' &nbsp;' + teamGrade(item) +
        (src || item.note ? '<div class="muted small">' + (src ? 'Source: ' + src : '') + (src && item.note ? ' · ' : '') + esc(item.note || '') + '</div>' : '') +
        (role === 'manager' && t.managerNote ? '<div class="muted small">' + esc(t.managerNote) + '</div>' : '') + '</dd>';
    }).join('');
    return '<div class="card"><h2>Team</h2><dl class="kv">' + rows + '</dl>' + (t.checked ? '<p class="muted small" style="margin:10px 0 0">Coach and shoe sponsor researched ' + fmtDate(t.checked, true) +
      '; manager and agency as listed by World Athletics unless noted.</p>' : '') + '</div>';
  }
  function shoeHeader(id) {
    var item = teamItem(id, 'shoe');
    return item && item.value ? '<a class="shoe" href="#/shoe/' + slug(item.value) + '" title="Shoe sponsor: ' + esc(item.value) + '">' + brandMark(item.value, 34) + '</a>' : '';
  }
  function buildPeople() {
    people = { coach: {}, manager: {}, agency: {}, shoe: {} };
    Object.keys(D.team || {}).forEach(function (id) {
      ROLE_ORDER.forEach(function (role) {
        var item = D.team[id][role];
        if (!item || !item.value) return;
        var k = slug(item.value);
        (people[role][k] || (people[role][k] = { name: item.value, athletes: [] })).athletes.push(id);
      });
    });
  }
  function viewPeople() {
    var html = '<h1>People</h1><p class="sub">Coaches, managers, agencies and shoe sponsors of the athletes whose profiles are in the tracker (' +
      Object.keys(D.team || {}).length + ' so far). The lists grow as more profiles are added.</p><div class="grid2">';
    ROLE_ORDER.forEach(function (role) {
      var list = Object.keys(people[role]).map(function (k) { return people[role][k]; }).sort(function (a, b) { return b.athletes.length - a.athletes.length || (a.name < b.name ? -1 : 1); });
      html += '<div class="card"><h2>' + ROLES[role][1] + '</h2>' + (list.length ? simpleTable([[ROLES[role][0]], ['Athletes', 1]], list.map(function (x) {
        return '<tr><td>' + (role === 'shoe' ? '<span class="inlinebrand">' + brandMark(x.name, 16) + '</span> ' : '') + roleLink(role, x.name) + '</td><td class="num">' + x.athletes.length + '</td></tr>';
      })) : '<p class="muted">None recorded yet.</p>') + '</div>';
    });
    return html + '</div>';
  }
  function viewRole(role, key) {
    var x = people[role] && people[role][key];
    if (!x) return notFound();
    var others = ROLE_ORDER.filter(function (r) { return r !== role; });
    var ids = x.athletes.slice().sort(function (a, b) { return known[a].name < known[b].name ? -1 : 1; });
    var linked = {};
    others.forEach(function (r) {
      ids.forEach(function (id) { var it = teamItem(id, r); if (it && it.value) (linked[r] || (linked[r] = {}))[it.value] = 1; });
    });
    var html = '<a class="back" href="#/people">← People</a><h1>' + (role === 'shoe' ? '<span class="inlinebrand">' + brandMark(x.name, 26) + '</span> ' : '') +
      esc(role === 'manager' ? properName(x.name) : x.name) + '</h1><p class="sub">' + ROLES[role][0] + ' · ' + ids.length + (ids.length === 1 ? ' athlete' : ' athletes') + ' in the tracker</p>';
    if (role === 'manager' && linked.agency) html += '<p>Agency: ' + Object.keys(linked.agency).map(function (v) { return roleLink('agency', v); }).join(', ') + '</p>';
    if (role === 'agency' && linked.manager) html += '<p>Managers: ' + Object.keys(linked.manager).map(function (v) { return roleLink('manager', v); }).join(', ') + '</p>';
    html += '<div class="card"><div class="scroll"><table><thead><tr><th>Athlete</th><th>Country</th>' + others.map(function (r) { return '<th>' + ROLES[r][0] + '</th>'; }).join('') +
      '<th>How we know</th></tr></thead><tbody>' + ids.map(function (id) {
        var item = teamItem(id, role);
        return '<tr><td>' + athleteLink(id, known[id].name) + '</td><td>' + esc(known[id].nat || '') + '</td>' + others.map(function (r) {
          var it = teamItem(id, r);
          return '<td>' + (it && it.value ? roleLink(r, it.value) : '<span class="muted">–</span>') + '</td>';
        }).join('') + '<td class="nowrap">' + teamGrade(item) + (item.source ? ' <span class="muted">·</span> ' + srcLink(item.source) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return html + '<p class="muted">Only athletes whose profiles have been fetched are listed, so this is not the full roster.</p>';
  }

  var SYMBOL = { USD: '$', EUR: '€', AUD: 'A$', GBP: '£', JPY: '¥' };
  function money(amount, currency) {
    return esc(SYMBOL[currency] || (currency + ' ')) + Math.round(Number(amount) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
        var cy = y + h - 10 - m.lane * lane, col = 'var(--' + ({ Platinum: 'platinum', Gold: 'gold', Extra: 'extra' }[m.r.tier] || 'champ') + ')';
        var run = isRun(m.r);
        body += '<a href="#/race/' + esc(m.r.id) + '" data-race="' + esc(m.r.id) + '" aria-label="' + esc(m.r.name) + ', ' + fmtDate(m.r.startDate) + '">' +
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
      sw('champ', true, 4.5) + 'Championship</span><span>' + sw('extra', true, 4.5) + 'Extra (fast race)</span><span>' + sw('platinum', true, 6.5) + 'Larger = Marathon Major</span><span>' +
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
  // for a race still to come: is an elite field announced?
  function fieldLine(r) {
    var d = raceEntries(r);
    var inn = d ? d.entries.filter(function (e) { return e.status === 'announced'; }) : [];
    var out = d ? d.entries.filter(function (e) { return e.status === 'withdrawn'; }).length : 0;
    if (!inn.length) return '<div class="field none">Elite field not announced yet</div>';
    var w = inn.filter(function (e) { return e.gender === 'W'; }).length, m = inn.length - w;
    return '<div class="field"><a href="#/race/' + esc(r.id) + '">Elite field announced</a>: ' + w + ' women, ' + m + ' men' +
      (out ? ' · ' + out + ' withdrawn' : '') + (d.checked ? ' <span class="muted">· checked ' + fmtDate(d.checked) + '</span>' : '') + '</div>';
  }
  function raceItem(r) {
    var html = '<li><div>' + raceLink(r) + '</div><div class="meta"><span>' + fmtDate(r.startDate) + '</span><span>' + esc(r.venue) + '</span>' +
      tierBadge(r) + '<span>' + distName(r.distance) + '</span></div>';
    if (isRun(r) && r.distance !== 'multi') {
      html += '<div class="winners"><div><span class="g">W</span>' + winnerText(r, 'W') + '</div><div><span class="g">M</span>' + winnerText(r, 'M') + '</div></div>';
    } else if (!isRun(r)) {
      html += fieldLine(r);
    }
    return html + '</li>';
  }
  // Overview card: the races of the next 7 days; if none, those of the next 14 days;
  // if none either, the top race of the next race day.
  function nextRaceBlock(r, show) {
    return '<div class="next-race"><h3 style="margin-top:0">' + raceLink(r) + '</h3><div class="racelist"><div class="meta" style="margin-bottom:8px"><span>' +
      fmtDate(r.startDate, true) + '</span><span>' + esc(r.venue) + '</span>' + tierBadge(r) + '<span>' + distName(r.distance) + '</span></div></div>' +
      entriesBody(r, true, show) + '</div>';
  }
  function runningNextBody(next) {
    if (!next.length) return '<p class="muted" style="margin:0">No more priority races this season.</p>';
    var within = function (days) { var to = addDays(TODAY, days); return next.filter(function (r) { return r.startDate <= to; }); };
    var week = within(7), fortnight = within(14);
    var list = function (races) { return races.map(function (r) { return nextRaceBlock(r, races.length > 1 ? 3 : 6); }).join(''); };
    if (week.length) return list(week);
    if (fortnight.length) return '<p class="muted" style="margin:0 0 10px">No races in the next 7 days. Coming up in the next 14 days:</p>' + list(fortnight);
    return '<p class="muted" style="margin:0 0 10px">No races in the next 14 days.</p><p style="margin:0 0 10px"><b>Next major race:</b></p>' + list([next[0]]);
  }
  function viewOverview() {
    var run = D.races.filter(isRun), next = upcoming();
    var left = D.races.filter(function (r) { return !isRun(r) && r.endDate >= TODAY; }).length;
    var majors = D.races.filter(function (r) { return r.major; });
    var nxt = next[0];
    var html = '<h1>Road running ' + D.season + '</h1><p class="sub">The ' + D.races.length +
      ' races followed this season: Platinum and Gold label races, championships, and selected consistently fast races (Extra).</p>';
    html += '<div class="tiles">' +
      '<div class="tile"><div class="k">Races run</div><div class="v">' + run.length + ' of ' + D.races.length + '</div><div class="n">' + left + ' still to come</div></div>' +
      '<div class="tile"><div class="k">Marathon Majors run</div><div class="v">' + majors.filter(isRun).length + ' of ' + majors.length + '</div><div class="n">All Platinum label</div></div>' +
      '<div class="tile"><div class="k">Next race</div><div class="v">' + (nxt ? fmtDate(nxt.startDate) : '–') + '</div><div class="n">' + (nxt ? raceLink(nxt) : 'Season complete') + '</div></div>' +
      '<div class="tile"><div class="k">Label races worldwide</div><div class="v">' + Object.keys(D.labelRaceCounts || {}).reduce(function (s, k) { return s + D.labelRaceCounts[k]; }, 0) +
      '</div><div class="n">' + ((D.labelRaceCounts || {}).Platinum || 0) + ' Platinum, ' + ((D.labelRaceCounts || {}).Gold || 0) + ' Gold</div></div></div>';
    var latest = (D.newsletters || [])[0];
    if (latest) {
      html += '<p class="latest-news"><b>Newsletter:</b> <a href="#/news/' + esc(latest.id) + '">' + esc(issueTitle(latest)) + '</a> <span class="muted">· ' +
        esc(latest.id) + ' · <a href="#/news">all issues</a></span></p>';
    }
    html += '<div class="card"><h2>Season at a glance</h2>' + timeline() + '</div>';
    html += '<div class="grid2"><div class="card"><h2>Latest results</h2><ul class="racelist">' +
      run.slice(-6).reverse().map(raceItem).join('') + '</ul></div>' +
      '<div class="card"><h2>Coming up</h2><ul class="racelist">' +
      (next.length ? next.slice(0, 6).map(raceItem).join('') : '<li class="muted">No more priority races this season.</li>') + '</ul></div></div>';
    html += '<div class="card"><h2><a href="#/runs">Latest runs</a></h2><div class="grid2" style="margin-bottom:0"><div><h3 style="margin-top:0">Women</h3>' + runsTable('W', 5) +
      '</div><div><h3 style="margin-top:0">Men</h3>' + runsTable('M', 5) + '</div></div><p class="muted" style="margin:10px 0 0">' + runsNote() + ' <a href="#/runs">See all</a></p></div>';
    html += '<div class="card"><h2><a href="#/next">Running next</a></h2>' + runningNextBody(next) +
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
      return '<button data-filter="' + name + '" data-value="' + esc(o) + '"' + (o === current ? ' class="on" aria-pressed="true"' : '') + '>' + distName(o) + '</button>';
    }).join('') + '</div>';
  }
  function viewRaces() {
    var rows = D.races.filter(function (r) {
      // Majors have their own filter, so the Platinum filter shows the other Platinum races only
      var okT = raceFilter.tier === 'All' || (raceFilter.tier === 'Majors' ? r.major : r.tier === raceFilter.tier && !r.major);
      var d = (r.distance === 'marathon' || r.distance === 'half-marathon' || r.distance === '10km') ? r.distance : 'other';
      return okT && (raceFilter.dist === 'All' || d === raceFilter.dist);
    });
    return '<h1>Races</h1><p class="sub">All priority races of ' + D.season + ' with winners.</p><div class="card">' +
      '<div class="filters">' + seg('tier', ['All', 'Majors', 'Platinum', 'Gold', 'Extra', 'Championship'], raceFilter.tier) +
      seg('dist', ['All', 'marathon', 'half-marathon', '10km', 'other'], raceFilter.dist) +
      '<span class="muted">' + rows.length + ' races</span></div><div class="scroll"><table><thead><tr><th>Date</th><th>Race</th><th>Label</th><th>Distance</th><th>Women</th><th>Men</th><th class="num">1st prize</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var multi = r.distance === 'multi';
        var first = r.prize && r.prize.first ? money(r.prize.first, r.prize.currency) : '<span class="muted">' + (isRun(r) ? '?' : '') + '</span>';
        return '<tr><td class="nowrap">' + fmtDate(r.startDate) + '</td><td>' + raceLink(r) + '<div class="muted">' + esc(r.venue) + '</div></td><td class="nowrap">' +
          tierBadge(r) + '</td><td class="nowrap">' + distName(r.distance) + '</td>' +
          (multi ? '<td colspan="2">' + (isRun(r) ? '<a href="#/race/' + esc(r.id) + '">' + r.events.length + ' events</a>' : '<span class="muted">–</span>') + '</td>'
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
      '<dt>Sources</dt><dd>' + (p.sources || []).map(srcLink).filter(Boolean).join(', ') + '</dd></dl>' +
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
    html += reportCard(r) + '<div class="grid2">' + evs.map(function (ev) {
      return '<div class="card"><h2>' + esc(ev.event) + '</h2>' + resultsTable(ev, r) + '<p class="muted" style="margin:10px 0 0">Top ' + ev.results.length +
        ' of ' + ev.finishers + ' listed finishers.</p></div>';
    }).join('') + '</div>' + prizeCard(r) + entriesCard(r);
    return html + '<p><a href="' + esc(r.source) + '" target="_blank" rel="noopener">Full results at World Athletics ↗</a></p>';
  }

  var listGender = 'women';
  function viewDistance(d) {
    if (!DIST[d]) return notFound();
    if (!D.toplists[d + '-women'] || !D.toplists[d + '-men']) {
      return '<h1>' + distName(d) + '</h1><div class="card">No ' + D.season + ' season list yet: World Athletics has too few results at this distance so far.</div>';
    }
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
  // Road events: marathon, half marathon and anything World Athletics names "... Road".
  // "Mile" and "Mile Short Track" are track events; only "Mile Road" is a road event.
  function isRoad(name) { return /marathon|\broad\b/i.test(name || '') && !/race walk/i.test(name || ''); }
  var OLYMPIC_TRACK = ['100 Metres', '200 Metres', '400 Metres', '800 Metres', '1500 Metres', '5000 Metres', '10,000 Metres',
    '100 Metres Hurdles', '110 Metres Hurdles', '400 Metres Hurdles', '3000 Metres Steeplechase',
    '4x100 Metres Relay', '4x400 Metres Relay', '4x400 Metres Relay Mixed', '20 Kilometres Race Walk', 'Marathon Race Walk Mixed Relay',
    'High Jump', 'Pole Vault', 'Long Jump', 'Triple Jump', 'Shot Put', 'Discus Throw', 'Hammer Throw', 'Javelin Throw', 'Heptathlon', 'Decathlon'];
  function isOlympicTrack(p) { return !p.indoor && OLYMPIC_TRACK.indexOf(p.discipline) >= 0; }
  // length of an event in metres, for ordering longest to shortest (0 = not a distance)
  function metres(name) {
    var n = (name || '').toLowerCase().replace(/,/g, ''), m;
    if (/half marathon/.test(n)) return 21097.5;
    if (/marathon/.test(n)) return 42195;
    if ((m = /(\d+)x(\d+) metres/.exec(n))) return parseInt(m[1], 10) * parseInt(m[2], 10);
    if ((m = /([\d.]+) kilometres/.exec(n))) return parseFloat(m[1]) * 1000;
    if ((m = /([\d.]+) miles/.exec(n))) return parseFloat(m[1]) * 1609.344;
    if (/\bmile\b/.test(n)) return 1609.344;
    if ((m = /([\d.]+) metres/.exec(n))) return parseFloat(m[1]);
    return 0;
  }
  function byLength(a, b) { return metres(b.discipline) - metres(a.discipline) || (a.discipline < b.discipline ? -1 : 1); }
  var MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  function isoDate(s) {      // '26 APR 2026' -> '2026-04-26'
    var m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec((s || '').trim());
    return m && MON[m[2].toUpperCase()] ? m[3] + '-' + MON[m[2].toUpperCase()] + '-' + ('0' + m[1]).slice(-2) : (s || '');
  }
  var HONOUR_GROUPS = [['Major Marathon', 'Marathon Majors'], ['International Marathon', 'International Marathons'], ['Olympic Games', 'Olympic Games'],
    ['World Championships', 'World Championships'], ['World Road Running Championships', 'World Road Running Championships'],
    ['World Cross Country Championships', 'World Cross Country Championships']];
  var FEATURED = ['Marathon', 'Half Marathon', '10 Kilometres Road'];

  // why an athlete is in focus: "In focus for 2026: 1st TCS London Marathon; #1 marathon list"
  function focusReason(r) {
    if (r.kind === 'race') {
      var race = raceById[r.raceId];
      var place = r.place ? r.place + ({ 1: 'st', 2: 'nd', 3: 'rd' }[r.place % 10] && (r.place < 11 || r.place > 13) ? { 1: 'st', 2: 'nd', 3: 'rd' }[r.place % 10] : 'th') : '';
      return place + ' ' + (race ? raceLink(race) : 'race') + (race && race.distance === 'multi' && r.event ? ' (' + esc(r.event) + ')' : '');
    }
    var m = /^(.*)-(women|men)$/.exec(r.list || '');
    return '#' + esc(r.rank) + ' ' + (m ? distName(m[1]).toLowerCase() : esc(r.list)) + ' list (' + esc(r.mark) + ')';
  }
  function focusLine(id) {
    var f = (D.focus || {})[id];
    if (!f || !f.length) return '';
    return '<p class="focus-line">' + f.slice().sort(function (a, b) { return b.season - a.season; }).map(function (s) {
      return '<span><b>In focus for ' + s.season + (s.final === true ? ' (final list)' : s.final === false ? ' (not on the final list)' : '') + ':</b> ' +
        s.reasons.slice(0, 4).map(focusReason).join('; ') + (s.reasons.length > 4 ? '; and ' + (s.reasons.length - 4) + ' more' : '') + '</span>';
    }).join('<br>') + '</p>';
  }
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
      var html = '<a class="back" href="#/" data-back>← Back</a><div class="ath-head"><h1>' + esc(name) + '</h1>' + shoeHeader(id) + '</div><p class="sub">' + esc(a.countryName || a.country || k.nat) +
        (a.birthDate ? ' · born ' + fmtDate(a.birthDate, true) + (age !== null ? ' (age ' + age + ')' : '') : (k.born ? ' · born ' + esc(k.born) : '')) + '</p>' + focusLine(id);
      if (!full) {
        var best = [];
        Object.keys(D.toplists).forEach(function (key) {
          D.toplists[key].rows.forEach(function (r) { if (r.id === id) best.push({ d: key.replace(/-(women|men)$/, ''), r: r }); });
        });
        html += '<div class="grid2"><div class="card"><h2>Season bests ' + D.season + '</h2>' + (best.length ? simpleTable([['Distance'], ['Time'], ['World rank', 1], ['Where'], ['Date']], best.map(function (b) {
          return '<tr><td><a href="#/distance/' + b.d + '">' + distName(b.d) + '</a></td><td class="mark">' + esc(b.r.mark) + '</td><td class="num">' + esc(b.r.rank) + '</td><td>' + esc(b.r.venue) + '</td><td class="nowrap">' + fmtDate(b.r.date) + '</td></tr>';
        })) : '<p class="muted">Not in the season top 100 at marathon, half marathon or 10 km.</p>') + '</div>' +
          appsCard(id) + '</div></div>' + athleteNotesCard(id) + athleteEntriesCard(id);
        return html + '<p class="muted">Career details (personal bests, full results, honours) are added gradually, a few athletes per update. ' +
          '<a href="https://worldathletics.org/athletes/athlete=' + esc(id) + '" target="_blank" rel="noopener">Profile at World Athletics ↗</a></p>';
      }

      var pbs = (a.personalBests || []).filter(function (p) { return isRoad(p.discipline); }).sort(byLength);
      var left = '<div class="card"><h2>Road personal bests</h2>' + (pbs.length ? simpleTable([['Distance'], ['Time'], ['Where'], ['Date']], pbs.map(function (p) {
        return '<tr><td>' + esc(p.discipline) + '</td><td class="mark">' + esc(p.mark) + '</td><td>' + esc(p.venue) + '</td><td class="nowrap">' + esc(p.date) + '</td></tr>';
      })) : '<p class="muted">None listed.</p>');
      var other = (a.personalBests || []).filter(function (p) { return !isRoad(p.discipline) && isOlympicTrack(p); }).sort(byLength);
      if (other.length) {
        left += '<h3>Track (Olympic events)</h3>' + simpleTable([['Event'], ['Mark'], ['Date']], other.map(function (p) {
          return '<tr><td>' + esc(p.discipline) + '</td><td class="mark">' + esc(p.mark) + '</td><td class="nowrap">' + esc(p.date) + '</td></tr>';
        }));
      }
      left += '</div>';
      if ((D.frozenProfiles || []).indexOf(id) >= 0) {
        var seasons = (D.focus[id] || []).map(function (f) { return f.season; });
        html += '<p class="notice">This profile is no longer updated. It was last read on ' + fmtDate(a.fetched, true) + '. ' +
          (seasons.length ? 'The athlete was last among the athletes in focus in ' + Math.max.apply(null, seasons) + ' and did not meet the criteria again. '
            : 'The athlete has not been among the athletes in focus. ') +
          'Career details, world ranking and team may be out of date; the priority race results on this page are still current.</p>';
      }
      html += teamBlock(id);
      var right = appsCard(id);
      if ((a.worldRankings || []).length) {
        right += '<h3>World ranking</h3><dl class="kv">' + a.worldRankings.map(function (w) {
          return '<dt>' + esc(w.eventGroup) + '</dt><dd>#' + esc(w.place) + ' <span class="muted">(' + esc(w.rankingScore) + ' pts)</span></dd>';
        }).join('') + '</dl>';
      }
      right += '</div>';
      html += '<div class="grid2">' + left + right + '</div>' + athleteNotesCard(id) + athleteEntriesCard(id);

      if ((a.seasonResults || []).length) {
        html += '<div class="card"><h2>All results ' + esc(a.seasonYear || '') + '</h2>' + simpleTable([['Date'], ['Event'], ['Competition'], ['Place', 1], ['Mark']], a.seasonResults.map(function (s) {
          var race = raceById[s.competitionId];
          return '<tr><td class="nowrap">' + fmtDate(s.date) + '</td><td>' + esc(s.discipline) + '</td><td>' + (race ? raceLink(race) : esc(s.competition)) +
            '</td><td class="num">' + esc(s.place) + '</td><td class="mark">' + esc(s.mark) + '</td></tr>';
        })) + '</div>';
      }
      var prog = (a.roadProgression || []).filter(function (p) { return FEATURED.indexOf(p.discipline) >= 0 && p.results && p.results.length; }).sort(byLength);
      if (prog.length) {
        html += '<div class="grid' + (prog.length > 2 ? 3 : 2) + '">' + prog.map(function (p) {
          return '<div class="card"><h2>' + esc(p.discipline) + ' by season</h2>' + simpleTable([['Season'], ['Best'], ['Where']], p.results.slice().sort(function (x, y) { return x.season - y.season; }).map(function (x) {
            return '<tr><td>' + esc(x.season) + '</td><td class="mark">' + esc(x.mark) + '</td><td>' + esc(x.venue) + '</td></tr>';
          })) + '</div>';
        }).join('') + '</div>';
      }
      var honRows = '';
      HONOUR_GROUPS.forEach(function (g) {
        var res = [];
        (a.honours || []).forEach(function (h) { if (h.category === g[0]) res = res.concat(h.results || []); });
        if (!res.length) return;
        res.sort(function (x, y) { var dx = isoDate(x.date), dy = isoDate(y.date); return dx < dy ? -1 : dx > dy ? 1 : 0; });
        honRows += '<tr class="grp"><th colspan="5">' + g[1] + '</th></tr>' + res.map(function (x) {
          return '<tr><td class="nowrap">' + fmtDate(isoDate(x.date), true) + '</td><td class="num">' + esc((x.place || '').replace(/\.$/, '')) + '</td><td>' + esc(x.discipline) +
            '</td><td>' + esc(x.competition) + '</td><td class="mark">' + esc(x.mark) + '</td></tr>';
        }).join('');
      });
      if (honRows) {
        html += '<div class="card"><h2>Honours</h2><div class="scroll"><table class="honours"><colgroup><col style="width:14%"><col style="width:8%"><col style="width:24%"><col style="width:40%"><col style="width:14%"></colgroup>' +
          '<thead><tr><th>Date</th><th class="num">Place</th><th>Event</th><th>Competition</th><th>Mark</th></tr></thead><tbody>' + honRows + '</tbody></table></div></div>';
      }
      return html + '<p><a href="' + esc(a.source) + '" target="_blank" rel="noopener">Profile at World Athletics ↗</a> <span class="muted">· profile read ' + fmtDate(a.fetched, true) + '</span></p>';
    });
  }

  function inline(s) {
    return esc(s).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1 ↗</a>')
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
  function weekLabel(id) {      // '2026-W47' -> 'Week 47'
    var m = /^(\d{4})-W(\d{2})$/.exec(id || '');
    return m ? 'Week ' + parseInt(m[2], 10) : id;
  }
  function issueTitle(n) { return String(n.title || '').replace(/^Road running weekly:\s*/i, '') || n.id; }
  function viewNews(id) {
    var list = D.newsletters || [];      // newest first
    if (!list.length) return '<h1>Newsletter</h1><div class="card">No newsletters yet. The first one appears after the next weekly update.</div>';
    var i = 0;
    list.forEach(function (n, k) { if (n.id === id) i = k; });
    var cur = list[i], newer = list[i - 1], older = list[i + 1];
    var html = '<h1>Newsletter</h1><p class="sub">A weekly summary of results, news and what is coming next. Every issue is kept below.</p>';
    html += '<div class="card news"><p class="muted small" style="margin:0 0 8px">' + esc(cur.id) + (i === 0 ? ' · latest issue' : '') + '</p>' + markdown(cur.text) +
      '<p class="issue-nav">' + (older ? '<a href="#/news/' + esc(older.id) + '">← Older: ' + esc(issueTitle(older)) + '</a>' : '<span></span>') +
      (newer ? '<a href="#/news/' + esc(newer.id) + '">Newer: ' + esc(issueTitle(newer)) + ' →</a>' : '<span></span>') + '</p></div>';
    var years = [], byYear = {};
    list.forEach(function (n) {
      var y = String(n.id).slice(0, 4);
      if (!byYear[y]) { byYear[y] = []; years.push(y); }
      byYear[y].push(n);
    });
    html += '<div class="card"><h2>All issues (' + list.length + ')</h2>' + years.map(function (y) {
      return '<h3>' + esc(y) + '</h3><ul class="racelist">' + byYear[y].map(function (n) {
        return '<li><a href="#/news/' + esc(n.id) + '"' + (n === cur ? ' style="font-weight:700"' : '') + '>' + esc(issueTitle(n)) + '</a> <span class="muted">' + esc(weekLabel(n.id)) + '</span></li>';
      }).join('') + '</ul>';
    }).join('') + '</div>';
    return html;
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
    else if (parts[0] === 'people') out = viewPeople();
    else if (ROLES[parts[0]]) out = viewRole(parts[0], parts[1]);
    else if (parts[0] === 'race') out = viewRace(parts[1]);
    else if (parts[0] === 'distance') out = viewDistance(parts[1]);
    else if (parts[0] === 'athlete') out = viewAthlete(parts[1]);
    else if (parts[0] === 'news') out = viewNews(parts[1]);
    else out = notFound();
    Promise.resolve(out).then(function (html) { app.innerHTML = html; }, function () { app.innerHTML = notFound(); });
    var key = parts[0] === 'distance' ? h : parts[0] === 'race' ? 'races' : ROLES[parts[0]] ? 'people' : parts[0];
    Array.prototype.forEach.call(document.querySelectorAll('#nav a'), function (a) {
      a.classList.toggle('on', a.getAttribute('data-nav') === (key || ''));
    });
  }
  // a brand logo that fails to load is replaced by the brand name as text
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('brandlogo') && t.parentNode) {
      var span = document.createElement('span');
      span.className = 'brandtext';
      span.textContent = t.getAttribute('alt') || '';
      t.parentNode.replaceChild(span, t);
    }
  }, true);
  app.addEventListener('click', function (e) {
    var back = e.target.closest('[data-back]');
    if (back && history.length > 1) { e.preventDefault(); history.back(); return; }
    var b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-filter')) { raceFilter[b.getAttribute('data-filter')] = b.getAttribute('data-value'); route(); }
    if (b.hasAttribute('data-gender')) { listGender = b.getAttribute('data-gender'); route(); }
  });
  window.addEventListener('hashchange', function () { window.scrollTo(0, 0); route(); });

  function setSeason(s) {
    D.season = s;
    D.races = ALL.races.filter(function (r) { return r.season === s; });
    D.toplists = ALL.toplists[s] || {};
    D.labelRaceCounts = ALL.labelRaceCounts[s] || {};
    prizeTotals = {};
    D.races.forEach(function (r) {
      (r.events || []).forEach(function (ev) {
        ev.results.forEach(function (x) {
          if (x.id && x.usd) {
            var t = prizeTotals[x.id] || (prizeTotals[x.id] = { usd: 0, races: 0, gender: ev.gender });
            t.usd += x.usd;
            t.races += 1;
          }
        });
      });
    });
    try { localStorage.setItem('season', String(s)); } catch (e) { /* storage unavailable */ }
  }
  fetch('data/site.json').then(function (r) { return r.json(); }).then(function (data) {
    D = data;
    ALL = { races: data.races, toplists: data.toplists, labelRaceCounts: data.labelRaceCounts || {} };
    ALL.races.forEach(function (r) { raceById[r.id] = r; });
    D.athleteIds.forEach(function (i) { hasProfile[i] = true; });
    ALL.races.forEach(function (r) {
      (r.events || []).forEach(function (ev) {
        ev.results.forEach(function (x) {
          if (x.id && !known[x.id]) known[x.id] = { name: x.name, nat: x.nat, born: x.born };
        });
      });
    });
    Object.keys(ALL.toplists).forEach(function (season) {
      Object.keys(ALL.toplists[season]).forEach(function (key) {
        ALL.toplists[season][key].rows.forEach(function (x) { if (x.id && !known[x.id]) known[x.id] = { name: x.name, nat: x.nat, born: x.born }; });
      });
    });
    buildPeople();
    var seasons = data.seasons.slice().sort(), saved = null;
    try { saved = parseInt(localStorage.getItem('season'), 10); } catch (e) { /* storage unavailable */ }
    var thisYear = parseInt(TODAY.slice(0, 4), 10);
    var pick = seasons.indexOf(saved) >= 0 ? saved : seasons.indexOf(thisYear) >= 0 ? thisYear : seasons[seasons.length - 1];
    setSeason(pick);
    var holder = document.getElementById('season');
    if (seasons.length > 1) {
      holder.innerHTML = '<select id="seasonSel" aria-label="Season">' + seasons.map(function (s) {
        return '<option value="' + s + '"' + (s === pick ? ' selected' : '') + '>' + s + '</option>';
      }).join('') + '</select>';
      document.getElementById('seasonSel').addEventListener('change', function (e) { setSeason(parseInt(e.target.value, 10)); route(); });
      holder.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });
    } else {
      holder.textContent = pick;
    }
    Object.keys(D.entries || {}).forEach(function (rid) {
      D.entries[rid].entries.forEach(function (e) { if (e.id && !known[e.id]) known[e.id] = { name: e.name, nat: e.nat, born: '' }; });
    });
    Object.keys(D.reports || {}).forEach(function (rid) {
      (D.reports[rid].performances || []).concat(D.reports[rid].dnf || []).forEach(function (p) { if (p.id && !known[p.id]) known[p.id] = { name: p.name, nat: '', born: '' }; });
    });
    document.getElementById('updated').textContent = 'Updated ' + fmtDate(D.updated, true) + '. ';
    route();
  }).catch(function (err) {
    app.innerHTML = '<div class="card">Could not load the data (' + esc(err.message) + '). If you opened this file directly, start it with <code>python scripts/serve.py</code> instead.</div>';
  });
})();
