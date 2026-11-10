// Draws img/preview.png (1200x630), the picture chat apps show when someone
// shares the pool link: the app icon, the title and the current top 3.
// Run by the daily GitHub job after the scores update. If it fails, the last
// committed img/preview.png is used instead.
//
//   node tools/preview.js
//   CHROME_PATH=/usr/bin/google-chrome node tools/preview.js   (use an installed Chrome)
'use strict';
const fs = require('fs');
const path = require('path');

let pw;
try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }

const ROOT = path.join(__dirname, '..');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function main() {
  const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/standings.json'), 'utf8'));
  const icon = fs.readFileSync(path.join(ROOT, 'img/icon-512.png')).toString('base64');
  const ranks = D.entries.map((e) => e.regRank);
  const label = (r) => (ranks.filter((x) => x === r).length > 1 ? 'T' : '') + r;
  const top = D.entries.slice().sort((a, b) => a.regRank - b.regRank || a.name.localeCompare(b.name)).slice(0, 3);
  const when = new Date(D.checkedAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  const BADGE = { leader: '👑', hot: '🔥', mover: '📈' };
  const rows = D.gamesPlayed
    ? top.map((e) => `<div class="row"><span class="rk">${label(e.regRank)}</span><span class="nm">${esc(e.name)} ${(e.badges || []).map((k) => BADGE[k]).join('')}</span><span class="pt">${e.regPts}</span></div>`).join('')
    : '<div class="row"><span class="nm">Season tips off soon</span></div>';

  const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@600;800&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Inter, Arial, sans-serif; color: #fff;
    background: radial-gradient(ellipse at 30% 0%, #1c2a5c, #0f1530 60%, #080b1c); position: relative; }
  .gold { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: #ffc53d; }
  .wrap { display: flex; gap: 56px; align-items: center; padding: 64px 70px; height: 616px; }
  .icon { width: 300px; height: 300px; border-radius: 66px; box-shadow: 0 18px 40px rgba(0,0,0,.45); flex: none; }
  .right { flex: 1; min-width: 0; }
  h1 { font: 400 92px/0.95 "Bebas Neue", Impact, sans-serif; letter-spacing: 3px; text-shadow: 5px 5px 0 #2f6fe4; white-space: nowrap; }
  h1 span { color: #ffc53d; text-shadow: 5px 5px 0 #000; }
  .sub { font-weight: 600; font-size: 26px; color: #c9d3ef; margin: 14px 0 26px; }
  .board { background: #000; border: 5px solid #2a2f44; border-radius: 20px; padding: 14px 26px; box-shadow: inset 0 0 30px rgba(255,197,61,.18); }
  .row { display: grid; grid-template-columns: 70px 1fr auto; align-items: baseline; padding: 6px 0; border-top: 2px dashed #22283c; }
  .row:first-child { border-top: 0; }
  .rk { font: 400 40px/1 "Bebas Neue", sans-serif; color: #8fa0cc; }
  .nm { font: 400 52px/1 "Bebas Neue", sans-serif; letter-spacing: 2px; color: #ffc53d; text-shadow: 0 0 12px rgba(255,197,61,.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pt { font: 400 52px/1 "Bebas Neue", sans-serif; color: #ffc53d; text-shadow: 0 0 12px rgba(255,197,61,.7); }
</style></head><body>
<div class="wrap">
  <img class="icon" src="data:image/png;base64,${icon}" alt="">
  <div class="right">
    <h1>HOOPS POOL <span>${esc(D.season)}</span></h1>
    <div class="sub">Salary-cap pool · standings as of ${esc(when)}</div>
    <div class="board">${rows}</div>
  </div>
</div>
<div class="gold"></div>
</body></html>`;

  const opts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  const browser = await pw.chromium.launch(opts);
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]));
    await page.screenshot({ path: path.join(ROOT, 'img/preview.png') });
  } finally {
    await browser.close();
  }
  console.log('Wrote img/preview.png');
}

main().catch((err) => {
  console.error('Preview picture not drawn (the previous one stays): ' + err.message);
  process.exit(1);
});
