import { mkdirSync } from "fs";
// Plays through 2 KO rounds → stage clear → next stage, then training mode.
import puppeteer from 'puppeteer-core';
const out = process.env.OUT || 'screenshots';
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-gl=angle', '--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle2' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = async (k, ms = 60) => { await page.keyboard.down(k); await wait(ms); await page.keyboard.up(k); };
const koEnemy = () => page.evaluate(() => {
  const s = window.__AXIOM.scene.getScene('Fight'); const [me, en] = s.world.fighters;
  en.hp = 1; en.x = me.x + me.facing * 60; en.state = 'idle'; en.invuln = 0;
});
await wait(3000);
await press('KeyJ'); await wait(500); await press('KeyJ'); await wait(6000);
for (let r = 0; r < 2; r++) {
  for (let k = 0; k < 40; k++) { // wait for the round intro to finish
    const ph = await page.evaluate(() => window.__AXIOM.scene.getScene('Fight').world.phase);
    if (ph === 'fight') break; await wait(200);
  }
  for (let k = 0; k < 8; k++) {
    const phase = await page.evaluate(() => window.__AXIOM.scene.getScene('Fight').world.phase);
    if (phase !== 'fight') break;
    await koEnemy(); await press('KeyJ'); await wait(250);
  }
  await page.screenshot({ path: `${out}/f_ko${r}.png` });
  await wait(5200);
}
await page.screenshot({ path: `${out}/f_result.png` });
await press('KeyJ'); await wait(1600);
await page.screenshot({ path: `${out}/f_stage2_vs.png` });
await wait(4500);
await page.screenshot({ path: `${out}/f_stage2.png` });
await press('Escape'); await wait(300); await press('KeyS'); await press('KeyS'); await press('KeyS'); await press('KeyJ'); await wait(1500);
await press('KeyS'); await wait(100); await press('KeyJ'); await wait(500); await press('KeyJ'); await wait(1500);
await press('KeyT'); await wait(200);
await page.keyboard.down('KeyD'); await wait(600); await page.keyboard.up('KeyD');
await press('KeyU'); await wait(1400);
await page.screenshot({ path: `${out}/f_training.png` });
console.log(errors.join('\n') || 'NO ERRORS');
await browser.close();
