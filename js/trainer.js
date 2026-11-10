/*
 * Open File trainer: pick an opening, then play its moves from memory.
 * The opponent's moves play themselves; yours are checked against the line.
 * The chosen opening is drilled first, then each deeper line that branches from it.
 *
 * Views are routed on location.hash: "" shows the picker, "#<opening-id>" the trainer.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var rep = new Repertoire(window.OPENINGS, window.OPENING_TAGS);
  var OPPONENT_DELAY = 450;
  var GROUPS_SHOWN = 9;   // "lines inside other openings" cards before "Show more"
  var LINES_SHOWN = 4;    // lines per such card before "Show all"

  var TAGS = [
    { key: 'sound', label: 'Sound', hint: 'Mainstream openings trusted at master level' },
    { key: 'beginner', label: 'Beginner-friendly', hint: 'Simple plans, widely recommended to newer players' },
    { key: 'trappy', label: 'Trappy', hint: 'Sharp lines that set early traps' },
    { key: 'gambit', label: 'Gambit', hint: 'Gives up material for fast development' },
    { key: 'offbeat', label: 'Offbeat', hint: 'Rare openings that take opponents out of book' },
    { key: 'started', label: 'Started', hint: 'Openings you have already trained here' }
  ];

  OpenFilePieces.mountSprite(document);

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function sideName(c) { return c === 'w' ? 'White' : 'Black'; }
  function plural(n, word) { return n.toLocaleString() + ' ' + word + (n === 1 ? '' : 's'); }

  function movesText(moves, max) {
    var out = [];
    for (var i = 0; i < moves.length && i < (max || 99); i++) out.push((i % 2 === 0 ? (i / 2 + 1) + '.' : '') + moves[i]);
    if (max && moves.length > max) out.push('…');
    return out.join(' ');
  }
  function lastMoveText(moves) {
    var i = moves.length - 1;
    return (Math.floor(i / 2) + 1) + (i % 2 === 0 ? '.' : '...') + moves[i];
  }

  /* ---------- saved progress (this browser only) ---------- */

  var store = (function () {
    var KEY = 'openfile:v1';
    var data = { lines: {}, side: {}, recent: {} };
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      if (saved) Object.keys(data).forEach(function (k) { if (saved[k]) data[k] = saved[k]; });
    } catch (e) {}
    function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
    return {
      lineStatus: function (lineId, side) { return data.lines[side + '|' + lineId] || null; },
      setLineStatus: function (lineId, side, status) {
        var k = side + '|' + lineId;
        if (data.lines[k] === 'learned') return; // a clean run is never undone
        data.lines[k] = status; save();
      },
      side: function (openingId) { return data.side[openingId] || null; },
      setSide: function (openingId, side) { data.side[openingId] = side; save(); },
      touch: function (openingId) { data.recent[openingId] = Date.now(); save(); },
      started: function (openingId) { return !!data.recent[openingId]; },
      recent: function () {
        return Object.keys(data.recent).sort(function (a, b) { return data.recent[b] - data.recent[a]; });
      }
    };
  })();

  /* ---------- picker ---------- */

  var filters = { text: '', side: '', first: '', tags: [] };
  var showAllGroups = false;
  var expanded = {};
  var homeScroll = 0;
  var miniCache = {};
  var scratch = new Chess();

  function mini(e) {
    if (!miniCache[e.id]) {
      scratch.reset();
      e.moves.forEach(function (m) { scratch.move(m); });
      miniCache[e.id] = BoardView.mini(scratch.fen(), e.side);
    }
    return miniCache[e.id];
  }

  function tagsHtml(e) {
    var out = '';
    TAGS.forEach(function (t) {
      if (e.tags[t.key]) out += '<span class="tag tag-' + t.key + '">' + esc(t.label) + '</span>';
    });
    return out ? '<span class="tags">' + out + '</span>' : '';
  }

  function cardHtml(e, o) {
    return '<a class="card" href="#' + e.id + '">' +
      '<span class="card-board">' + mini(e) + '</span>' +
      '<span class="card-body">' +
        '<span class="card-name">' + esc(o.title) + '</span>' +
        (o.sub ? '<span class="card-sub">' + esc(o.sub) + '</span>' : '') +
        '<span class="card-moves">' + esc(movesText(e.moves, 8)) + '</span>' +
        '<span class="card-meta"><span class="turn-chip ' + e.side + '"></span>' + sideName(e.side) + (o.meta ? ' · ' + esc(o.meta) : '') + '</span>' +
        (o.extra || tagsHtml(e)) +
      '</span></a>';
  }

  function groupHtml(g) {
    var fam = g.family, all = expanded[fam.name];
    var shown = all ? g.top : g.top.slice(0, LINES_SHOWN);
    var items = shown.map(function (e) {
      return '<li><a href="#' + e.id + '"><span class="gl-name">' + esc(e.variation || movesText(e.moves)) +
        '</span><span class="gl-move">' + esc(lastMoveText(e.moves)) + '</span></a></li>';
    }).join('');
    var more = g.top.length > shown.length
      ? '<button class="link-btn" type="button" data-expand="' + esc(fam.name) + '">Show all ' + g.top.length + '</button>' : '';
    return '<div class="group">' +
      '<a class="group-head" href="#' + fam.root.id + '"><span class="group-name">' + esc(fam.name) + '</span>' +
      '<span class="group-count">' + plural(g.count, 'line') + '</span></a>' +
      '<ul class="group-lines">' + items + '</ul>' + more + '</div>';
  }

  function progressFor(e) {
    var side = store.side(e.id) || e.side;
    var lines = rep.linesFor(e), learned = 0;
    lines.forEach(function (l) { if (store.lineStatus(l.id, side) === 'learned') learned++; });
    return { learned: learned, total: lines.length };
  }

  function renderContinue() {
    var active = filters.text || filters.side || filters.first || filters.tags.length;
    var ids = active ? [] : store.recent().filter(function (id) { return rep.byId(id); }).slice(0, 3);
    $('continue').hidden = ids.length === 0;
    $('continue-cards').innerHTML = ids.map(function (id) {
      var e = rep.byId(id), p = progressFor(e);
      return cardHtml(e, {
        title: e.family, sub: e.variation,
        extra: '<span class="card-progress">' + p.learned + ' of ' + plural(p.total, 'line') + ' learned' +
          '<span class="progress"><span style="width:' + (p.learned / p.total * 100) + '%"></span></span></span>'
      });
    }).join('');
  }

  function renderResults() {
    var q = {
      text: filters.text, side: filters.side, first: filters.first,
      tags: filters.tags.filter(function (t) { return t !== 'started'; })
    };
    if (filters.tags.indexOf('started') !== -1) q.test = function (e) { return store.started(e.id); };
    var active = !!(filters.text || filters.side || filters.first || filters.tags.length);

    var groups = rep.query(q);
    var openings = groups.filter(function (g) { return g.rootMatches; });
    var inside = groups.filter(function (g) { return !g.rootMatches; });
    var who = filters.side ? sideName(filters.side) : '';

    $('openings-title').textContent = who ? 'Openings for ' + who : active ? 'Matching openings' : 'All openings';
    $('group-openings').hidden = openings.length === 0;
    $('openings').innerHTML = openings.map(function (g) {
      var e = g.family.root;
      return cardHtml(e, { title: g.family.name, sub: e.variation, meta: plural(g.family.entries.length, 'line') });
    }).join('');

    $('group-lines').hidden = inside.length === 0;
    $('lines-title').textContent = who ? who + "'s options inside other openings" : 'Matching lines inside other openings';
    $('lines-note').textContent = who
      ? 'Lines where ' + who + ' picks the variation, grouped by the opening they belong to. The lines with the most theory come first.'
      : 'Single lines that match, grouped by the opening they belong to.';
    var visible = showAllGroups ? inside : inside.slice(0, GROUPS_SHOWN);
    $('line-groups').innerHTML = visible.map(groupHtml).join('');
    var more = $('more-groups');
    more.hidden = visible.length === inside.length;
    more.textContent = 'Show ' + (inside.length - visible.length) + ' more openings';

    var lineCount = inside.reduce(function (n, g) { return n + g.count; }, 0);
    var summary = plural(openings.length, 'opening');
    if (inside.length) summary += ' · ' + plural(lineCount, 'line') + ' inside ' + plural(inside.length, 'other opening');
    $('result-summary').textContent = groups.length ? summary : '';
    $('clear-filters').hidden = !active;
    var none = $('no-results');
    none.hidden = groups.length > 0;
    none.textContent = filters.text
      ? 'Nothing matches "' + filters.text + '" with these filters. Try part of a name, like "dragon", or a move such as "c4".'
      : 'No opening has every label you picked. Remove one to see more.';
    renderContinue();
  }

  function syncFilterButtons() {
    [['f-side', filters.side], ['f-first', filters.first]].forEach(function (pair) {
      Array.prototype.forEach.call($(pair[0]).children, function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.v === pair[1]));
      });
    });
    Array.prototype.forEach.call($('f-tags').children, function (b) {
      b.setAttribute('aria-pressed', String(filters.tags.indexOf(b.dataset.tag) !== -1));
    });
    // "First move" reads from the side the visitor plays.
    $('lbl-first').textContent = filters.side === 'b' ? "Against White's first move" : "White's first move";
  }

  function filtersChanged() {
    showAllGroups = false;
    expanded = {};
    syncFilterButtons();
    renderResults();
  }

  function setupHome() {
    $('intro-stats').innerHTML = '<span><b>' + rep.entries.length.toLocaleString() + '</b> named lines</span>' +
      '<span><b>' + rep.families.length + '</b> openings</span><span><b>Free</b>, no account</span>';

    $('f-tags').innerHTML = TAGS.map(function (t) {
      return '<button class="chip" type="button" data-tag="' + t.key + '" aria-pressed="false" title="' + esc(t.hint) + '">' + esc(t.label) + '</button>';
    }).join('');

    $('search').addEventListener('input', function () { filters.text = this.value.trim(); filtersChanged(); });
    $('f-side').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      filters.side = b.dataset.v; filtersChanged();
    });
    $('f-first').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      filters.first = b.dataset.v; filtersChanged();
    });
    $('f-tags').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var i = filters.tags.indexOf(b.dataset.tag);
      if (i === -1) filters.tags.push(b.dataset.tag); else filters.tags.splice(i, 1);
      filtersChanged();
    });
    $('clear-filters').addEventListener('click', function () {
      filters = { text: '', side: '', first: '', tags: [] };
      $('search').value = '';
      filtersChanged();
    });
    $('more-groups').addEventListener('click', function () { showAllGroups = true; renderResults(); });
    $('line-groups').addEventListener('click', function (e) {
      var b = e.target.closest('[data-expand]'); if (!b) return;
      expanded[b.dataset.expand] = true; renderResults();
    });
    $('view-home').addEventListener('click', function (e) {
      if (e.target.closest('a[href^="#"]')) homeScroll = window.scrollY;
    });
    syncFilterButtons();
  }

  /* ---------- trainer ---------- */

  var ICONS = {
    turn: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    wait: '<svg viewBox="0 0 24 24"><path d="M6 12h.01M12 12h.01M18 12h.01"/></svg>',
    good: '<svg viewBox="0 0 24 24"><path d="M5.5 12.5l4.2 4.2L18.5 8"/></svg>',
    bad: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    hint: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.5 1 2.5h6c0-1 .4-1.9 1-2.5A6 6 0 0 0 12 3z"/></svg>'
  };
  ICONS.done = ICONS.good;

  var game = new Chess();
  var view = new BoardView($('board'), { onMove: onUserMove, animationMs: 220 });
  var T = null; // { entry, lines, side, idx, ply, mistakes, hints, hintLevel, timer, done }

  function lineLabel(line, entry) {
    if (line.main) return 'Core moves';
    if (line.name.indexOf(entry.name) === 0 && line.name.length > entry.name.length) {
      return line.name.slice(entry.name.length).replace(/^[:,]\s*/, '');
    }
    if (line.family === entry.family && line.label) return line.label;
    if (line.name.indexOf(entry.family + ': ') === 0) return line.name.slice(entry.family.length + 2);
    return line.name;
  }

  function openTrainer(entry) {
    var lines = rep.linesFor(entry);
    var side = store.side(entry.id) || entry.side;
    T = { entry: entry, lines: lines, side: side, idx: 0, ply: 0, mistakes: 0, hints: 0, hintLevel: 0, timer: null, done: false };
    // Resume at the first line not learned yet.
    for (var i = 0; i < lines.length; i++) {
      if (store.lineStatus(lines[i].id, side) !== 'learned') { T.idx = i; break; }
    }
    $('t-eco').textContent = entry.eco;
    $('t-tags').innerHTML = tagsHtml(entry).replace(/^<span class="tags">|<\/span>$/g, '');
    $('t-family').textContent = entry.family;
    $('t-variation').textContent = entry.variation || movesText(entry.moves);
    $('t-variation').classList.toggle('is-moves', !entry.variation);
    renderSideButtons();
    renderChildren();
    startLine(T.idx);
  }

  function renderChildren() {
    var kids = rep.childrenOf(T.entry);
    $('children-block').hidden = kids.length === 0;
    $('children').innerHTML = kids.map(function (k) {
      var label = lineLabel({ name: k.name, label: k.variation, family: k.family }, T.entry);
      return '<a class="chip" href="#' + k.id + '" title="' + esc(movesText(k.moves)) + '">' + esc(label) + '</a>';
    }).join('');
  }

  function renderLines() {
    var list = $('lines');
    list.innerHTML = '';
    var learned = 0;
    T.lines.forEach(function (line, i) {
      var st = store.lineStatus(line.id, T.side);
      if (st === 'learned') learned++;
      var li = document.createElement('li');
      var b = document.createElement('button');
      var label = lineLabel(line, T.entry);
      b.type = 'button';
      b.className = 'line' + (i === T.idx ? ' is-current' : '') + (st ? ' is-' + st : '');
      b.innerHTML = '<span class="line-dot" aria-hidden="true"></span><span class="line-name"></span><span class="line-end"></span>';
      b.querySelector('.line-name').textContent = label;
      b.querySelector('.line-end').textContent = plural(Math.ceil(line.moves.length / 2), 'move');
      b.setAttribute('aria-label', label + (st ? ', ' + st : ''));
      if (i === T.idx) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', function () { startLine(i); });
      li.appendChild(b);
      list.appendChild(li);
    });
    $('progress-text').textContent = learned + ' of ' + T.lines.length + ' learned';
    $('progress-bar').style.width = (learned / T.lines.length * 100) + '%';
    var cur = list.children[T.idx];
    if (cur) {
      var top = cur.offsetTop;
      if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - 44) list.scrollTop = Math.max(0, top - 44);
    }
  }

  function setFeedback(kind, title, body) {
    $('feedback').className = 'feedback is-' + kind;
    var icon = $('fb-icon');
    icon.className = 'fb-icon' + (kind === 'good' || kind === 'bad' || kind === 'done' ? ' pop' : '');
    icon.innerHTML = ICONS[kind] || ICONS.turn;
    $('fb-title').textContent = title;
    $('fb-body').textContent = body || '';
  }

  function renderLineMoves() {
    var line = T.lines[T.idx];
    var html = '';
    for (var i = 0; i < line.moves.length; i++) {
      if (i % 2 === 0) html += '<span class="lm-num">' + (i / 2 + 1) + '.</span>';
      var shown = i < T.ply || T.done;
      var cls = 'lm' + (shown ? '' : ' is-hidden') + (i === T.ply - 1 ? ' is-latest' : '') + (i === T.ply && !T.done ? ' is-next' : '');
      html += '<span class="' + cls + '">' + (shown ? esc(line.moves[i]) : '&nbsp;') + '</span>';
    }
    $('line-moves').innerHTML = html;
  }

  function syncBoard() {
    var h = game.history({ verbose: true });
    var last = h[h.length - 1];
    var userTurn = !T.done && game.turn() === T.side && T.ply < T.lines[T.idx].moves.length;
    view.set({
      fen: game.fen(),
      lastMove: last ? [last.from, last.to] : null,
      check: game.inCheck() ? game.kingSquare() : null,
      movable: userTurn ? { color: game.turn(), dests: game.destinations() } : null
    });
    renderLineMoves();
  }

  function startLine(i) {
    clearTimeout(T.timer);
    T.idx = Math.max(0, Math.min(i, T.lines.length - 1));
    T.ply = 0; T.mistakes = 0; T.hints = 0; T.hintLevel = 0; T.done = false;
    game.reset();
    view.setOrientation(T.side);
    view.setMarks({});
    view.clearBadges();
    syncBoard();
    renderLines();
    $('btn-next').disabled = T.idx >= T.lines.length - 1;
    $('btn-next').classList.remove('is-ready');
    $('btn-hint').disabled = false;
    step();
  }

  function step() {
    var line = T.lines[T.idx];
    if (T.ply >= line.moves.length) return finishLine();
    if (game.turn() !== T.side) {
      if (T.ply === 0) setFeedback('wait', 'White moves first', 'Watch the first move.');
      syncBoard();
      T.timer = setTimeout(function () {
        game.move(line.moves[T.ply]);
        T.ply++;
        syncBoard();
        step();
      }, OPPONENT_DELAY);
      return;
    }
    T.hintLevel = 0;
    var moveNo = Math.floor(T.ply / 2) + 1;
    var prev = T.ply > 0 ? line.moves[T.ply - 1] : null;
    setFeedback('turn', 'Your move',
      (prev ? sideName(T.side === 'w' ? 'b' : 'w') + ' played ' + prev + '. ' : '') +
      'Find ' + sideName(T.side) + "'s move " + moveNo + '.');
    syncBoard();
  }

  // Another opening that plays the same moves so far and then this move.
  function otherLineWith(san) {
    var line = T.lines[T.idx];
    var prefix = line.moves.slice(0, T.ply).join(' ');
    for (var i = 0; i < T.lines.length; i++) {
      var o = T.lines[i];
      if (i === T.idx || o.moves.length <= T.ply) continue;
      if (o.moves.slice(0, T.ply).join(' ') === prefix && o.moves[T.ply] === san) return o;
    }
    // Also look at every named opening, so a sound move from elsewhere is not called a blunder.
    // The shortest such opening names the position best.
    var played = line.moves.slice(0, T.ply).concat(san), best = null;
    for (var j = 0; j < rep.entries.length; j++) {
      var e = rep.entries[j];
      if (e.moves.length < played.length || (best && e.moves.length >= best.moves.length)) continue;
      var ok = true;
      for (var k = 0; k < played.length; k++) if (e.moves[k] !== played[k]) { ok = false; break; }
      if (ok) best = e;
    }
    return best ? { name: best.name } : null;
  }

  function onUserMove(from, to, promotion) {
    if (!T || T.done) return false;
    var line = T.lines[T.idx];
    var m = game.move({ from: from, to: to, promotion: promotion });
    if (!m) return false;
    view.clearBadges();
    if (m.san === line.moves[T.ply]) {
      T.ply++;
      store.touch(T.entry.id);
      view.setMarks({});
      view.flashBadge(to, 'good', 750);
      setFeedback('good', 'Correct', m.san + ' is the book move.');
      syncBoard();
      step();
      return true;
    }
    game.undo();
    T.mistakes++;
    view.flashBadge(to, 'bad', 950);
    var other = otherLineWith(m.san);
    if (other) {
      setFeedback('bad', m.san + ' is a different line',
        m.san + ' leads to ' + other.name + '. This line goes another way. Try again.');
    } else {
      setFeedback('bad', 'Not the book move', m.san + ' is not part of this line. Try again, or take a hint.');
    }
    return false;
  }

  function hint() {
    if (!T || T.done || game.turn() !== T.side) return;
    var line = T.lines[T.idx];
    var san = line.moves[T.ply];
    var mv = game.moves({ verbose: true }).filter(function (m) { return m.san === san; })[0];
    if (!mv) return;
    T.hints++;
    var marks = {};
    marks[mv.from] = 'hint';
    if (T.hintLevel === 0) {
      setFeedback('hint', 'Hint', 'Move the ' + OpenFilePieces.names[mv.piece] + ' on the highlighted square.');
      T.hintLevel = 1;
    } else {
      marks[mv.to] = 'hint';
      setFeedback('hint', 'Hint', 'The move is ' + san + '.');
      T.hintLevel = 2;
    }
    view.setMarks(marks);
  }

  function finishLine() {
    T.done = true;
    var line = T.lines[T.idx];
    var clean = T.mistakes === 0 && T.hints === 0;
    store.setLineStatus(line.id, T.side, clean ? 'learned' : 'practiced');
    store.touch(T.entry.id);
    var hasNext = T.idx < T.lines.length - 1;
    if (clean) {
      setFeedback('done', 'Line learned', 'No mistakes and no hints.' + (hasNext ? ' On to the next line.' : ' That was the last line here.'));
    } else {
      var parts = [];
      if (T.mistakes) parts.push(plural(T.mistakes, 'mistake'));
      if (T.hints) parts.push(plural(T.hints, 'hint'));
      setFeedback('done', 'Line complete', 'You finished with ' + parts.join(' and ') + '. Restart it for a clean run to mark it learned.');
    }
    $('btn-hint').disabled = true;
    if (hasNext && clean) $('btn-next').classList.add('is-ready');
    syncBoard();
    renderLines();
  }

  function setSide(side) {
    if (!T || side === T.side) return;
    T.side = side;
    store.setSide(T.entry.id, side);
    renderSideButtons();
    startLine(T.idx);
  }

  function renderSideButtons() {
    $('side-w').setAttribute('aria-pressed', String(T.side === 'w'));
    $('side-b').setAttribute('aria-pressed', String(T.side === 'b'));
  }

  $('side-w').addEventListener('click', function () { setSide('w'); });
  $('side-b').addEventListener('click', function () { setSide('b'); });
  $('btn-hint').addEventListener('click', hint);
  $('btn-restart').addEventListener('click', function () { if (T) startLine(T.idx); });
  $('btn-next').addEventListener('click', function () { if (T) startLine(T.idx + 1); });

  document.addEventListener('keydown', function (e) {
    if (!T || $('view-train').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    var k = e.key.toLowerCase();
    if (k === 'h') hint();
    else if (k === 'r') startLine(T.idx);
    else if (k === 'n' && T.idx < T.lines.length - 1) startLine(T.idx + 1);
  });

  /* ---------- routing ---------- */

  function route() {
    var id = decodeURIComponent(location.hash.replace(/^#/, ''));
    var entry = id ? rep.byId(id) : null;
    $('view-home').hidden = !!entry;
    $('view-train').hidden = !entry;
    if (T) clearTimeout(T.timer);
    if (entry) {
      openTrainer(entry);
      document.title = entry.name + ' · Open File';
      window.scrollTo(0, 0);
    } else {
      T = null;
      document.title = 'Open File Chess';
      renderResults();
      window.scrollTo(0, homeScroll);
    }
  }

  setupHome();
  window.addEventListener('hashchange', route);
  route();

  window.openFile = { game: game, view: view, rep: rep, state: function () { return T; } };
})();
