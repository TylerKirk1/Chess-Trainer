// Inlines CSS and JS into a single-file page: node tools/build.js
// dist/open-file.html   the opening trainer as one file you can double-click to open
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
// The free board is a separate page, so the single-file builds leave its link out.
const index = read('index.html').replace(/<a href="play.html"[^>]*>Free board<\/a>/, '');
const body = index.split('<!-- app:start -->')[1].split('<!-- app:end -->')[0].trim();
const fonts = index.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const css = read('css/style.css');
const js = ['data/openings.js', 'js/chess-engine.js', 'js/pieces.js', 'js/board.js', 'js/repertoire.js', 'js/trainer.js'].map(read).join('\n');
const head = `<title>Open File Chess</title>\n${fonts}\n<style>\n${css}</style>`;
const scripts = `<script>\n${js}</script>`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/open-file.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n${scripts}\n</body>\n</html>\n`);
console.log('built dist/open-file.html');
