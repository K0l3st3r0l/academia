// Footage of the real lobby for the film's second part («qué harás aquí»): one clip per line of
// the tutorial, recorded from the standalone page, so its wallet is the local one.
// Usage: node grabar.cjs [name ...]   (writes juego/<name>.webm; montar.py cuts them to fit)
const { chromium } = require('/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PAGE = 'file:///root/apps/academia/art/academia/lobby/academia.html';
const OUT = path.join(__dirname, 'juego');
const wait = ms => new Promise(r => setTimeout(r, ms));
const hold = async (page, key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); };
const place = (page, x, y) => page.evaluate(([x, y]) => { const p = Academia.player; p.x = x; p.y = y; p.vx = p.vy = 0; }, [x, y]);

const SHOTS = {
  async 't1-explorar'(page) {
    await place(page, 900, 780);
    await wait(600);
    await page.keyboard.down('Shift');
    await hold(page, 'ArrowRight', 1400);
    await page.keyboard.press('Space');
    await hold(page, 'ArrowRight', 900);
    await page.keyboard.press('Space'); await wait(250); await page.keyboard.press('Space');
    await hold(page, 'ArrowRight', 1600);
    await page.keyboard.up('Shift');
    await hold(page, 'ArrowLeft', 1500);
    await page.keyboard.press('Space');
    await wait(2500);
  },
  async 't2-desafios'(page) {
    await page.evaluate(() => Academia.practiceKind('mc', 'intermedio'));
    await wait(5000);
    await page.keyboard.press('ArrowDown'); await wait(900); await page.keyboard.press('ArrowDown');
    await wait(5000);
  },
  async 't3-tienda-banco'(page) {
    await page.evaluate(() => Academia.showShop());
    await wait(1800);
    for (let i = 0; i < 2; i += 1) { await page.keyboard.press('ArrowRight'); await wait(700); }
    await page.keyboard.press('e');
    await wait(3000);
    await page.evaluate(() => { Academia.closeOverlay(); Academia.showBank(10); });
    await wait(2200);
    await page.getByRole('button', { name: 'Depositar' }).click();
    await wait(3500);
  },
  async 't4-copihues'(page) {
    await page.evaluate(() => { Academia.state.copihues = 3; Academia.showShop(0, '', 'copihues'); });
    await wait(1600);
    for (let i = 0; i < 3; i += 1) { await page.keyboard.press('ArrowRight'); await wait(1100); }
    await page.keyboard.press('ArrowLeft'); await wait(800);
    await page.keyboard.press('e');
    await wait(3500);
  },
  // Only the portal itself: in the game its trips still say «Pronto».
  async 't5-portal'(page) {
    await place(page, 2350, 780);
    await wait(500);
    await hold(page, 'ArrowRight', 3200);
    await wait(6500);
  },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
  const browser = await chromium.launch();
  for (const name of names) {
    const dir = fs.mkdtempSync(path.join(OUT, '.rec-'));
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } } });
    // A visitor who already met Estela: no welcome toast or objectives over the footage.
    await context.addInitScript(() => localStorage.setItem('academia:map:v2', JSON.stringify({
      version: 1, tokens: 60, copihues: 0, items: [], chests: [], sparks: [], revealed: [], pieces: [], bank: { balance: 0, lastWeek: Date.now() },
      flags: { welcomed: true, metEstela: true, metMerchant: true, metTempo: true }, settings: { sound: false },
    })));
    const page = await context.newPage();
    const opened = Date.now();
    await page.goto(PAGE);
    await page.waitForFunction(() => window.Academia && document.getElementById('loading').hidden, null, { timeout: 60000 });
    await wait(800);
    const start = (Date.now() - opened) / 1000;
    await SHOTS[name](page);
    await context.close();
    const raw = fs.readdirSync(dir).find(f => f.endsWith('.webm'));
    // The recording begins with the loading screen: keep only the shot.
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', start.toFixed(2), '-i', path.join(dir, raw), '-an', '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', path.join(OUT, `${name}.webm`)]);
    fs.rmSync(dir, { recursive: true });
    console.log(`${name}.webm`);
  }
  await browser.close();
})();
