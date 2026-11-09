/*
 * Open File piece set: flat geometric silhouettes drawn for this project.
 * Each entry is SVG markup inside a 100x100 viewBox. Shapes with class "d"
 * are details drawn in the contrasting color (eyes, slits, bands).
 */
(function (root) {
  'use strict';
  var base = '<rect x="22" y="78" width="56" height="10" rx="4"/>';
  var SHAPES = {
    p: '<circle cx="50" cy="28" r="11"/>' +
       '<path d="M41 47 C41 60 36 68 30 78 H70 C64 68 59 60 59 47 Z"/>' +
       '<rect x="36" y="40" width="28" height="7" rx="3.5"/>' +
       '<rect x="25" y="78" width="50" height="10" rx="4"/>',
    n: '<path d="M33 78 C33 66 38 58 45 52 C39 55 33 58 28 61 C23 64 18 59 21 54 C25 46 32 36 39 30 L39 18 L46 25 C50 22 54 20 56 15 L58 25 C69 31 75 45 73 61 C72 69 69 74 67 78 Z"/>' +
       '<circle class="d" cx="43" cy="37" r="3"/>' +
       '<path class="d dl" d="M60 32 C65 40 67 50 66 60" fill="none"/>' + base,
    b: '<circle cx="50" cy="13" r="5"/>' +
       '<path d="M50 18 C40 28 34 36 34 44 C34 51 41 55 50 55 C59 55 66 51 66 44 C66 36 60 28 50 18 Z"/>' +
       '<path class="d dl" d="M57 29 L47 41" fill="none"/>' +
       '<rect x="37" y="55" width="26" height="7" rx="3.5"/>' +
       '<path d="M40 62 C40 68 36 73 32 78 H68 C64 73 60 68 60 62 Z"/>' + base,
    r: '<path d="M29 78 L33 47 H67 L71 78 Z"/>' +
       '<path d="M27 41 V21 H37 V29 H45 V21 H55 V29 H63 V21 H73 V41 Z"/>' +
       '<rect x="30" y="40" width="40" height="8" rx="2"/>' + base,
    q: '<path d="M30 78 L20 40 L31 57 L35 32 L43 55 L50 28 L57 55 L65 32 L69 57 L80 40 L70 78 Z"/>' +
       '<circle cx="20" cy="36" r="5"/><circle cx="35" cy="28" r="5"/><circle cx="50" cy="23" r="5"/>' +
       '<circle cx="65" cy="28" r="5"/><circle cx="80" cy="36" r="5"/>' +
       '<path class="d dl" d="M31 69 H69" fill="none"/>' + base,
    k: '<path d="M47 9 H53 V15 H59 V21 H53 V30 H47 V21 H41 V15 H47 Z"/>' +
       '<path d="M50 52 C44 44 44 36 50 31 C56 36 56 44 50 52 Z"/>' +
       '<path d="M30 78 C26 66 20 56 24 48 C28 40 40 42 50 52 C60 42 72 40 76 48 C80 56 74 66 70 78 Z"/>' +
       '<path class="d dl" d="M31 69 H69" fill="none"/>' + base
  };

  function pieceSvg(piece) {
    var color = piece === piece.toUpperCase() ? 'w' : 'b';
    var type = piece.toLowerCase();
    return '<svg class="pc pc-' + color + '" viewBox="0 0 100 100" aria-hidden="true">' + SHAPES[type] + '</svg>';
  }

  var NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

  root.OpenFilePieces = { svg: pieceSvg, names: NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
