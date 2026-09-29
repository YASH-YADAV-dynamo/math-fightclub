import { mkdirSync } from "fs";
// Drives the game in headless Chrome: collects console errors + screenshots.
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://localhost:4173/';
const out = process.env.OUT || 'screenshots';
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--window-size=1280,720', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await page.goto(url, { waitUntil: 'networkidle2' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = async (k, ms = 60) => { await page.keyboard.down(k); await wait(ms); await page.keyboard.up(k); };
await wait(3500);
await page.screenshot({ path: out + '/01_title.png' });
await press('KeyJ'); await wait(700);
await page.screenshot({ path: out + '/02_select.png' });
await press('KeyD'); await wait(1200);
await page.screenshot({ path: out + '/03_select_pi.png' });
await press('KeyA'); await wait(300);
await press('KeyJ'); await wait(1500);
await page.screenshot({ path: out + '/04_vs.png' });
await wait(2600);
await page.screenshot({ path: out + '/05_round.png' });
await wait(1400);
// fight: walk in and attack
await page.keyboard.down('KeyD'); await wait(700); await page.keyboard.up('KeyD');
for (let i = 0; i < 3; i++) { await press('KeyJ', 40); await wait(120); }
await page.screenshot({ path: out + '/06_fight.png' });
await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await press('KeyJ'); await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD');
await wait(600);
await page.screenshot({ path: out + '/07_beam.png' });
await press('KeyK'); await wait(150); await press('KeyK'); await wait(200);
await page.screenshot({ path: out + '/08_djump.png' });
await wait(4000);
await page.screenshot({ path: out + '/09_later.png' });
await press('KeyU'); await wait(500);
await page.screenshot({ path: out + '/10_super.png' });
await press('Escape'); await wait(400);
await page.screenshot({ path: out + '/11_pause.png' });
console.log(errors.slice(0, 30).join('\n') || 'NO ERRORS');
await browser.close();
