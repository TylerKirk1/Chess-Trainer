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
  var rep = new Repertoire(window.OPENINGS);
  var families = rep.families();
  var OPPONENT_DELAY = 450;

  var STARTERS = [
    'Italian Game: Giuoco Piano', 'Ruy Lopez: Morphy Defense', 'Scotch Game', 'Vienna Game',
    "Queen's Gambit Declined", "Queen's Gambit Accepted", 'Slav Defense', 'London System',
    'Sicilian Defense: Najdorf Variation', 'Sicilian Defense: Dragon Variation', 'French Defense',
    'Caro-Kann Defense', 'Scandinavian Defense', "King's Indian Defense", 'Nimzo-Indian Defense', 'English Opening'
  ];

  /* ---------- saved progress (this browser only) ---------- */

  var store = (function () {
    var KEY = 'openfile:v1';
    var data = { lines: {}, side: {} };
    try { data = Object.assign(data, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
    function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
    return {
      lineStatus: function (lineId, side) { return data.lines[side + '|' + lineId] || null; },
      setLineStatus: function (lineId, side, status) {
        var k = side + '|' + lineId;
        if (data.lines[k] === 'learned') return; // a clean run is never undone
        data.lines[k] = status; save();
      },
      side: function (openingId) { return data.side[openingId] || null; },
      setSide: function (openingId, side) { data.side[openingId] = side; save(); }
    };
  })();

  /* ---------- picker ---------- */

  function movesText(moves, max) {
    var out = [];
    for (var i = 0; i < moves.length && i < (max || 99); i++) out.push((i % 2 === 0 ? (i / 2 + 1) + '.' : '') + moves[i]);
    if (max && moves.length > max) out.push('…');
    return out.join(' ');
  }

  function entryRow(e, label) {
    var a = document.createElement('a');
    a.className = 'entry';
    a.href = '#' + e.id;
    a.innerHTML = '<span class="entry-name"></span><span class="entry-eco"></span><span class="entry-moves"></span>';
    a.children[0].textContent = label || e.name;
    a.children[1].textContent = e.eco;
    a.children[2].textContent = movesText(e.moves, 10);
    return a;
  }

  function renderHome() {
    var starters = $('starters');
    STARTERS.forEach(function (name) {
      var e = rep.entries.filter(function (x) { return x.name === name; })[0];
      if (!e) return;
      var card = document.createElement('a');
      card.className = 'starter';
      card.href = '#' + e.id;
      var side = Repertoire.defaultSide(e);
      card.innerHTML = '<span class="starter-side"><span class="turn-chip ' + side + '"></span></span>' +
        '<span class="starter-name"></span><span class="starter-moves"></span><span class="starter-count"></span>';
      card.querySelector('.starter-name').textContent = e.name.replace(':', ': ');
      card.querySelector('.starter-moves').textContent = movesText(e.moves, 8);
      card.querySelector('.starter-count').textContent = rep.linesFor(e).length + ' lines · play as ' + (side === 'w' ? 'White' : 'Black');
      starters.appendChild(card);
    });

    $('total-count').textContent = rep.entries.length.toLocaleString() + ' named lines in ' + families.length + ' families';
    var list = $('families');
    families.forEach(function (f) {
      var d = document.createElement('details');
      d.className = 'family';
      var s = document.createElement('summary');
      s.innerHTML = '<span class="family-name"></span><span class="family-count"></span>';
      s.children[0].textContent = f.name;
      s.children[1].textContent = f.entries.length;
      d.appendChild(s);
      d.addEventListener('toggle', function () {
        if (!d.open || d.dataset.filled) return;
        d.dataset.filled = '1';
        var box = document.createElement('div');
        box.className = 'family-entries';
        f.entries.forEach(function (e) { box.appendChild(entryRow(e, e.variation || 'Main position')); });
        d.appendChild(box);
      });
      list.appendChild(d);
    });

    var search = $('search');
    search.addEventListener('input', function () {
      var q = search.value.trim();
      var box = $('search-results');
      box.innerHTML = '';
      $('home-browse').hidden = !!q;
      box.hidden = !q;
      if (!q) return;
      var found = rep.search(q, 80);
      if (!found.length) {
        var p = document.createElement('p');
        p.className = 'empty';
        p.textContent = 'No opening matches "' + q + '". Try part of the name, like "dragon", or a move such as "c4".';
        box.appendChild(p);
        return;
      }
      found.forEach(function (e) { box.appendChild(entryRow(e)); });
    });
  }

  /* ---------- trainer ---------- */

  var game = new Chess();
  var view = new BoardView($('board'), { onMove: onUserMove, animationMs: 220 });
  var T = null; // { entry, lines, side, idx, ply, mistakes, hints, timer, done }
  var flashTimer = null;

  function lineLabel(line, entry) {
    if (line.main) return 'Core moves';
    var name = line.name;
    if (name.indexOf(entry.name) === 0 && name.length > entry.name.length) name = name.slice(entry.name.length).replace(/^[:,]\s*/, '');
    else if (name.indexOf(entry.family + ': ') === 0) name = name.slice(entry.family.length + 2);
    return name;
  }

  function openTrainer(entry) {
    var lines = rep.linesFor(entry);
    var side = store.side(entry.id) || Repertoire.defaultSide(entry);
    T = { entry: entry, lines: lines, side: side, idx: 0, ply: 0, mistakes: 0, hints: 0, hintLevel: 0, timer: null, done: false };
    // Resume at the first line not learned yet.
    for (var i = 0; i < lines.length; i++) {
      if (store.lineStatus(lines[i].id, side) !== 'learned') { T.idx = i; break; }
    }
    $('t-eco').textContent = entry.eco;
    $('t-family').textContent = entry.family;
    $('t-variation').textContent = entry.variation || movesText(entry.moves);
    $('t-variation').classList.toggle('is-moves', !entry.variation);
    renderChildren();
    renderLines();
    startLine(T.idx);
  }

  function renderChildren() {
    var kids = rep.childrenOf(T.entry);
    $('children-block').hidden = kids.length === 0;
    var box = $('children');
    box.innerHTML = '';
    kids.forEach(function (k) {
      var a = document.createElement('a');
      a.className = 'chip';
      a.href = '#' + k.id;
      a.textContent = lineLabel({ name: k.name }, T.entry);
      a.title = movesText(k.moves);
      box.appendChild(a);
    });
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
      b.type = 'button';
      b.className = 'line' + (i === T.idx ? ' is-current' : '') + (st ? ' is-' + st : '');
      b.innerHTML = '<span class="line-dot" aria-hidden="true"></span><span class="line-name"></span><span class="line-end"></span>';
      b.querySelector('.line-name').textContent = lineLabel(line, T.entry);
      b.querySelector('.line-end').textContent = movesText(line.moves).split(' ').slice(-2).join(' ');
      b.setAttribute('aria-label', lineLabel(line, T.entry) + (st ? ', ' + st : ''));
      b.addEventListener('click', function () { startLine(i); });
      li.appendChild(b);
      list.appendChild(li);
    });
    $('progress-text').textContent = learned + ' of ' + T.lines.length + ' learned';
    $('progress-bar').style.width = (learned / T.lines.length * 100) + '%';
    var cur = list.children[T.idx];
    if (cur && cur.scrollIntoView) {
      var wrap = list;
      var top = cur.offsetTop;
      if (top < wrap.scrollTop || top > wrap.scrollTop + wrap.clientHeight - 40) wrap.scrollTop = top - 40;
    }
  }

  function setFeedback(kind, title, body) {
    var fb = $('feedback');
    fb.className = 'feedback' + (kind ? ' is-' + kind : '');
    $('fb-title').textContent = title;
    $('fb-body').textContent = body || '';
  }

  function renderLineMoves() {
    var line = T.lines[T.idx];
    var box = $('line-moves');
    box.innerHTML = '';
    for (var i = 0; i < line.moves.length; i++) {
      var span = document.createElement('span');
      if (i % 2 === 0) {
        var n = document.createElement('span');
        n.className = 'lm-num';
        n.textContent = (i / 2 + 1) + '.';
        box.appendChild(n);
      }
      span.className = 'lm' + (i < T.ply ? ' is-played' : ' is-hidden') + (i === T.ply - 1 ? ' is-latest' : '');
      span.textContent = i < T.ply || T.done ? line.moves[i] : '?';
      box.appendChild(span);
    }
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
    syncBoard();
    renderLines();
    $('btn-next').disabled = T.idx >= T.lines.length - 1;
    step();
  }

  function sideName(c) { return c === 'w' ? 'White' : 'Black'; }

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

  function flash(marks, ms) {
    clearTimeout(flashTimer);
    view.setMarks(marks);
    flashTimer = setTimeout(function () { view.setMarks({}); }, ms || 700);
  }

  // Another line in this set that plays the same moves so far and then this move.
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
    return best ? { name: best.name, outside: true } : null;
  }

  function onUserMove(from, to, promotion) {
    if (!T || T.done) return false;
    var line = T.lines[T.idx];
    var m = game.move({ from: from, to: to, promotion: promotion });
    if (!m) return false;
    if (m.san === line.moves[T.ply]) {
      T.ply++;
      var marks = {}; marks[to] = 'good';
      flash(marks, 600);
      setFeedback('good', 'Correct', m.san + ' is the book move.');
      syncBoard();
      step();
      return true;
    }
    game.undo();
    T.mistakes++;
    var marks2 = {}; marks2[to] = 'bad';
    flash(marks2, 800);
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
    clearTimeout(flashTimer);
    var marks = {};
    if (T.hintLevel === 0) {
      marks[mv.from] = 'hint';
      setFeedback('turn', 'Hint', 'Move the ' + OpenFilePieces.names[mv.piece] + ' on the highlighted square.');
      T.hintLevel = 1;
    } else {
      marks[mv.from] = 'hint'; marks[mv.to] = 'hint';
      setFeedback('turn', 'Hint', 'The move is ' + san + '.');
      T.hintLevel = 2;
    }
    view.setMarks(marks);
  }

  function finishLine() {
    T.done = true;
    var line = T.lines[T.idx];
    var clean = T.mistakes === 0 && T.hints === 0;
    store.setLineStatus(line.id, T.side, clean ? 'learned' : 'practiced');
    var hasNext = T.idx < T.lines.length - 1;
    if (clean) {
      setFeedback('done', 'Line learned', 'No mistakes and no hints.' + (hasNext ? ' On to the next line.' : ' That was the last line here.'));
    } else {
      var parts = [];
      if (T.mistakes) parts.push(T.mistakes + (T.mistakes === 1 ? ' mistake' : ' mistakes'));
      if (T.hints) parts.push(T.hints + (T.hints === 1 ? ' hint' : ' hints'));
      setFeedback('done', 'Line complete', 'You finished with ' + parts.join(' and ') + '. Restart it for a clean run to mark it learned.');
    }
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
      renderSideButtons();
      document.title = entry.name + ' · Open File';
      window.scrollTo(0, 0);
    } else {
      T = null;
      document.title = 'Open File Chess';
    }
  }

  renderHome();
  window.addEventListener('hashchange', route);
  route();

  window.openFile = { game: game, view: view, rep: rep, state: function () { return T; } };
})();
