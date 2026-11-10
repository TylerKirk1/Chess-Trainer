# Open File

A free website for learning chess openings. Pick an opening, play its moves from memory,
and get told right away whether each move is the book move. After the core moves of an
opening you work through every deeper named line that branches from it.

Live site: GitHub Pages (see repo settings). Locally, open `index.html` in a browser,
or `dist/open-file.html` (the trainer in one file). No build step or server is needed.

## Pages

- `index.html` – opening picker and trainer. `#<opening-id>` in the URL opens one opening directly,
  for example `index.html#sicilian-defense-najdorf-variation`.
- `play.html` – a free board for playing both sides.

## Finding an opening

- Search by name, ECO code or moves.
- Filter by the side you play, White's first move, and character: Sound, Beginner-friendly, Trappy, Gambit, Offbeat, Started.
- Openings are sorted with the most played first. Lines that match your filters but sit inside
  another opening (for example White's options against the Sicilian) are listed in a second group.

The source list has names and moves only, so the character labels and the sort order are hand-written
in `data/tags.js`. They are a rough guide based on each opening's reputation, not engine analysis.

## How training works

- The opening you pick is drilled first ("Core moves"), then each deeper named line that continues it.
- The opponent's moves play themselves. Your moves are checked against the line.
- A right move gets a check mark on its square, a wrong one a cross, and the piece slides back.
  If the wrong move belongs to another named opening, the site says which.
- Hint (H) highlights the piece to move; press it again to see the move.
- Finishing a line with no mistakes or hints marks it learned. Progress is saved in your browser.

## Code

| File | Job |
| --- | --- |
| `data/openings.js` | 3,865 named lines from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0, public domain). Built by `tools/build-openings.js`, which replays every line through the engine. |
| `data/tags.js` | Hand-written labels: sort order, sound/trappy/beginner lists, regrouping of lines such as the London System. |
| `js/chess-engine.js` | Rules: legal moves, check, castling, en passant, promotion, SAN, draws. No DOM, runs in Node too. |
| `js/board.js` | Board view: draws positions, animates between them, click/drag input, promotion picker. Knows no rules. |
| `js/pieces.js` | The piece set (original SVG shapes). |
| `js/repertoire.js` | Turns the openings list into openings to browse, filter and drill. Works out sides and labels. |
| `js/trainer.js` | The picker (search, filters, cards) and the trainer. |
| `js/app.js` | The free board page. |

## Checks

    node tests/engine.test.js               # perft on 5 standard positions plus rules tests
    node tests/ui.test.js <shots dir>       # Playwright: free board clicks, drags, castling, promotion, mate
    node tests/trainer.test.js <shots dir>  # Playwright: filters, check and cross marks, hints, playing Black
    node tools/build-openings.js            # rebuild data/openings.js from data/src/*.tsv
    node tools/build.js                     # rebuild the single-file pages in dist/
