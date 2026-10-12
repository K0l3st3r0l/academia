const { chromium } = require('/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const [,, file] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('file://' + file); await page.waitForTimeout(5000);
  const measure = async (x) => {
    await page.evaluate((x) => { const p = Academia.player; p.x = x; p.y = 780; p.vx = p.vy = 0; }, x);
    await page.waitForTimeout(1500);
    return page.evaluate(() => new Promise(res => { const times = []; let last = performance.now(); const t0 = last; const f = (now) => { times.push(now - last); last = now; if (now - t0 < 3000) requestAnimationFrame(f); else { times.sort((a, b) => a - b); res({ fps: +(times.length / 3).toFixed(1), p50: +times[times.length >> 1].toFixed(1), p95: +times[Math.floor(times.length * .95)].toFixed(1) }); } }; requestAnimationFrame(f); }));
  };
  console.log('far (x=10)', JSON.stringify(await measure(1000)));
  console.log('bank (x=46)', JSON.stringify(await measure(4600)));
  console.log('portal (x=29)', JSON.stringify(await measure(2900)));
  await browser.close();
})();
