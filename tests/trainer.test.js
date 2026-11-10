// Browser check of the opening picker and trainer: node tests/trainer.test.js <screenshot dir>
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '.';
const url = 'file://' + path.resolve(__dirname, '../index.html');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errors.push(m.text()); });
  const check = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
  const count = sel => page.locator(sel).count();
  await page.goto(url);

  // Picker and filters
  const all = await count('#openings .card');
  check(all > 120, 'every opening has a card (' + all + ')');
  check(await count('#openings .card .mini-board use') > 3000, 'cards show small boards');
  check((await page.locator('#openings .card-name').first().textContent()) === 'Italian Game', 'mainstream openings come first');
  await page.screenshot({ path: out + '/home.png' });

  await page.click('#f-side button[data-v="b"]');
  const black = await count('#openings .card');
  check(black > 20 && black < all, 'Black filter narrows the cards (' + black + ')');
  check((await page.locator('#openings .card-meta').allTextContents()).every(t => t.startsWith('Black')), 'only Black openings are listed');
  check(await count('#line-groups .group') > 0, "Black's options inside White's openings are listed");
  await page.click('#f-first button[data-v="d4"]');
  const names = await page.locator('#openings .card-name').allTextContents();
  check(names.includes("King's Indian Defense") && !names.includes('Sicilian Defense'), '1.d4 filter keeps the right defenses');
  await page.click('#clear-filters');
  check(await count('#openings .card') === all, 'clearing filters restores every card');

  await page.click('#f-tags [data-tag="trappy"]');
  const trappy = await page.locator('#openings .card-name').allTextContents();
  check(trappy.includes('Stafford Gambit') && trappy.includes('Englund Gambit') && !trappy.includes('Ruy Lopez'), 'Trappy lists the trap openings');
  check((await page.locator('#line-groups').textContent()).includes("Noah's Ark Trap"), 'Trappy finds named traps inside solid openings');
  await page.screenshot({ path: out + '/trappy.png', fullPage: true });
  await page.click('#f-tags [data-tag="sound"]');
  check(!(await page.locator('#no-results').isHidden()), 'conflicting labels show an explanation');
  await page.click('#clear-filters');
  await page.click('#f-tags [data-tag="beginner"]');
  check((await page.locator('#openings .card-name').allTextContents()).includes('London System'), 'Beginner-friendly includes the London System');
  await page.click('#clear-filters');

  await page.fill('#search', 'najdorf');
  check((await page.locator('#line-groups .gl-name').first().textContent()) === 'Najdorf Variation', 'search finds the Najdorf');
  await page.fill('#search', '');

  // Trainer
  await page.click('#openings .card >> text=Italian Game');
  await page.waitForTimeout(200);
  check(!(await page.locator('#view-train').isHidden()), 'trainer opens from a card');
  const box = await page.locator('#board').boundingBox();
  const orient = () => page.evaluate(() => window.openFile.view.orientation);
  const center = async sq => {
    const f = 'abcdefgh'.indexOf(sq[0]), r = +sq[1], o = await orient();
    const x = o === 'w' ? f : 7 - f, y = o === 'w' ? 8 - r : r - 1;
    return { x: box.x + (x + 0.5) * box.width / 8, y: box.y + (y + 0.5) * box.height / 8 };
  };
  const play = async (a, b) => { let p = await center(a); await page.mouse.click(p.x, p.y); p = await center(b); await page.mouse.click(p.x, p.y); };
  const st = () => page.evaluate(() => { const t = window.openFile.state(); return { ply: t.ply, idx: t.idx, done: t.done, mistakes: t.mistakes, line: t.lines[t.idx].moves.join(' ') }; });

  await play('d2', 'd4'); // wrong first move
  await page.waitForTimeout(250);
  check((await st()).ply === 0 && (await st()).mistakes === 1, 'wrong move rejected and counted');
  check(await count('.board-badge.badge-bad') === 1, 'a cross pops on the square of a wrong move');
  check((await page.locator('#fb-title').textContent()).includes('different line'), 'wrong but known move named: ' + await page.locator('#fb-body').textContent());
  await page.screenshot({ path: out + '/wrong.png' });
  await page.waitForTimeout(1500);
  check(await count('.board-badge') === 0, 'the cross fades and is removed');
  await play('e2', 'e4');
  await page.waitForTimeout(250);
  check(await count('.board-badge.badge-good') === 1, 'a check mark pops on the square of a right move');
  await page.screenshot({ path: out + '/right.png' });
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
  check((await st()).done, 'core line completed');
  check((await page.locator('#fb-title').textContent()) === 'Line complete', 'a run with a mistake is marked practiced, not learned');
  await page.screenshot({ path: out + '/done.png' });
  await page.click('#btn-restart');
  await page.waitForTimeout(100);
  await page.keyboard.press('h'); await page.keyboard.press('h');
  check((await page.locator('#fb-body').textContent()) === 'The move is e4.', 'two-step hint gives the move');
  await page.screenshot({ path: out + '/hint.png' });
  await page.click('#btn-next');
  await page.waitForTimeout(100);
  check((await st()).idx === 1, 'next line advances');

  await page.click('.back');
  await page.waitForTimeout(100);
  check(await count('#continue-cards .card') === 1, 'the picker offers to continue the opening just trained');
  await page.click('#f-tags [data-tag="started"]');
  check(await count('#openings .card') === 1, 'Started filter lists it');

  // Play as Black: opponent moves first automatically
  await page.goto(url + '#sicilian-defense-najdorf-variation');
  await page.waitForTimeout(1200);
  check(await orient() === 'b', 'a defense trains as Black with the board flipped');
  check((await st()).ply === 1, "White's first move plays itself");
  await page.goto(url + '#sicilian-defense-alapin-variation');
  await page.waitForTimeout(300);
  check(await orient() === 'w', "White's weapon against a defense trains as White");
  await page.goto(url + '#queens-pawn-game-london-system');
  await page.waitForTimeout(300);
  check((await page.locator('#t-family').textContent()) === 'London System' && await count('#lines li') > 8, 'London System gathers its lines from every move order');
  await page.screenshot({ path: out + '/london.png' });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await phone.goto(url + '#french-defense');
  await phone.waitForTimeout(800);
  let sw = await phone.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= 390, 'trainer fits a phone (' + sw + ')');
  await phone.screenshot({ path: out + '/phone-train.png', fullPage: true });
  await phone.goto(url);
  await phone.click('#f-side button[data-v="w"]');
  sw = await phone.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= 390, 'picker fits a phone (' + sw + ')');
  await phone.screenshot({ path: out + '/phone-home.png' });
  check(errors.length === 0, 'no console errors ' + errors.join('; '));
  await browser.close();
})();
