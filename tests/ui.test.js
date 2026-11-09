// Browser check: node tests/ui.test.js  (needs Playwright with Chromium)
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../play.html'));
  const box = await page.locator('#board').boundingBox();
  const center = sq => {
    const f = 'abcdefgh'.indexOf(sq[0]), r = +sq[1];
    return { x: box.x + (f + 0.5) * box.width / 8, y: box.y + (8 - r + 0.5) * box.height / 8 };
  };
  const click = async sq => { const c = center(sq); await page.mouse.click(c.x, c.y); };
  const drag = async (a, b) => {
    const p = center(a), q = center(b);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 5 });
    await page.mouse.move(q.x, q.y, { steps: 5 }); await page.mouse.up();
  };
  const fen = () => page.evaluate(() => window.openFile.game.fen());
  const check = (cond, msg) => { if (!cond) { console.log('FAIL ' + msg); process.exitCode = 1; } else console.log('ok   ' + msg); };

  await click('e2'); await click('e4');
  await drag('e7', 'e5');
  await click('g1'); await click('f3');
  await drag('b8', 'c6');
  await click('f1'); await click('c4');
  check((await fen()).startsWith('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b'), 'click and drag moves');
  await drag('g8', 'e4'); // illegal
  check((await fen()).includes(' b '), 'illegal drop rejected');
  await page.waitForTimeout(300);
  const pieceCount = await page.locator('.board-pieces .piece').count();
  check(pieceCount === 32, 'piece elements match position (' + pieceCount + ')');
  await click('f6'); // g8 is still selected after the rejected drag
  await click('e1'); await click('g1'); // castle
  await page.waitForTimeout(300);
  check((await fen()).includes('RNBQ1RK1'), 'castling via king click');
  await page.locator('#btn-flip').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/desktop.png' });
  await page.locator('#btn-flip').click();
  // Promotion position
  await page.evaluate(() => { window.openFile.game.load('8/1P4k1/8/8/8/8/8/4K3 w - - 0 1'); window.openFile.sync(); });
  await page.waitForTimeout(300);
  await click('b7'); await click('b8');
  check(await page.locator('.board-promo').isVisible(), 'promotion picker opens');
  await page.screenshot({ path: out + '/promo.png' });
  await page.locator('.promo-btn').nth(1).click();
  await page.waitForTimeout(300);
  check((await fen()).startsWith('1N6'), 'underpromotion to knight');
  check((await page.locator('.board-pieces .piece').count()) === 3, 'pawn replaced by knight');
  // Checkmate status
  await page.evaluate(() => { const g = window.openFile.game; g.reset(); ['f3','e5','g4','Qh4#'].forEach(m => g.move(m)); window.openFile.sync(); });
  await page.waitForTimeout(300);
  check((await page.locator('#status-text').textContent()) === 'Checkmate. Black wins', 'checkmate status');
  await page.screenshot({ path: out + '/mate.png' });
  // Phone, dark
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await phone.goto('file://' + path.resolve(__dirname, '../play.html'));
  const sw = await phone.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= 390, 'no horizontal scroll on phone (' + sw + ')');
  await phone.screenshot({ path: out + '/phone-dark.png', fullPage: true });
  check(errors.length === 0, 'no console errors ' + errors.join('; '));
  await browser.close();
})();
