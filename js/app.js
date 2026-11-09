/*
 * Open File app: connects the rules engine (Chess) to the board view (BoardView)
 * for free play. An opening trainer can reuse both pieces and swap this file's
 * onMove handler for one that checks moves against a repertoire.
 */
(function () {
  'use strict';

  var game = new Chess();
  var $ = function (id) { return document.getElementById(id); };

  var view = new BoardView($('board'), {
    onMove: function (from, to, promotion) {
      var m = game.move({ from: from, to: to, promotion: promotion });
      if (!m) return false;
      sync();
      return true;
    }
  });

  function sync() {
    var history = game.history({ verbose: true });
    var last = history[history.length - 1];
    var over = game.isGameOver();
    view.set({
      fen: game.fen(),
      lastMove: last ? [last.from, last.to] : null,
      check: game.inCheck() ? game.kingSquare() : null,
      movable: over ? null : { color: game.turn(), dests: game.destinations() }
    });
    renderStatus();
    renderMoves(history);
    $('btn-undo').disabled = history.length === 0;
  }

  function renderStatus() {
    var side = game.turn() === 'w' ? 'White' : 'Black';
    var status = $('status');
    var result = game.result();
    var text;
    status.classList.toggle('is-over', !!result);
    status.classList.toggle('is-check', !result && game.inCheck());
    if (result && result.reason === 'checkmate') {
      text = 'Checkmate. ' + (result.winner === 'w' ? 'White' : 'Black') + ' wins';
    } else if (result) {
      text = 'Draw by ' + result.reason;
    } else if (game.inCheck()) {
      text = side + ' to move, in check';
    } else {
      text = side + ' to move';
    }
    $('status-text').textContent = text;
    $('turn-chip').className = 'turn-chip ' + game.turn();
  }

  function renderMoves(history) {
    var list = $('moves');
    list.innerHTML = '';
    for (var i = 0; i < history.length; i += 2) {
      var li = document.createElement('li');
      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = (i / 2 + 1) + '.';
      li.appendChild(num);
      [history[i], history[i + 1]].forEach(function (m, j) {
        var s = document.createElement('span');
        s.className = 'ply' + (i + j === history.length - 1 ? ' is-latest' : '');
        s.textContent = m ? m.san : '';
        li.appendChild(s);
      });
      list.appendChild(li);
    }
    $('moves-empty').hidden = history.length > 0;
    $('btn-copy').hidden = history.length === 0;
    var pgn = $('pgn');
    pgn.hidden = history.length === 0;
    pgn.textContent = game.pgn();
    var wrap = $('moves-wrap');
    wrap.scrollTop = wrap.scrollHeight;
  }

  function undo() { if (game.undo()) sync(); }
  function flip() { view.flip(); }
  function newGame() { game.reset(); sync(); }

  $('btn-undo').addEventListener('click', undo);
  $('btn-flip').addEventListener('click', flip);
  $('btn-new').addEventListener('click', newGame);
  $('btn-copy').addEventListener('click', function () {
    var btn = this, text = game.pgn();
    function done(label) { btn.textContent = label; setTimeout(function () { btn.textContent = 'Copy moves'; }, 1500); }
    try {
      navigator.clipboard.writeText(text).then(function () { done('Copied'); }, function () { selectPgn(); done('Selected, press Ctrl+C'); });
    } catch (e) { selectPgn(); done('Selected, press Ctrl+C'); }
  });
  function selectPgn() {
    var range = document.createRange();
    range.selectNodeContents($('pgn'));
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    var k = e.key.toLowerCase();
    if (k === 'u' || e.key === 'ArrowLeft') { undo(); e.preventDefault(); }
    else if (k === 'f') { flip(); }
  });

  // For poking at the game from the browser console while building trainers.
  window.openFile = { game: game, view: view, sync: sync };

  sync();
})();
