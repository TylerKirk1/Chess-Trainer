// Browser check of the opening trainer: node tests/trainer.test.js <screenshot dir>
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '.';
const url = 'file://' + path.resolve(__dirname, '../index.html');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts/.test(m.text())) errors.push(m.text()); });
  const check = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
  await page.goto(url);
  check(await page.locator('.starter').count() >= 12, 'starter cards render');
  check(await page.locator('.family').count() === 149, '149 families listed');
  await page.screenshot({ path: out + '/home.png' });
  await page.fill('#search', 'najdorf');
  check(await page.locator('#search-results .entry').count() > 3, 'search finds Najdorf lines');
  await page.fill('#search', '');

  await page.click('.starter >> text=Giuoco Piano');
  await page.waitForTimeout(200);
  check(!(await page.locator('#view-train').isHidden()), 'trainer opens from starter card');
  const box = await page.locator('#board').boundingBox();
  const orient = () => page.evaluate(() => window.openFile.view.orientation);
  const center = async sq => {
    const f = 'abcdefgh'.indexOf(sq[0]), r = +sq[1], o = await orient();
    const x = o === 'w' ? f : 7 - f, y = o === 'w' ? 8 - r : r - 1;
    return { x: box.x + (x + 0.5) * box.width / 8, y: box.y + (y + 0.5) * box.height / 8 };
  };
  const play = async (a, b) => { let p = await center(a); await page.mouse.click(p.x, p.y); p = await center(b); await page.mouse.click(p.x, p.y); };
  const st = () => page.evaluate(() => { const t = window.openFile.state(); return { ply: t.ply, idx: t.idx, done: t.done, mistakes: t.mistakes, line: t.lines[t.idx].moves.join(' ') }; });

  console.log('     line:', (await st()).line);
  await play('d2', 'd4'); // wrong first move
  await page.waitForTimeout(300);
  check((await st()).ply === 0 && (await st()).mistakes === 1, 'wrong move rejected and counted');
  check((await page.locator('#fb-title').textContent()).includes('different line'), 'wrong but known move named: ' + await page.locator('#fb-body').textContent());
  await page.screenshot({ path: out + '/wrong.png' });
  // play the main line through using the engine to find squares
  for (let guard = 0; guard < 40; guard++) {
    const s = await st();
    if (s.done) break;
    const mv = await page.evaluate(() => { const t = window.openFile.state(); const g = window.openFile.game;
      if (g.turn() !== t.side) return null; const san = t.lines[t.idx].moves[t.ply]; return g.moves({ verbose: true }).find(m => m.san === san); });
    if (!mv) { await page.waitForTimeout(250); continue; }
    await play(mv.from, mv.to);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(700);
  const s = await st();
  check(s.done, 'main line completed');
  check((await page.locator('#fb-title').textContent()) === 'Line complete', 'completion with mistakes shown as practiced');
  await page.screenshot({ path: out + '/done.png' });
  await page.click('#btn-restart');
  await page.waitForTimeout(100);
  await page.keyboard.press('h'); await page.keyboard.press('h');
  check((await page.locator('#fb-body').textContent()) === 'The move is e4.', 'two-step hint gives the move');
  await page.click('#btn-next');
  await page.waitForTimeout(100);
  check((await st()).idx === 1, 'next line advances');

  // Play as Black: opponent moves first automatically
  await page.goto(url + '#sicilian-defense-najdorf-variation');
  await page.waitForTimeout(1200);
  check(await orient() === 'b', 'defense trains as Black with board flipped');
  check((await st()).ply === 1, 'White first move auto-played');
  await page.screenshot({ path: out + '/black.png' });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await phone.goto(url + '#french-defense');
  await phone.waitForTimeout(800);
  const sw = await phone.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= 390, 'no horizontal scroll on phone (' + sw + ')');
  await phone.screenshot({ path: out + '/phone.png', fullPage: true });
  await phone.goto(url);
  const sw2 = await phone.evaluate(() => document.documentElement.scrollWidth);
  check(sw2 <= 390, 'home fits phone (' + sw2 + ')');
  check(errors.length === 0, 'no console errors ' + errors.join('; '));
  await browser.close();
})();
