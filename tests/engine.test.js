// Run with: node tests/engine.test.js
var assert = require('assert');
var Chess = require('../js/chess-engine.js').Chess;

var failures = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + e.message); }
}

// Known perft counts (chessprogramming.org "Perft Results").
var PERFT = [
  ['start', Chess.START_FEN, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]]
];
PERFT.forEach(function (row) {
  test('perft ' + row[0], function () {
    var g = new Chess(row[1]);
    row[2].forEach(function (want, i) { assert.strictEqual(g.perft(i + 1), want, 'depth ' + (i + 1)); });
    assert.strictEqual(g.fen(), new Chess(row[1]).fen(), 'position restored after perft');
  });
});

test('SAN moves and PGN for a Ruy Lopez', function () {
  var g = new Chess();
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'].forEach(function (s) {
    assert.ok(g.move(s), 'move ' + s);
  });
  assert.strictEqual(g.pgn(), '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O');
  assert.strictEqual(g.fen(), 'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 3 5');
});

test('coordinate and object moves', function () {
  var g = new Chess();
  assert.strictEqual(g.move('e2e4').san, 'e4');
  assert.strictEqual(g.move({ from: 'e7', to: 'e5' }).san, 'e5');
  assert.strictEqual(g.move({ from: 'e1', to: 'e3' }), null);
  assert.strictEqual(g.move('Ke3'), null);
});

test('scholar\'s mate is checkmate', function () {
  var g = new Chess();
  ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'].forEach(function (s) { assert.ok(g.move(s), s); });
  assert.ok(g.isCheckmate());
  assert.ok(g.isGameOver());
  assert.deepStrictEqual(g.result(), { winner: 'w', reason: 'checkmate' });
  assert.strictEqual(g.history().pop(), 'Qxf7#');
});

test('en passant capture and its SAN', function () {
  var g = new Chess();
  ['e4', 'a6', 'e5', 'd5'].forEach(function (s) { g.move(s); });
  var m = g.move('exd6');
  assert.ok(m && m.flags === 'e');
  assert.strictEqual(g.get('d5'), null);
  assert.deepStrictEqual(g.get('d6'), { type: 'p', color: 'w' });
  g.undo();
  assert.deepStrictEqual(g.get('d5'), { type: 'p', color: 'b' });
});

test('castling blocked through check', function () {
  var g = new Chess('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1');
  assert.ok(g.moves().indexOf('O-O') === -1);
  g = new Chess('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.ok(g.moves().indexOf('O-O') !== -1);
});

test('promotion, with underpromotion and check', function () {
  var g = new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1');
  var m = g.move({ from: 'a7', to: 'a8', promotion: 'n' });
  assert.strictEqual(m.san, 'a8=N');
  g.undo();
  assert.strictEqual(g.move('a8=Q+').san, 'a8=Q+');
});

test('SAN disambiguation', function () {
  var g = new Chess('k7/8/8/8/8/8/8/KN3N2 w - - 0 1');
  assert.ok(g.moves().indexOf('Nbd2') !== -1);
  g = new Chess('k7/8/8/1N6/8/8/8/KN6 w - - 0 1');
  assert.ok(g.moves().indexOf('N1c3') !== -1 && g.moves().indexOf('N5c3') !== -1);
});

test('stalemate and insufficient material', function () {
  var g = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.ok(g.isStalemate() && g.isDraw());
  assert.ok(new Chess('8/8/4k3/8/8/2B5/4K3/8 w - - 0 1').isInsufficientMaterial());
  assert.ok(!new Chess('8/8/4k3/8/8/2N5/4K1N1/8 w - - 0 1').isInsufficientMaterial());
  assert.ok(!new Chess('8/8/4k3/8/8/8/4K1P1/8 w - - 0 1').isInsufficientMaterial());
});

test('threefold repetition', function () {
  var g = new Chess();
  ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach(function (s) { g.move(s); });
  assert.ok(g.isThreefoldRepetition());
});

test('undo restores the start position', function () {
  var g = new Chess();
  ['d4', 'd5', 'c4', 'dxc4', 'e3'].forEach(function (s) { g.move(s); });
  while (g.undo()) {}
  assert.strictEqual(g.fen(), Chess.START_FEN);
});

test('bad FEN is rejected', function () {
  assert.throws(function () { new Chess('8/8/8/8/8/8/8/8 w - - 0 1'); });
});

if (failures) { console.log('\n' + failures + ' test(s) failed'); process.exit(1); }
console.log('\nAll engine tests passed');
