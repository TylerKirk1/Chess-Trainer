/*
 * Open File chess engine: board state, legal move generation and game rules.
 *
 * No dependencies and no DOM access, so it runs in the browser and in Node.
 * Squares are named "a1".."h8" in the public API. Internally the board is an
 * array of 64 cells in FEN order: index 0 is a8, 7 is h8, 56 is a1, 63 is h1.
 * Pieces are FEN letters: uppercase is White ("P N B R Q K"), lowercase Black.
 *
 * Public API (shaped so opening training can build on it later):
 *   new Chess(fen?)           start position when fen is omitted
 *   load(fen) / fen() / reset()
 *   moves({ square, verbose })  legal moves, SAN strings or move objects
 *   move("Nf3" | "g1f3" | { from, to, promotion })  returns move or null
 *   undo()                    takes back one ply, returns the move or null
 *   history({ verbose })      moves played since the position was loaded
 *   get(square) / board() / turn() / pgn()
 *   inCheck() isCheckmate() isStalemate() isDraw() isGameOver()
 *   isInsufficientMaterial() isThreefoldRepetition() isFiftyMoveRule()
 *   kingSquare(color)
 */
(function (root) {
  'use strict';

  var FILES = 'abcdefgh';
  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  var KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  var DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  var ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var ALL = DIAG.concat(ORTHO);
  // Castling rights are lost when anything moves from or to these corners.
  var CORNER_RIGHTS = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };

  function fileOf(i) { return i & 7; }
  function rowOf(i) { return i >> 3; } // row 0 is rank 8
  function at(f, r) { return (f < 0 || f > 7 || r < 0 || r > 7) ? -1 : r * 8 + f; }
  function nameOf(i) { return FILES[i & 7] + (8 - (i >> 3)); }
  function indexOf(s) {
    if (typeof s !== 'string' || !/^[a-h][1-8]$/.test(s)) return -1;
    return (8 - Number(s[1])) * 8 + FILES.indexOf(s[0]);
  }
  function colorOf(p) { return p === p.toUpperCase() ? 'w' : 'b'; }
  function typeOf(p) { return p.toLowerCase(); }
  function other(c) { return c === 'w' ? 'b' : 'w'; }
  function has(flags, f) { return flags.indexOf(f) !== -1; }

  function validateFen(fen) {
    if (typeof fen !== 'string') return 'not a string';
    var parts = fen.trim().split(/\s+/);
    if (parts.length !== 6 && parts.length !== 4) return 'expected 4 or 6 fields';
    var rows = parts[0].split('/');
    if (rows.length !== 8) return 'expected 8 ranks';
    for (var r = 0; r < 8; r++) {
      var count = 0;
      for (var c = 0; c < rows[r].length; c++) {
        var ch = rows[r][c];
        if (/[1-8]/.test(ch)) count += Number(ch);
        else if (/[pnbrqkPNBRQK]/.test(ch)) count += 1;
        else return 'bad character "' + ch + '"';
      }
      if (count !== 8) return 'rank ' + (8 - r) + ' does not have 8 squares';
    }
    if (!/^[wb]$/.test(parts[1])) return 'side to move must be w or b';
    if (!/^(-|K?Q?k?q?)$/.test(parts[2]) || parts[2] === '') return 'bad castling field';
    if (!/^(-|[a-h][36])$/.test(parts[3])) return 'bad en passant field';
    if (parts.length === 6 && (!/^\d+$/.test(parts[4]) || !/^[1-9]\d*$/.test(parts[5]))) return 'bad move counters';
    if ((parts[0].match(/K/g) || []).length !== 1 || (parts[0].match(/k/g) || []).length !== 1) return 'each side needs exactly one king';
    return null;
  }

  function Chess(fen) { this.load(fen || START_FEN); }
  Chess.START_FEN = START_FEN;
  Chess.validateFen = validateFen;
  var P = Chess.prototype;

  /* ---------- loading and exporting ---------- */

  P.load = function (fen) {
    var err = validateFen(fen);
    if (err) throw new Error('Invalid FEN (' + err + '): ' + fen);
    var parts = fen.trim().split(/\s+/);
    var board = new Array(64).fill(null);
    var rows = parts[0].split('/');
    for (var r = 0; r < 8; r++) {
      var f = 0;
      for (var c = 0; c < rows[r].length; c++) {
        var ch = rows[r][c];
        if (/\d/.test(ch)) f += Number(ch);
        else { board[r * 8 + f] = ch; f++; }
      }
    }
    var cr = parts[2];
    this._board = board;
    this._turn = parts[1];
    this._castling = { K: cr.indexOf('K') !== -1, Q: cr.indexOf('Q') !== -1, k: cr.indexOf('k') !== -1, q: cr.indexOf('q') !== -1 };
    this._ep = parts[3] === '-' ? -1 : indexOf(parts[3]);
    this._half = parts.length === 6 ? Number(parts[4]) : 0;
    this._full = parts.length === 6 ? Number(parts[5]) : 1;
    this._history = [];
    this._keys = [this._positionKey()];
    this._startFen = this.fen();
    return true;
  };

  P.reset = function () { return this.load(START_FEN); };

  P._placement = function () {
    var out = '';
    for (var r = 0; r < 8; r++) {
      var empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = this._board[r * 8 + f];
        if (!p) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        out += p;
      }
      if (empty) out += empty;
      if (r < 7) out += '/';
    }
    return out;
  };

  P._castlingString = function () {
    var c = this._castling;
    var s = (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '');
    return s || '-';
  };

  P.fen = function () {
    return [this._placement(), this._turn, this._castlingString(),
      this._ep === -1 ? '-' : nameOf(this._ep), this._half, this._full].join(' ');
  };

  // Identity of a position for repetition: placement, side, castling, and the
  // en passant square only when a pawn could actually capture there.
  P._positionKey = function () {
    var ep = '-';
    if (this._ep !== -1) {
      var pawn = this._turn === 'w' ? 'P' : 'p';
      var r = rowOf(this._ep) + (this._turn === 'w' ? 1 : -1);
      var f = fileOf(this._ep);
      if (this._board[at(f - 1, r)] === pawn || this._board[at(f + 1, r)] === pawn) ep = nameOf(this._ep);
    }
    return this._placement() + ' ' + this._turn + ' ' + this._castlingString() + ' ' + ep;
  };

  /* ---------- attacks ---------- */

  P._attacked = function (sq, by) {
    var b = this._board, f = fileOf(sq), r = rowOf(sq), t, o, i;
    var pawnRow = by === 'w' ? r + 1 : r - 1;
    var pawn = by === 'w' ? 'P' : 'p';
    if (b[at(f - 1, pawnRow)] === pawn || b[at(f + 1, pawnRow)] === pawn) return true;
    var knight = by === 'w' ? 'N' : 'n';
    for (i = 0; i < 8; i++) { o = KNIGHT[i]; t = at(f + o[0], r + o[1]); if (t >= 0 && b[t] === knight) return true; }
    var king = by === 'w' ? 'K' : 'k';
    for (i = 0; i < 8; i++) { o = ALL[i]; t = at(f + o[0], r + o[1]); if (t >= 0 && b[t] === king) return true; }
    for (i = 0; i < 8; i++) {
      o = ALL[i];
      var diag = o[0] !== 0 && o[1] !== 0;
      var ff = f + o[0], rr = r + o[1];
      while ((t = at(ff, rr)) >= 0) {
        var p = b[t];
        if (p) {
          if (colorOf(p) === by) {
            var ty = typeOf(p);
            if (ty === 'q' || (diag ? ty === 'b' : ty === 'r')) return true;
          }
          break;
        }
        ff += o[0]; rr += o[1];
      }
    }
    return false;
  };

  P._kingIndex = function (color) {
    var k = color === 'w' ? 'K' : 'k';
    return this._board.indexOf(k);
  };

  P.kingSquare = function (color) {
    var i = this._kingIndex(color || this._turn);
    return i === -1 ? null : nameOf(i);
  };

  P.inCheck = function () {
    var k = this._kingIndex(this._turn);
    return k !== -1 && this._attacked(k, other(this._turn));
  };

  /* ---------- move generation ---------- */

  function mk(from, to, piece, captured, flags, promotion) {
    return { from: from, to: to, piece: piece, captured: captured || null, flags: flags, promotion: promotion || null };
  }

  P._pseudo = function () {
    var b = this._board, us = this._turn, them = other(us), moves = [];
    var sq, i, o, t;
    for (sq = 0; sq < 64; sq++) {
      var p = b[sq];
      if (!p || colorOf(p) !== us) continue;
      var ty = typeOf(p), f = fileOf(sq), r = rowOf(sq);

      if (ty === 'p') {
        var dir = us === 'w' ? -1 : 1;
        var startRow = us === 'w' ? 6 : 1;
        var lastRow = us === 'w' ? 0 : 7;
        var addPawn = function (from, to, captured, flags) {
          if (rowOf(to) === lastRow) {
            ['q', 'r', 'b', 'n'].forEach(function (pr) { moves.push(mk(from, to, p, captured, flags + 'p', pr)); });
          } else {
            moves.push(mk(from, to, p, captured, flags));
          }
        };
        var one = at(f, r + dir);
        if (one >= 0 && !b[one]) {
          addPawn(sq, one, null, 'n');
          var two = at(f, r + 2 * dir);
          if (r === startRow && !b[two]) moves.push(mk(sq, two, p, null, 'b'));
        }
        for (i = -1; i <= 1; i += 2) {
          t = at(f + i, r + dir);
          if (t < 0) continue;
          if (b[t] && colorOf(b[t]) === them) addPawn(sq, t, b[t], 'c');
          else if (t === this._ep) moves.push(mk(sq, t, p, us === 'w' ? 'p' : 'P', 'e'));
        }
        continue;
      }

      if (ty === 'n' || ty === 'k') {
        var steps = ty === 'n' ? KNIGHT : ALL;
        for (i = 0; i < 8; i++) {
          o = steps[i];
          t = at(f + o[0], r + o[1]);
          if (t < 0) continue;
          if (!b[t]) moves.push(mk(sq, t, p, null, 'n'));
          else if (colorOf(b[t]) === them) moves.push(mk(sq, t, p, b[t], 'c'));
        }
        if (ty === 'k') this._castles(sq, p, moves);
        continue;
      }

      var dirs = ty === 'b' ? DIAG : ty === 'r' ? ORTHO : ALL;
      for (i = 0; i < dirs.length; i++) {
        o = dirs[i];
        var ff = f + o[0], rr = r + o[1];
        while ((t = at(ff, rr)) >= 0) {
          if (!b[t]) moves.push(mk(sq, t, p, null, 'n'));
          else {
            if (colorOf(b[t]) === them) moves.push(mk(sq, t, p, b[t], 'c'));
            break;
          }
          ff += o[0]; rr += o[1];
        }
      }
    }
    return moves;
  };

  P._castles = function (sq, king, moves) {
    var us = this._turn, them = other(us), b = this._board, c = this._castling;
    var home = us === 'w' ? 60 : 4;
    if (sq !== home || this._attacked(home, them)) return;
    var rook = us === 'w' ? 'R' : 'r';
    var kSide = us === 'w' ? 'K' : 'k';
    var qSide = us === 'w' ? 'Q' : 'q';
    if (c[kSide] && !b[home + 1] && !b[home + 2] && b[home + 3] === rook &&
        !this._attacked(home + 1, them) && !this._attacked(home + 2, them)) {
      moves.push(mk(sq, home + 2, king, null, 'k'));
    }
    if (c[qSide] && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === rook &&
        !this._attacked(home - 1, them) && !this._attacked(home - 2, them)) {
      moves.push(mk(sq, home - 2, king, null, 'q'));
    }
  };

  P._make = function (m) {
    var b = this._board, us = this._turn, c = this._castling;
    this._history.push({
      move: m, board: b.slice(), turn: us, castling: { K: c.K, Q: c.Q, k: c.k, q: c.q },
      ep: this._ep, half: this._half, full: this._full, pub: null
    });
    b[m.to] = m.promotion ? (us === 'w' ? m.promotion.toUpperCase() : m.promotion) : m.piece;
    b[m.from] = null;
    if (has(m.flags, 'e')) b[m.to + (us === 'w' ? 8 : -8)] = null;
    if (has(m.flags, 'k')) { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
    if (has(m.flags, 'q')) { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
    if (typeOf(m.piece) === 'k') {
      if (us === 'w') { c.K = false; c.Q = false; } else { c.k = false; c.q = false; }
    }
    if (CORNER_RIGHTS[m.from]) c[CORNER_RIGHTS[m.from]] = false;
    if (CORNER_RIGHTS[m.to]) c[CORNER_RIGHTS[m.to]] = false;
    this._ep = has(m.flags, 'b') ? (m.from + m.to) / 2 : -1;
    this._half = (typeOf(m.piece) === 'p' || m.captured) ? 0 : this._half + 1;
    if (us === 'b') this._full++;
    this._turn = other(us);
  };

  P._unmake = function () {
    var h = this._history.pop();
    if (!h) return null;
    this._board = h.board;
    this._turn = h.turn;
    this._castling = h.castling;
    this._ep = h.ep;
    this._half = h.half;
    this._full = h.full;
    return h;
  };

  P._legal = function () {
    var us = this._turn, them = other(us), out = [];
    var pseudo = this._pseudo();
    for (var i = 0; i < pseudo.length; i++) {
      this._make(pseudo[i]);
      if (!this._attacked(this._kingIndex(us), them)) out.push(pseudo[i]);
      this._unmake();
    }
    return out;
  };

  P._hasLegal = function () {
    var us = this._turn, them = other(us);
    var pseudo = this._pseudo();
    for (var i = 0; i < pseudo.length; i++) {
      this._make(pseudo[i]);
      var ok = !this._attacked(this._kingIndex(us), them);
      this._unmake();
      if (ok) return true;
    }
    return false;
  };

  /* ---------- notation ---------- */

  P._san = function (m, legal) {
    var s;
    if (has(m.flags, 'k')) s = 'O-O';
    else if (has(m.flags, 'q')) s = 'O-O-O';
    else {
      var ty = typeOf(m.piece);
      if (ty === 'p') {
        s = m.captured ? FILES[fileOf(m.from)] + 'x' : '';
        s += nameOf(m.to);
        if (m.promotion) s += '=' + m.promotion.toUpperCase();
      } else {
        s = ty.toUpperCase();
        var rivals = legal.filter(function (o) { return o.piece === m.piece && o.to === m.to && o.from !== m.from; });
        if (rivals.length) {
          var sameFile = rivals.some(function (o) { return fileOf(o.from) === fileOf(m.from); });
          var sameRank = rivals.some(function (o) { return rowOf(o.from) === rowOf(m.from); });
          if (!sameFile) s += FILES[fileOf(m.from)];
          else if (!sameRank) s += String(8 - rowOf(m.from));
          else s += nameOf(m.from);
        }
        if (m.captured) s += 'x';
        s += nameOf(m.to);
      }
    }
    this._make(m);
    if (this.inCheck()) s += this._hasLegal() ? '+' : '#';
    this._unmake();
    return s;
  };

  P._public = function (m, legal) {
    return {
      color: colorOf(m.piece),
      from: nameOf(m.from),
      to: nameOf(m.to),
      piece: typeOf(m.piece),
      captured: m.captured ? typeOf(m.captured) : null,
      promotion: m.promotion,
      flags: m.flags,
      san: this._san(m, legal),
      lan: nameOf(m.from) + nameOf(m.to) + (m.promotion || '')
    };
  };

  function cleanSan(s) {
    return String(s).trim().replace(/[+#?!]+$/, '').replace(/0/g, 'O').replace(/=?([qrbn])$/i, function (_, p) { return '=' + p.toUpperCase(); });
  }

  /* ---------- public moves ---------- */

  P.moves = function (opts) {
    opts = opts || {};
    var legal = this._legal();
    var list = legal;
    if (opts.square) {
      var sq = indexOf(opts.square);
      list = legal.filter(function (m) { return m.from === sq; });
    }
    var self = this;
    return list.map(function (m) {
      return opts.verbose ? self._public(m, legal) : self._san(m, legal);
    });
  };

  // Map of from-square to target squares, handy for driving a board UI.
  P.destinations = function () {
    var out = {};
    this._legal().forEach(function (m) {
      var from = nameOf(m.from), to = nameOf(m.to);
      if (!out[from]) out[from] = [];
      if (out[from].indexOf(to) === -1) out[from].push(to);
    });
    return out;
  };

  P.move = function (input) {
    var legal = this._legal();
    var found = null, i;
    if (typeof input === 'string') {
      var coord = input.trim().match(/^([a-h][1-8])-?([a-h][1-8])([qrbn])?$/i);
      if (coord) {
        input = { from: coord[1].toLowerCase(), to: coord[2].toLowerCase(), promotion: coord[3] };
      } else {
        var want = cleanSan(input);
        for (i = 0; i < legal.length && !found; i++) {
          if (cleanSan(this._san(legal[i], legal)) === want) found = legal[i];
        }
      }
    }
    if (!found && input && typeof input === 'object') {
      var from = indexOf(input.from), to = indexOf(input.to);
      var promo = (input.promotion || 'q').toLowerCase();
      for (i = 0; i < legal.length && !found; i++) {
        var m = legal[i];
        if (m.from === from && m.to === to && (!m.promotion || m.promotion === promo)) found = m;
      }
    }
    if (!found) return null;
    var pub = this._public(found, legal);
    this._make(found);
    this._history[this._history.length - 1].pub = pub;
    this._keys.push(this._positionKey());
    return pub;
  };

  P.undo = function () {
    if (!this._history.length) return null;
    var h = this._unmake();
    this._keys.pop();
    return h.pub;
  };

  P.history = function (opts) {
    var verbose = opts && opts.verbose;
    return this._history.map(function (h) { return verbose ? h.pub : h.pub.san; });
  };

  P.startFen = function () { return this._startFen; };

  P.pgn = function () {
    var fenParts = this._startFen.split(' ');
    var num = Number(fenParts[5]);
    var white = fenParts[1] === 'w';
    var out = [];
    this.history().forEach(function (san, i) {
      if (white) out.push(num + '. ' + san);
      else { out.push(i === 0 ? num + '... ' + san : san); num++; }
      white = !white;
    });
    return out.join(' ');
  };

  /* ---------- board access ---------- */

  P.get = function (square) {
    var i = indexOf(square);
    var p = i === -1 ? null : this._board[i];
    return p ? { type: typeOf(p), color: colorOf(p) } : null;
  };

  P.board = function () {
    var rows = [];
    for (var r = 0; r < 8; r++) {
      var row = [];
      for (var f = 0; f < 8; f++) {
        var i = r * 8 + f, p = this._board[i];
        row.push(p ? { square: nameOf(i), type: typeOf(p), color: colorOf(p) } : null);
      }
      rows.push(row);
    }
    return rows;
  };

  P.turn = function () { return this._turn; };

  /* ---------- game state ---------- */

  P.isCheckmate = function () { return this.inCheck() && !this._hasLegal(); };
  P.isStalemate = function () { return !this.inCheck() && !this._hasLegal(); };
  P.isFiftyMoveRule = function () { return this._half >= 100; };

  P.isThreefoldRepetition = function () {
    var key = this._keys[this._keys.length - 1], n = 0;
    for (var i = 0; i < this._keys.length; i++) if (this._keys[i] === key) n++;
    return n >= 3;
  };

  P.isInsufficientMaterial = function () {
    var minors = [], bishopsOn = [];
    for (var i = 0; i < 64; i++) {
      var p = this._board[i];
      if (!p) continue;
      var ty = typeOf(p);
      if (ty === 'k') continue;
      if (ty === 'p' || ty === 'r' || ty === 'q') return false;
      minors.push(ty);
      if (ty === 'b') bishopsOn.push((fileOf(i) + rowOf(i)) % 2);
    }
    if (minors.length <= 1) return true;
    // Any number of bishops, all on squares of one color, cannot mate.
    return bishopsOn.length === minors.length && bishopsOn.every(function (c) { return c === bishopsOn[0]; });
  };

  P.isDraw = function () {
    return this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition() || this.isFiftyMoveRule();
  };

  P.isGameOver = function () { return !this._hasLegal() || this.isDraw(); };

  // One-line description of how the game stands; null while play continues.
  P.result = function () {
    if (this.isCheckmate()) return { winner: other(this._turn), reason: 'checkmate' };
    if (this.isStalemate()) return { winner: null, reason: 'stalemate' };
    if (this.isInsufficientMaterial()) return { winner: null, reason: 'insufficient material' };
    if (this.isThreefoldRepetition()) return { winner: null, reason: 'threefold repetition' };
    if (this.isFiftyMoveRule()) return { winner: null, reason: 'the fifty-move rule' };
    return null;
  };

  // Counts leaf positions to a depth. Used by the tests to check move generation.
  P.perft = function (depth) {
    if (depth === 0) return 1;
    var moves = this._legal();
    if (depth === 1) return moves.length;
    var n = 0;
    for (var i = 0; i < moves.length; i++) {
      this._make(moves[i]);
      n += this.perft(depth - 1);
      this._unmake();
    }
    return n;
  };

  root.Chess = Chess;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Chess: Chess };
})(typeof window !== 'undefined' ? window : globalThis);
