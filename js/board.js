/*
 * Open File board view: draws a position, animates changes between positions,
 * and turns clicks and drags into move requests.
 *
 * The view knows nothing about chess rules. A controller (app.js today, an
 * opening trainer later) tells it what to show:
 *
 *   var view = new BoardView(element, { onMove: function (from, to, promo) {...} });
 *   view.set({
 *     fen: 'rnbqkbnr/...',            // placement field is enough
 *     lastMove: ['e2', 'e4'],         // or null
 *     check: 'e8',                    // king square in check, or null
 *     movable: { color: 'w', dests: { e2: ['e3', 'e4'] } }  // or null
 *   });
 *   view.setOrientation('b'); view.flip();
 *   view.setMarks({ d4: 'good', e5: 'hint' })  // extra square tints for training
 *
 * onMove(from, to, promotion) returns true when the controller accepted the
 * move. Returning false makes the piece slide back.
 */
(function (root) {
  'use strict';

  var FILES = 'abcdefgh';
  var PROMO_ORDER = ['q', 'n', 'r', 'b'];

  function parsePlacement(fen) {
    var out = {};
    var rows = fen.split(' ')[0].split('/');
    for (var r = 0; r < 8; r++) {
      var f = 0;
      for (var i = 0; i < rows[r].length; i++) {
        var ch = rows[r][i];
        if (/\d/.test(ch)) f += Number(ch);
        else { out[FILES[f] + (8 - r)] = ch; f++; }
      }
    }
    return out;
  }

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function prefersReducedMotion() {
    return root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function BoardView(container, opts) {
    opts = opts || {};
    this.container = container;
    this.orientation = opts.orientation || 'w';
    this.onMove = opts.onMove || function () { return false; };
    this.animationMs = opts.animationMs != null ? opts.animationMs : 200;
    this.pieces = [];          // { el, piece, sq }
    this.position = {};        // sq -> piece letter
    this.movable = null;
    this.lastMove = null;
    this.check = null;
    this.marks = {};
    this.selected = null;
    this.drag = null;
    this.promoPending = null;
    this._build();
    this._bind();
  }
  var P = BoardView.prototype;

  P._build = function () {
    var root = this.container;
    root.classList.add('board');
    root.setAttribute('role', 'grid');
    root.setAttribute('aria-label', 'Chess board');
    root.style.setProperty('--anim', (prefersReducedMotion() ? 0 : this.animationMs) + 'ms');
    this.squaresEl = el('div', 'board-squares', root);
    this.piecesEl = el('div', 'board-pieces', root);
    this.promoEl = el('div', 'board-promo', root);
    this.promoEl.hidden = true;
    this.squareEls = {};
    for (var r = 8; r >= 1; r--) {
      for (var f = 0; f < 8; f++) {
        var name = FILES[f] + r;
        var sq = el('div', 'sq ' + ((f + r) % 2 === 0 ? 'sq-dark' : 'sq-light'), this.squaresEl);
        sq.dataset.sq = name;
        this.squareEls[name] = sq;
      }
    }
    this._layoutSquares();
  };

  // Grid position of a square for the current orientation: x and y from the top-left.
  P._xy = function (sq) {
    var f = FILES.indexOf(sq[0]), r = Number(sq[1]);
    return this.orientation === 'w' ? [f, 8 - r] : [7 - f, r - 1];
  };

  P._layoutSquares = function () {
    for (var name in this.squareEls) {
      var xy = this._xy(name), sq = this.squareEls[name];
      sq.style.gridColumn = String(xy[0] + 1);
      sq.style.gridRow = String(xy[1] + 1);
      var label = '';
      if (xy[0] === 0) label += '<span class="coord coord-rank">' + name[1] + '</span>';
      if (xy[1] === 7) label += '<span class="coord coord-file">' + name[0] + '</span>';
      sq.innerHTML = label;
    }
  };

  P._place = function (p, animate) {
    var xy = this._xy(p.sq);
    p.el.classList.toggle('anim', !!animate);
    p.el.style.transform = 'translate(' + (xy[0] * 100) + '%,' + (xy[1] * 100) + '%)';
  };

  P._createPiece = function (piece, sq) {
    var e = el('div', 'piece', this.piecesEl);
    e.innerHTML = root.OpenFilePieces.svg(piece);
    var p = { el: e, piece: piece, sq: sq };
    this._place(p, false);
    return p;
  };

  /* ---------- public API ---------- */

  P.set = function (state) {
    if (state.fen != null) this._setPosition(state.fen, state.animate !== false);
    if ('lastMove' in state) this.lastMove = state.lastMove;
    if ('check' in state) this.check = state.check;
    if ('movable' in state) this.movable = state.movable;
    this.selected = null;
    this._closePromo(false);
    this._renderHighlights();
  };

  P.setOrientation = function (color) {
    if (color === this.orientation) return;
    this.orientation = color;
    this._layoutSquares();
    var self = this;
    this.pieces.forEach(function (p) { self._place(p, true); });
    this._closePromo(false);
    this._renderHighlights();
  };

  P.flip = function () { this.setOrientation(this.orientation === 'w' ? 'b' : 'w'); };

  P.setMarks = function (marks) { this.marks = marks || {}; this._renderHighlights(); };

  /* ---------- position diff and animation ---------- */

  P._setPosition = function (fen, animate) {
    var target = parsePlacement(fen);
    var old = this.pieces, used = [], next = [], pending = [], sq, i;
    var self = this;

    // 1. Pieces that did not move stay put.
    for (sq in target) {
      var stay = null;
      for (i = 0; i < old.length; i++) {
        if (used.indexOf(old[i]) === -1 && old[i].sq === sq && old[i].piece === target[sq]) { stay = old[i]; break; }
      }
      if (stay) { used.push(stay); next.push(stay); } else pending.push(sq);
    }

    // 2. Each new square takes the nearest leftover piece of the same kind, which slides over.
    var arrivals = [];
    pending.forEach(function (sq) {
      var best = null, bestD = Infinity, a = self._xy(sq);
      old.forEach(function (o) {
        if (used.indexOf(o) !== -1 || o.piece !== target[sq]) return;
        var b = self._xy(o.sq), d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        if (d < bestD) { bestD = d; best = o; }
      });
      if (best) {
        used.push(best);
        best.sq = sq;
        arrivals.push(best);
        next.push(best);
      } else {
        var created = self._createPiece(target[sq], sq);
        if (animate) {
          created.el.classList.add('appear');
          created.el.addEventListener('animationend', function () { created.el.classList.remove('appear'); }, { once: true });
        }
        next.push(created);
      }
    });
    arrivals.forEach(function (p) {
      p.el.classList.add('moving');
      self._place(p, animate);
      setTimeout(function () { p.el.classList.remove('moving'); }, animate ? self.animationMs + 30 : 0);
    });

    // 3. Leftover pieces were captured or removed: fade them out.
    old.forEach(function (o) {
      if (used.indexOf(o) !== -1) return;
      if (!animate || prefersReducedMotion()) { o.el.remove(); return; }
      o.el.classList.add('leaving');
      setTimeout(function () { o.el.remove(); }, self.animationMs + 60);
    });

    this.pieces = next;
    this.position = target;
  };

  /* ---------- highlights ---------- */

  P._dests = function (from) {
    return (this.movable && this.movable.dests && this.movable.dests[from]) || [];
  };

  P._renderHighlights = function () {
    var dests = this.selected ? this._dests(this.selected) : [];
    var hover = this.drag && this.drag.active ? this.drag.over : null;
    for (var name in this.squareEls) {
      var c = this.squareEls[name].classList;
      c.toggle('is-last', !!(this.lastMove && this.lastMove.indexOf(name) !== -1));
      c.toggle('is-selected', name === this.selected);
      c.toggle('is-dest', dests.indexOf(name) !== -1 && !this.position[name]);
      c.toggle('is-capture', dests.indexOf(name) !== -1 && !!this.position[name]);
      c.toggle('is-check', name === this.check);
      c.toggle('is-hover', name === hover && dests.indexOf(name) !== -1);
      c.toggle('mark-good', this.marks[name] === 'good');
      c.toggle('mark-bad', this.marks[name] === 'bad');
      c.toggle('mark-hint', this.marks[name] === 'hint');
    }
    this.container.classList.toggle('is-movable', !!this.movable);
  };

  /* ---------- input ---------- */

  P._squareAt = function (clientX, clientY) {
    var rect = this.container.getBoundingClientRect();
    var x = Math.floor((clientX - rect.left) / rect.width * 8);
    var y = Math.floor((clientY - rect.top) / rect.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    var f = this.orientation === 'w' ? x : 7 - x;
    var r = this.orientation === 'w' ? 8 - y : y + 1;
    return FILES[f] + r;
  };

  P._pieceOn = function (sq) {
    for (var i = 0; i < this.pieces.length; i++) if (this.pieces[i].sq === sq) return this.pieces[i];
    return null;
  };

  P._canPick = function (sq) {
    var p = this.position[sq];
    if (!p || !this.movable) return false;
    var color = p === p.toUpperCase() ? 'w' : 'b';
    return color === this.movable.color && this._dests(sq).length > 0;
  };

  P._bind = function () {
    var self = this;
    this.container.addEventListener('pointerdown', function (e) { self._down(e); });
    root.addEventListener('pointermove', function (e) { self._moveDrag(e); });
    root.addEventListener('pointerup', function (e) { self._up(e); });
    root.addEventListener('pointercancel', function () { self._cancelDrag(); });
    this.container.addEventListener('contextmenu', function (e) { if (self.drag) e.preventDefault(); });
  };

  P._down = function (e) {
    if (e.button !== 0 || this.promoPending) return;
    var sq = this._squareAt(e.clientX, e.clientY);
    if (!sq) return;
    e.preventDefault();

    if (this.selected && this._dests(this.selected).indexOf(sq) !== -1) {
      this._tryMove(this.selected, sq);
      return;
    }
    if (this._canPick(sq)) {
      var wasSelected = this.selected === sq;
      this.selected = sq;
      var piece = this._pieceOn(sq);
      this.drag = { from: sq, piece: piece, startX: e.clientX, startY: e.clientY, active: false, over: sq, wasSelected: wasSelected };
      this._renderHighlights();
      return;
    }
    this.selected = null;
    this._renderHighlights();
  };

  P._moveDrag = function (e) {
    var d = this.drag;
    if (!d || !d.piece) return;
    if (!d.active) {
      if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 5) return;
      d.active = true;
      d.piece.el.classList.remove('anim');
      d.piece.el.classList.add('dragging');
    }
    var rect = this.container.getBoundingClientRect();
    var size = rect.width / 8;
    var x = (e.clientX - rect.left) / size - 0.5;
    var y = (e.clientY - rect.top) / size - 0.5;
    d.piece.el.style.transform = 'translate(' + (x * 100) + '%,' + (y * 100) + '%)';
    var over = this._squareAt(e.clientX, e.clientY);
    if (over !== d.over) { d.over = over; this._renderHighlights(); }
  };

  P._up = function (e) {
    var d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.piece) d.piece.el.classList.remove('dragging');
    if (d.active) {
      var to = this._squareAt(e.clientX, e.clientY);
      if (to && to !== d.from && this._dests(d.from).indexOf(to) !== -1) {
        this._tryMove(d.from, to);
        return;
      }
      if (d.piece) this._place(d.piece, true);
      this._renderHighlights();
      return;
    }
    // A plain click on the piece that was already selected deselects it.
    if (d.wasSelected) { this.selected = null; this._renderHighlights(); }
  };

  P._cancelDrag = function () {
    var d = this.drag;
    this.drag = null;
    if (d && d.piece) { d.piece.el.classList.remove('dragging'); this._place(d.piece, true); }
    this._renderHighlights();
  };

  P._isPromotion = function (from, to) {
    var p = this.position[from];
    if (!p || p.toLowerCase() !== 'p') return false;
    return (p === 'P' && to[1] === '8') || (p === 'p' && to[1] === '1');
  };

  P._tryMove = function (from, to) {
    var self = this;
    if (this._isPromotion(from, to)) {
      this._openPromo(from, to);
      return;
    }
    this._commit(from, to, undefined);
  };

  P._commit = function (from, to, promotion) {
    this.selected = null;
    var ok = this.onMove(from, to, promotion);
    if (!ok) {
      var p = this._pieceOn(from);
      if (p) this._place(p, true);
      this._renderHighlights();
    }
  };

  /* ---------- promotion picker ---------- */

  P._openPromo = function (from, to) {
    var self = this;
    var white = this.position[from] === 'P';
    var xy = this._xy(to);
    var fromTop = xy[1] === 0;
    // Show the pawn standing on the promotion square while the player chooses.
    var pawn = this._pieceOn(from);
    if (pawn) {
      pawn.el.classList.add('anim');
      pawn.el.style.transform = 'translate(' + (xy[0] * 100) + '%,' + (xy[1] * 100) + '%)';
    }
    this.promoPending = { from: from, to: to };
    var box = this.promoEl;
    box.innerHTML = '';
    var col = el('div', 'promo-col', box);
    col.style.left = (xy[0] * 12.5) + '%';
    col.style.top = fromTop ? '0' : '50%';
    col.style.flexDirection = fromTop ? 'column' : 'column-reverse';
    PROMO_ORDER.forEach(function (t) {
      var letter = white ? t.toUpperCase() : t;
      var b = el('button', 'promo-btn', col);
      b.type = 'button';
      b.setAttribute('aria-label', 'Promote to ' + root.OpenFilePieces.names[t]);
      b.innerHTML = root.OpenFilePieces.svg(letter);
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        self._closePromo(false);
        self._commit(from, to, t);
      });
    });
    box.onpointerdown = function (e) { e.stopPropagation(); self._closePromo(true); };
    box.hidden = false;
    var first = col.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  };

  P._closePromo = function (cancelled) {
    if (!this.promoPending) return;
    var from = this.promoPending.from;
    this.promoPending = null;
    this.promoEl.hidden = true;
    this.promoEl.innerHTML = '';
    if (cancelled) {
      var p = this._pieceOn(from);
      if (p) this._place(p, true);
      this.selected = null;
      this._renderHighlights();
    }
  };

  root.BoardView = BoardView;
})(typeof window !== 'undefined' ? window : globalThis);
