/*
 * Hand-written labels that sit on top of the openings list. The list itself has
 * names and moves only, so anything about reputation lives here. These labels are
 * a rough guide based on how each opening is usually regarded, not engine analysis.
 *
 * Names are matched as prefixes: "Englund Gambit" also covers
 * "Englund Gambit: Main Line" and "Englund Gambit Declined".
 */
window.OPENING_TAGS = {
  // Lines that are filed under a catch-all name in the source list but are
  // better known under their own. Each rule moves matching lines into `family`.
  regroup: [
    { prefix: "Queen's Pawn Game: London System", family: 'London System', label: '' },
    { prefix: "Queen's Pawn Game: Accelerated London System", family: 'London System', label: 'Accelerated' },
    { prefix: 'Indian Defense: London System', family: 'London System', label: 'Against the Indian Defense' },
    { prefix: 'Indian Defense: Accelerated London System', family: 'London System', label: 'Accelerated, against the Indian Defense' },
    { prefix: 'London System', family: 'London System', label: "Against the King's Indian setup" },
    { prefix: "Queen's Pawn Game: Colle System", family: 'Colle System', label: '' },
    { prefix: 'Indian Defense: Colle System', family: 'Colle System', label: 'Against the Indian Defense' },
    { prefix: "Queen's Pawn Game: Torre Attack", family: 'Torre Attack', label: '' },
    { prefix: 'Indian Defense: Budapest Gambit', family: 'Budapest Gambit', label: '' },
    { prefix: "Petrov's Defense: Stafford Gambit", family: 'Stafford Gambit', label: '' },
    { prefix: "Queen's Gambit Declined: Albin Countergambit", family: 'Albin Countergambit', label: '' },
    { prefix: 'Sicilian Defense: Smith-Morra Gambit', family: 'Smith-Morra Gambit', label: '' },
    { prefix: 'Italian Game: Evans Gambit', family: 'Evans Gambit', label: '' },
    { prefix: 'Italian Game: Two Knights Defense, Fried Liver Attack', family: 'Fried Liver Attack', label: '' },
    { prefix: 'Italian Game: Two Knights Defense, Traxler Counterattack', family: 'Traxler Counterattack', label: '' },
    { prefix: "King's Pawn Game: Wayward Queen Attack", family: 'Wayward Queen Attack', label: '' },
    { prefix: 'Four Knights Game: Halloween Gambit', family: 'Halloween Gambit', label: '' },
    { prefix: 'Zukertort Opening: Tennison Gambit', family: 'Tennison Gambit', label: '' },
    { prefix: 'Vienna Gambit, with Max Lange Defense', family: 'Vienna Game', label: 'Vienna Gambit, Max Lange Defense' }
  ],

  // "X Accepted", "X Declined" and "X, with ..." are folded into "X", except here.
  keepSeparate: ["Queen's Gambit"],

  // Mainstream openings, most played first. This order is the default sort.
  tier1: [
    'Italian Game', 'Ruy Lopez', 'Sicilian Defense', 'French Defense', 'Caro-Kann Defense',
    "Queen's Gambit", "Queen's Gambit Declined", "Queen's Gambit Accepted", 'London System',
    'Slav Defense', "King's Indian Defense", 'Scotch Game', 'Vienna Game', 'Scandinavian Defense',
    'English Opening', 'Nimzo-Indian Defense', 'Semi-Slav Defense', 'Grünfeld Defense',
    'Four Knights Game', "Petrov's Defense", 'Pirc Defense', 'Catalan Opening', "Queen's Indian Defense",
    'Dutch Defense', 'Réti Opening', 'Modern Defense', 'Benoni Defense', 'Alekhine Defense',
    'Philidor Defense', "King's Indian Attack", 'Tarrasch Defense', 'Bogo-Indian Defense'
  ],

  // Well-known and playable, but a step off the main road.
  tier2: [
    "King's Gambit", 'Evans Gambit', 'Fried Liver Attack', 'Stafford Gambit', 'Smith-Morra Gambit',
    "Bishop's Opening", 'Danish Gambit', 'Benko Gambit', 'Budapest Gambit', 'Albin Countergambit',
    'Traxler Counterattack', 'Wayward Queen Attack', 'Colle System', 'Torre Attack', 'Trompowsky Attack',
    'Rapport-Jobava System', 'Ponziani Opening', 'Center Game', 'Three Knights Opening',
    'Old Indian Defense', 'Neo-Grünfeld Defense', 'Richter-Veresov Attack', 'Blumenfeld Countergambit',
    "Queen's Pawn Game", "King's Pawn Game", 'Indian Defense', 'Zukertort Opening', "King's Knight Opening",
    'Rubinstein Opening', 'Yusupov-Rubinstein System', 'East Indian Defense', 'Marienbad System',
    "Pseudo Queen's Indian Defense", 'Slav Indian', 'Robatsch Defense', 'Horwitz Defense', 'Wade Defense',
    "Queen's Indian Accelerated"
  ],

  // Jokes and openings that are simply bad. Everything not listed in a tier is tier 3.
  tier4: [
    'Bongcloud Attack', 'Barnes Defense', 'Barnes Opening', 'Fried Fox Defense', 'Borg Defense',
    'Carr Defense', 'Goldsmith Defense', 'Ware Defense', 'Ware Opening', 'Lemming Defense',
    'Sodium Attack', 'Amar Opening', 'Creepy Crawly Formation', 'Global Opening', 'Clemenz Opening',
    'Kádas Opening', 'Duras Gambit', 'Irish Gambit', 'Australian Defense', 'Hippopotamus Defense',
    'Gunderam Defense', 'Zaire Defense', 'Montevideo Defense', 'Lasker Simul Special', 'Amazon Attack',
    'Canard Opening', 'Zukertort Defense', 'Formation', 'Dresden Opening'
  ],

  // Catch-all names: only the starting position and the lines in soundIn count as sound.
  mixed: ["Queen's Pawn Game", "King's Pawn Game", 'Indian Defense', 'Zukertort Opening'],
  soundIn: [
    "Queen's Pawn Game: Symmetrical Variation", "Queen's Pawn Game: Zukertort Variation",
    'Indian Defense: Normal Variation', 'Indian Defense: Knights Variation',
    'Indian Defense: Anti-Grünfeld', 'Indian Defense: Anti-Nimzo-Indian',
    'Zukertort Opening: Kingside Fianchetto', "Zukertort Opening: Queen's Gambit Invitation",
    'Zukertort Opening: Sicilian Invitation', 'Zukertort Opening: Slav Invitation',
    'Zukertort Opening: Reversed Grünfeld', 'Zukertort Opening: Double Fianchetto Attack',
    'Zukertort Opening: Quiet System'
  ],

  // Gambits that are fully respectable, so they still count as sound.
  soundGambits: ['Benko Gambit', 'Semi-Slav Defense: Marshall Gambit', 'Semi-Slav Defense: Anti-Moscow Gambit'],

  // Lines inside good openings that are known mistakes.
  unsound: [
    "King's Pawn Game: Damiano Defense", "Petrov's Defense: Damiano Variation",
    'Sicilian Defense: Bowdler Attack', 'Italian Game: Paris Defense'
  ],

  // Sharp lines that set early traps. Anything with "Trap" in its name is added automatically.
  trappy: [
    'Englund Gambit', "Petrov's Defense: Stafford Gambit", "Petrov's Defense: Cochrane Gambit",
    'Italian Game: Blackburne-Kostić Gambit', 'Italian Game: Jerome Gambit', 'Italian Game: Rousseau Gambit',
    'Italian Game: Two Knights Defense, Fried Liver Attack', 'Italian Game: Two Knights Defense, Traxler Counterattack',
    'Italian Game: Two Knights Defense, Max Lange Attack', 'Italian Game: Scotch Gambit',
    'Scotch Game: Scotch Gambit', 'Scotch Game: Göring Gambit', 'Danish Gambit',
    "King's Gambit", 'Vienna Game: Vienna Gambit', 'Vienna Gambit, with Max Lange Defense',
    'Vienna Game: Frankenstein-Dracula Variation', 'Vienna Game: Stanley Variation, Frankenstein-Dracula Variation',
    'Latvian Gambit', 'Elephant Gambit', 'Four Knights Game: Halloween Gambit',
    "Bishop's Opening: Urusov Gambit", "Bishop's Opening: Boden-Kieseritzky Gambit",
    "King's Pawn Game: Wayward Queen Attack", "King's Pawn Game: Napoleon Attack", "King's Pawn Game: Busch-Gass Gambit",
    'Sicilian Defense: Smith-Morra Gambit', 'Sicilian Defense: Wing Gambit',
    'French Defense: Advance Variation, Milner-Barry Gambit',
    'Scandinavian Defense: Portuguese Gambit', 'Scandinavian Defense: Icelandic-Palme Gambit',
    'Blackmar-Diemer Gambit', "Queen's Gambit Declined: Albin Countergambit",
    'Indian Defense: Budapest Gambit', "Bird Opening: From's Gambit", 'Dutch Defense: Staunton Gambit',
    'Zukertort Opening: Tennison Gambit', 'Grob Opening', 'Owen Defense: Matovinsky Gambit',
    'Ruy Lopez: Berlin Defense, Fishing Pole Variation'
  ],

  // Exact names. Simple plans, forgiving positions, widely recommended to newer players.
  beginner: [
    'Italian Game', 'Italian Game: Giuoco Piano', 'Italian Game: Giuoco Pianissimo', 'Ruy Lopez',
    'Scotch Game', 'Vienna Game', 'Four Knights Game', "Queen's Gambit", "Queen's Gambit Declined",
    "Queen's Pawn Game: London System", "Queen's Pawn Game: Accelerated London System",
    "Queen's Pawn Game: Colle System", 'Slav Defense', 'Caro-Kann Defense', 'French Defense',
    'Scandinavian Defense', "Petrov's Defense", "King's Indian Defense", "King's Indian Attack",
    'Sicilian Defense: Alapin Variation', 'French Defense: Exchange Variation',
    'Caro-Kann Defense: Exchange Variation', "Queen's Gambit Declined: Exchange Variation"
  ],

  // Which side an opening is trained as when the usual rule gets it wrong. Exact names.
  side: {
    'Italian Game: Giuoco Piano': 'w', "King's Gambit Accepted": 'w',
    'Danish Gambit Accepted': 'w', 'Blackmar-Diemer Gambit Accepted': 'w',
    'Vienna Gambit, with Max Lange Defense': 'w', 'Latvian Gambit Accepted': 'b',
    'Englund Gambit Declined': 'b',
    "King's Indian Attack, with Bf5": 'w', "King's Indian Attack, with e6": 'w',
    "Petrov's Defense: Stafford Gambit Accepted": 'b', 'Indian Defense: Budapest Gambit Accepted': 'b',
    'Sicilian Defense: Smith-Morra Gambit Accepted': 'w'
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = window.OPENING_TAGS;
