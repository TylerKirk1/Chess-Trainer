/*
 * Open File repertoire: turns the flat openings list into things to drill.
 * No DOM. Works in the browser (window.Repertoire) and in Node.
 *
 *   var rep = new Repertoire(window.OPENINGS);
 *   rep.entries               all openings: { id, eco, name, family, variation, moves[] }
 *   rep.families()            [{ name, entries[] }] sorted A to Z
 *   rep.byId(id)
 *   rep.search(text, limit)
 *   rep.linesFor(entry)       [main line, ...branch lines], each { id, name, eco, moves[] }
 *   Repertoire.defaultSide(entry)  'w' or 'b'
 */
(function (root) {
  'use strict';

  function slug(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function Repertoire(rows) {
    var used = {};
    this.entries = rows.map(function (r, i) {
      var name = r[1];
      var colon = name.indexOf(':');
      var base = slug(name), id = base, n = 2;
      while (used[id]) id = base + '-' + (n++);
      used[id] = true;
      return {
        id: id,
        index: i,
        eco: r[0],
        name: name,
        family: colon === -1 ? name : name.slice(0, colon),
        variation: colon === -1 ? '' : name.slice(colon + 1).trim(),
        moves: r[2].split(' ')
      };
    });
    this._byId = {};
    var self = this;
    this.entries.forEach(function (e) { self._byId[e.id] = e; });
  }
  var P = Repertoire.prototype;

  P.byId = function (id) { return this._byId[id] || null; };

  P.families = function () {
    var map = {}, list = [];
    this.entries.forEach(function (e) {
      if (!map[e.family]) { map[e.family] = { name: e.family, entries: [] }; list.push(map[e.family]); }
      map[e.family].entries.push(e);
    });
    list.forEach(function (f) {
      // The family's own entry (no variation) first, then shortest lines, then by name.
      f.entries.sort(function (a, b) {
        return (a.variation ? 1 : 0) - (b.variation ? 1 : 0) || a.moves.length - b.moves.length || a.name.localeCompare(b.name);
      });
      f.root = f.entries[0];
    });
    return list.sort(function (a, b) { return a.name.localeCompare(b.name); });
  };

  // Matches every word of the query against name, ECO code and moves.
  P.search = function (text, limit) {
    var words = String(text || '').toLowerCase().replace(/[’']/g, '').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var out = [];
    for (var i = 0; i < this.entries.length && out.length < (limit || 60); i++) {
      var e = this.entries[i];
      var hay = (e.name + ' ' + e.eco + ' ' + e.moves.join(' ')).toLowerCase().replace(/[’']/g, '');
      if (words.every(function (w) { return hay.indexOf(w) !== -1; })) out.push(e);
    }
    return out.sort(function (a, b) { return a.moves.length - b.moves.length; });
  };

  function startsWith(moves, prefix) {
    if (moves.length <= prefix.length) return false;
    for (var i = 0; i < prefix.length; i++) if (moves[i] !== prefix[i]) return false;
    return true;
  }

  /*
   * The chosen opening is the main line. Branch lines are the deepest named
   * lines that continue it (a line that another line extends is covered by
   * that longer line). Branches are ordered so that well-developed lines,
   * the ones with more named continuations, come first.
   */
  P.linesFor = function (entry) {
    var desc = this.entries.filter(function (e) { return startsWith(e.moves, entry.moves); });
    var leaves = desc.filter(function (d) {
      return !desc.some(function (e) { return startsWith(e.moves, d.moves); });
    });

    // Weight of each move prefix = how many named lines pass through it.
    var weight = {};
    var gambit = /gambit/i.test(entry.name);
    desc.forEach(function (d) {
      for (var i = entry.moves.length + 1; i <= d.moves.length; i++) {
        var k = d.moves.slice(0, i).join(' ');
        // The list has no popularity data, so names stand in for it: lines called
        // "Main Line" count extra and gambits count less (unless a gambit was chosen).
        var w = /main line/i.test(d.name) ? 4 : 1;
        if (!gambit && /gambit/i.test(d.name)) w = 0.2;
        weight[k] = (weight[k] || 0) + w;
      }
    });
    leaves.sort(function (a, b) {
      for (var i = entry.moves.length; i < Math.min(a.moves.length, b.moves.length); i++) {
        if (a.moves[i] !== b.moves[i]) {
          var wa = weight[a.moves.slice(0, i + 1).join(' ')], wb = weight[b.moves.slice(0, i + 1).join(' ')];
          return wb - wa || a.index - b.index;
        }
      }
      return a.moves.length - b.moves.length;
    });

    function line(e, main) {
      return { id: e.moves.join(' '), name: e.name, eco: e.eco, moves: e.moves, main: !!main };
    }
    return [line(entry, true)].concat(leaves.map(function (e) { return line(e, false); }));
  };

  // The next named positions inside an opening, for narrowing down what to drill.
  P.childrenOf = function (entry) {
    var desc = this.entries.filter(function (e) { return startsWith(e.moves, entry.moves) && e.name !== entry.name; });
    var seen = {};
    return desc.filter(function (d) {
      if (desc.some(function (e) { return startsWith(d.moves, e.moves) && e.name !== d.name; })) return false;
      if (seen[d.name]) return false;
      seen[d.name] = true;
      return true;
    });
  };

  // Openings named as a Black reply are trained as Black; everything else as White.
  Repertoire.defaultSide = function (entry) {
    return /(Defen[cs]e|Countergambit|Counter-Gambit|Counterattack)/i.test(entry.family) ? 'b' : 'w';
  };

  Repertoire.slug = slug;
  root.Repertoire = Repertoire;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Repertoire: Repertoire };
})(typeof window !== 'undefined' ? window : globalThis);
