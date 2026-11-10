/*
 * Open File repertoire: turns the flat openings list into things to browse and drill.
 * No DOM. Works in the browser (window.Repertoire) and in Node.
 *
 *   var rep = new Repertoire(window.OPENINGS, window.OPENING_TAGS);
 *   rep.entries        every opening: { id, eco, name, family, variation, moves[],
 *                                       side, first, tier, tags: { sound, trappy, ... } }
 *   rep.families       [{ name, root, entries[], tier, rank }] in default order
 *   rep.byId(id)
 *   rep.query(filters) grouped matches for the picker, see below
 *   rep.linesFor(entry)    [core line, ...branch lines], each { id, name, eco, moves[] }
 *   rep.childrenOf(entry)  the next named positions inside an opening
 */
(function (root) {
  'use strict';

  var FIRST_MOVES = ['e4', 'd4', 'c4', 'Nf3'];

  function slug(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function fold(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '');
  }

  // True when `name` is `prefix` or continues it at a word boundary.
  function hasPrefix(name, prefix) {
    if (name.indexOf(prefix) !== 0) return false;
    var c = name.charAt(prefix.length);
    return c === '' || c === ':' || c === ',' || c === ' ';
  }

  function anyPrefix(list, name) {
    for (var i = 0; list && i < list.length; i++) if (hasPrefix(name, list[i])) return true;
    return false;
  }

  function startsWith(moves, prefix) {
    if (moves.length <= prefix.length) return false;
    for (var i = 0; i < prefix.length; i++) if (moves[i] !== prefix[i]) return false;
    return true;
  }

  /*
   * Which side an opening belongs to. The most specific part of the name decides
   * when it says so ("... Defense" is Black's, "... Attack" is White's). Otherwise
   * the opening belongs to whoever plays its last move, since that move is the choice
   * the name describes.
   */
  function sideOf(e, T) {
    if (T.side && T.side[e.name]) return T.side[e.name];
    var last = e.name.split(/[:,]/).pop();
    if (/(Defen[cs]e|Countergambit|Counter-Gambit|Counterattack)/i.test(last)) return 'b';
    if (/(Attack|Opening|System|Game)\b/i.test(last)) return 'w';
    return e.moves.length % 2 === 1 ? 'w' : 'b';
  }

  function Repertoire(rows, tags) {
    var T = tags || {};
    var used = {};
    var self = this;

    this.entries = rows.map(function (r, i) {
      var name = r[1];
      var colon = name.indexOf(':');
      var base = slug(name), id = base, n = 2;
      while (used[id]) id = base + '-' + (n++);
      used[id] = true;
      return {
        id: id, index: i, eco: r[0], name: name,
        family: colon === -1 ? name : name.slice(0, colon),
        variation: colon === -1 ? '' : name.slice(colon + 1).trim(),
        moves: r[2].split(' ')
      };
    });

    this._regroup(T);
    this._tag(T);
    this._measure();

    this._byId = {};
    this.entries.forEach(function (e) { self._byId[e.id] = e; });
    this.families = this._buildFamilies();
  }
  var P = Repertoire.prototype;

  P._regroup = function (T) {
    var rules = T.regroup || [];
    function join(a, b) { return [a, b].filter(Boolean).join(', '); }

    this.entries.forEach(function (e) {
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (!hasPrefix(e.name, r.prefix)) continue;
        var rest = e.name.slice(r.prefix.length).replace(/^[:,]?\s*/, '');
        e.family = r.family;
        e.variation = join(r.label, rest);
        return;
      }
    });

    // Fold "X Accepted", "X Declined" and "X, with ..." into the family "X".
    var names = {};
    this.entries.forEach(function (e) { names[e.family] = true; });
    var keep = T.keepSeparate || [];
    var target = {};
    Object.keys(names).forEach(function (f) {
      var m = /^(.+?)( Accepted| Declined|, with .+)$/.exec(f);
      if (m && names[m[1]] && keep.indexOf(m[1]) === -1) target[f] = { family: m[1], label: m[2].replace(/^,? /, '') };
    });
    this.entries.forEach(function (e) {
      var t = target[e.family];
      if (!t) return;
      e.family = t.family;
      e.variation = join(t.label.charAt(0).toUpperCase() + t.label.slice(1), e.variation);
    });
  };

  P._tag = function (T) {
    var tier = {}, rank = {};
    (T.tier1 || []).forEach(function (n, i) { tier[n] = 1; rank[n] = i; });
    (T.tier2 || []).forEach(function (n, i) { tier[n] = 2; rank[n] = i; });
    (T.tier4 || []).forEach(function (n) { tier[n] = 4; });
    var mixed = T.mixed || [], beginner = T.beginner || [];

    this.entries.forEach(function (e) {
      e.tier = tier[e.family] || 3;
      e.rank = rank[e.family] != null ? rank[e.family] : 999;
      e.first = FIRST_MOVES.indexOf(e.moves[0]) !== -1 ? e.moves[0] : 'other';
      e.side = sideOf(e, T);
      e.hay = fold(e.name + ' ' + e.family + ' ' + e.eco + ' ' + e.moves.join(' '));

      // "Queen's Gambit Declined" is a defense, not a gambit line, so look past that name.
      var gambitText = /^Queen's Gambit/.test(e.name) ? e.name.replace(/^Queen's Gambit( Declined| Accepted)?/, '') : e.name;
      var gambit = /gambit/i.test(gambitText);
      var trappy = /\btrap\b/i.test(e.name) || anyPrefix(T.trappy, e.name);
      var base = e.tier === 1 ||
        (e.tier === 2 && mixed.indexOf(e.family) === -1) ||
        (mixed.indexOf(e.family) !== -1 && (!e.variation || anyPrefix(T.soundIn, e.name)));
      e.tags = {
        sound: base && !trappy && (!gambit || anyPrefix(T.soundGambits, e.name)) && !anyPrefix(T.unsound, e.name),
        beginner: beginner.indexOf(e.name) !== -1,
        trappy: trappy,
        gambit: gambit,
        offbeat: e.tier >= 3
      };
    });
  };

  // size = how many named lines continue each opening. With no popularity data
  // in the list, this is the best available sign of how much theory a line has.
  P._measure = function () {
    var sorted = this.entries.map(function (e) { return { e: e, key: e.moves.join(' ') + ' ' }; })
      .sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
    for (var i = 0; i < sorted.length; i++) {
      var n = 0;
      for (var j = i + 1; j < sorted.length && sorted[j].key.indexOf(sorted[i].key) === 0; j++) n++;
      sorted[i].e.size = n;
    }
  };

  P._buildFamilies = function () {
    var map = {}, list = [];
    this.entries.forEach(function (e) {
      if (!map[e.family]) { map[e.family] = { name: e.family, entries: [] }; list.push(map[e.family]); }
      map[e.family].entries.push(e);
    });
    list.forEach(function (f) {
      // The family's own entry (no variation) first, then shortest lines, then by name.
      f.entries.sort(function (a, b) {
        return (a.variation ? 1 : 0) - (b.variation ? 1 : 0) || a.moves.length - b.moves.length || a.index - b.index;
      });
      f.root = f.entries[0];
      f.tier = f.root.tier;
      f.rank = f.root.rank;
    });
    this._familyOf = map;
    return list.sort(function (a, b) {
      return a.tier - b.tier || a.rank - b.rank || a.name.localeCompare(b.name);
    });
  };

  P.byId = function (id) { return this._byId[id] || null; };

  /*
   * filters: { text, side: 'w'|'b', first: 'e4'|'d4'|'c4'|'Nf3'|'other', tags: ['sound', ...], test: fn }
   * Every given filter must hold. Returns one group per family that has a match:
   *   { family, rootMatches, count, top }
   * `top` holds the matching lines that are not already covered by a shorter
   * matching line of the same family, the ones with the most theory first.
   */
  P.query = function (filters) {
    var f = filters || {};
    var words = fold(String(f.text || '')).split(/\s+/).filter(Boolean);
    var tags = f.tags || [];

    function ok(e) {
      if (f.side && e.side !== f.side) return false;
      if (f.first && e.first !== f.first) return false;
      for (var i = 0; i < tags.length; i++) if (!e.tags[tags[i]]) return false;
      for (var j = 0; j < words.length; j++) if (e.hay.indexOf(words[j]) === -1) return false;
      return !f.test || f.test(e);
    }

    var out = [];
    this.families.forEach(function (fam) {
      var hits = fam.entries.filter(ok);
      if (!hits.length) return;
      var byLength = hits.slice().sort(function (a, b) { return a.moves.length - b.moves.length || a.index - b.index; });
      var top = [], seen = {};
      byLength.forEach(function (h) {
        if (seen[h.name]) return;
        if (top.some(function (t) { return startsWith(h.moves, t.moves); })) return;
        seen[h.name] = true;
        top.push(h);
      });
      top.sort(function (a, b) { return b.size - a.size || a.moves.length - b.moves.length || a.index - b.index; });
      out.push({ family: fam, rootMatches: hits.indexOf(fam.root) !== -1, count: hits.length, top: top });
    });
    return out;
  };

  /*
   * The chosen opening is the core line. Branch lines are the deepest named
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

    // A family's main entry also drills the family's lines that reach it by another
    // move order (the London System, for one, is filed under several first moves).
    var others = [];
    var fam = this._familyOf[entry.family];
    if (fam && fam.root === entry) {
      var rest = fam.entries.filter(function (e) {
        return e !== entry && !startsWith(e.moves, entry.moves) && !startsWith(entry.moves, e.moves);
      });
      others = rest.filter(function (d) {
        return !rest.some(function (e) { return startsWith(e.moves, d.moves); });
      }).sort(function (a, b) { return b.size - a.size || a.index - b.index; });
    }

    function line(e, main) {
      return { id: e.moves.join(' '), name: e.name, label: e.variation, family: e.family, eco: e.eco, moves: e.moves, main: !!main };
    }
    return [line(entry, true)].concat(leaves.concat(others).map(function (e) { return line(e, false); }));
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

  // Checks the hand-written labels against the list. Returns names that match nothing.
  Repertoire.unmatchedLabels = function (rows, T) {
    var names = rows.map(function (r) { return r[1]; });
    var missing = [];
    function check(list, exact, what) {
      (list || []).forEach(function (p) {
        var hit = names.some(function (n) { return exact ? n === p : hasPrefix(n, p); });
        if (!hit) missing.push(what + ': ' + p);
      });
    }
    check((T.regroup || []).map(function (r) { return r.prefix; }), false, 'regroup');
    check(T.soundIn, false, 'soundIn');
    check(T.soundGambits, false, 'soundGambits');
    check(T.unsound, false, 'unsound');
    check(T.trappy, false, 'trappy');
    check(T.beginner, true, 'beginner');
    check(Object.keys(T.side || {}), true, 'side');
    return missing;
  };

  Repertoire.slug = slug;
  root.Repertoire = Repertoire;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Repertoire: Repertoire };
})(typeof window !== 'undefined' ? window : globalThis);
