/* End-to-end smoke test in real Chrome (headless) against a local server.
   Runs the app in demo mode (no network, no login) and walks every route,
   fills the diary form, and checks the mobile layout has no horizontal overflow.
   Usage: node tests/e2e/run.js   (starts its own server on a free port) */

import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART = path.join(ROOT, 'tests/e2e/.artifacts');
mkdirSync(ART, { recursive: true });
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find(existsSync);
if (!CHROME) { console.error('No Chrome found'); process.exit(2); }
const PORT = 8790 + Math.floor(Math.random() * 100);

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const base = `http://127.0.0.1:${PORT}/`;

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? '  ok ' : '  FAIL'} ${msg}`); if (!ok) failures++; };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept()); // beforeunload guard on dirty forms
page.on('requestfailed', (r) => { if (!/fonts\.g/.test(r.url())) errors.push(`request failed: ${r.url()}`); });

const visit = async (hash, wait = '#app h1') => { await page.goto(`${base}?demo=1${hash}`, { waitUntil: 'networkidle0' }); await page.waitForSelector(wait, { timeout: 8000 }); return page.$eval('#app', (el) => el.innerText); };
const text = () => page.$eval('#app', (el) => el.innerText);

try {
  await page.setViewport({ width: 1100, height: 900 });
  console.log('Routes (desktop):');
  let t = await visit('#/');
  check(/Read this before you trade/.test(t), 'home: red box');
  check(/repeated mistake/.test(t), 'home: repeated mistake auto-detected');
  check(/Plan for next session/.test(t), 'home: plan for next session');
  check(/Loss budget used/.test(t) || /No page yet/.test(t), 'home: today strip');
  check(/Account balance/i.test(t) && /since/.test(t), 'home: account hero');
  check(/This month/.test(t) && (await page.$$('.mini-stats .kpi')).length === 4, 'home: compact month stats (full detail lives in Analytics)');
  check(/Market brief/.test(t) && /Pivot/.test(t), 'home: market teaser');
  check(/MANDATORY/.test(t) && (await page.$$('.big-checks li')).length >= 5, 'home: mandatory checklist gate renders');
  const upColor = await page.$eval(':root', () => getComputedStyle(document.documentElement).getPropertyValue('--up').trim());
  check(/00B386|00D9A3/i.test(upColor), `theme: Groww-style green accent applied (${upColor})`);
  // checklist gate actually blocks a new trade action
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('notebook.checklist.')) localStorage.removeItem(k); });
  await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('.gatebox');
  check(await page.$eval('.gatebox', (el) => el.textContent.includes('MANDATORY')), 'gate: shows locked when nothing ticked');
  await page.waitForFunction(() => document.querySelectorAll('.tape .t b').length === 3 && !/—/.test(document.querySelector('.tape .t b').textContent), { timeout: 8000 });
  check(true, 'home: live tape filled from the (demo) feed');
  check((await page.$$('.live-line')).length === 2 && /IN TRADE/.test(await text()), 'home: compact live-position lines (full board lives on #/live)');
  check((await page.$$('.plan-row')).length === 0, 'home: no full payoff tables on the dashboard (moved to #/live)');
  check((await page.$$('.section-link')).length === 7, 'home: links out to every section of the site');

  t = await visit('#/live');
  check(/^Live$/m.test(t) || /Live/.test(t), 'live: dedicated page renders');
  check((await page.$$('.chip[href^="#/live?d="]')).length >= 1, 'live: date picker across sessions');
  check((await page.$$('.plan-row')).length === 2 && /Unrealised/.test(t) && /IN TRADE/.test(t), 'live: full trade plans with unrealised P&L');
  check(/Est\. premium|Est\. P&L/i.test(t.replace(/&amp;/g, '&')), 'live: option payoff scenario table on the open position');
  check(await page.$eval('.ticker-wrap', (el) => el.textContent.length > 100), 'live: NSE-style scrolling ticker strip renders');
  check((await page.$$('.tape .t.big')).length === 3, 'live: colourful index tape cards');

  t = await visit('#/playbook');
  check((await page.$$('.mini-stats .kpi')).length === 4, 'playbook: overview stats (active setups, net, best setup)');
  check((await page.$$('.card .spark')).length >= 1, 'playbook: per-setup performance sparkline');
  check(await page.$eval('.rulebook li', (el) => el.textContent.includes('%')), 'playbook: rule compliance % shown per rule');

  t = await visit('#/market');
  check(/Nifty 50/.test(t) && /Global cues/.test(t) && /All Nifty 50 stocks/.test(t), 'market: brief renders');
  check((await page.$$('.stocks-table tbody tr')).length === 20, 'market: stocks table');
  check((await page.$$('#report h2')).length === 4 && (await page.$$('#report table.md')).length === 1, 'market: written report renders with sections and a table');
  check(/Call OI/.test(t) && /ATM straddle/.test(t), 'market: option-chain walls');
  check(/42% positive/.test(t) && /Top news, scored/.test(t) && (await page.$$('.stag')).length >= 8, 'market: sentiment meter, scored news, section tags');
  check((await page.$$('.chart-legend')).length === 1 && (await page.$$('.gauge svg')).length === 1 && (await page.$$('.ladder svg')).length === 1 && (await page.$$('.heat .cell')).length === 20, 'market: price chart, RSI gauge, ladder, heat tiles');
  check((await page.$eval('.ladder', (el) => el.textContent)).includes('now'), 'market: ladder marks the current price');
  check(/Terms explained/.test(t) && /For India/.test(t), 'market: glossary and India read');
  await page.click('th.sort[data-k="rsi"]');
  await page.waitForFunction(() => location.hash.includes('s=rsi'));
  await page.waitForFunction(() => document.querySelector('th.sort[data-k="rsi"]')?.getAttribute('aria-sort') === 'descending');
  check(await page.$eval('.stocks-table tbody tr:first-child .rsi', (el) => el.textContent === '78'), 'market: sort by RSI');

  t = await visit('#/diary');
  check(/Daily trade diary/.test(t) && (await page.$$('.list li')).length > 10, 'diary: list renders with month groups');
  await page.click('.chip[data-f="red"]'); await page.waitForFunction(() => document.querySelector('.chip[data-f="red"]')?.getAttribute('aria-pressed') === 'true');
  check(!(await page.$$('.list .amt.pos')).length, 'diary: red filter hides green days');

  t = await visit('#/analytics');
  check((await page.$$('.kpi')).length >= 12, 'analytics: KPI tiles');
  check((await page.$$('[data-chart="line"] path.line')).length === 2, 'analytics: balance + equity curves drawn');
  check((await page.$$('[data-chart="bars"] path.bar')).length > 10, 'analytics: daily bars drawn');
  check((await page.$$('.cal .cell')).length >= 28, 'analytics: calendar heatmap');
  check(/By setup/.test(t) && /Mistakes, ranked/.test(t), 'analytics: breakdown tables');
  await page.hover('[data-chart="bars"] rect.hit');
  check(await page.$eval('[data-chart="bars"] .tip', (el) => !el.hidden && /%/.test(el.textContent)), 'analytics: bar tooltip on hover');
  await page.click('.chip[href*="r=all"]');
  await page.waitForFunction(() => document.querySelector('.chip[href*="r=all"]')?.getAttribute('aria-pressed') === 'true', { timeout: 5000 });
  check(true, 'analytics: range chip switches');

  t = await visit('#/playbook');
  check(/ORB breakout/.test(t) && /Win rate/.test(t), 'playbook: setups with stats');
  check((await page.$$('.rulebook li')).length === 4, 'playbook: rulebook');
  await page.type('#ruleForm input', 'No revenge trades'); await page.click('#ruleForm button');
  await page.waitForFunction(() => document.querySelectorAll('.rulebook li').length === 5);
  check(true, 'playbook: add rule updates list live');

  t = await visit('#/learn');
  check(/Option chain explained/.test(t) && (await page.$('a[href^="https://claude.ai/artifact/"]')) != null, 'learning: note with guide link');
  t = await visit('#/reviews');
  check(/Weekly reviews/.test(t) && /Grade B/.test(t), 'reviews: list');
  t = await visit('#/settings');
  check(/Risk budget/.test(t) && /= ₹3,000 per trade/.test(t), 'settings: risk budget computed');

  console.log('Diary form:');
  await visit('#/diary/new');
  const dateVal = '2020-01-06';
  await page.$eval('[name=date]', (el, v) => { el.value = v; }, dateVal);
  await page.type('[name=title]', 'E2E test day');
  await page.type('.trade [name=instrument]', 'NIFTY 25000 CE');
  await page.type('.trade [name=qty]', '10'); await page.type('.trade [name=entry]', '100'); await page.type('.trade [name=stop]', '95'); await page.type('.trade [name=exit]', '110');
  await page.waitForFunction(() => /\+₹100/.test(document.querySelector('.trade [data-calc]').textContent));
  const calc = await page.$eval('.trade [data-calc]', (el) => el.textContent);
  check(/\+₹100/.test(calc) && /Risk ₹50/.test(calc) && /\+2\.00R/.test(calc), `form: live calc (${calc.replace(/\s+/g, ' ').trim()})`);
  await page.click('#addMistake'); await page.type('.mistake [name=tag]', 'Exited too early');
  await page.click('#tickAll'); await page.click('[name=rule]'); // all ticked, then untick the first
  await page.$eval('[name=next_day_strategy]', (el) => { el.value = 'Only ORB, max 2 trades'; });
  await page.click('#addWatch'); await page.type('.watch-row [name=instrument]', 'NIFTY'); await page.select('.watch-row [name=bias]', 'bullish');
  await page.type('[name=charges]', '40');
  await page.click('#df [type=submit]');
  await page.waitForFunction((d) => location.hash === `#/diary/${d}`, {}, dateVal);
  await page.waitForSelector('.bigpnl');
  t = await text();
  check(/\+₹60/.test(t) && /gross/.test(t) && /\+₹100/.test(t), 'form → day page: net ₹60 after ₹40 charges, gross ₹100');
  check(/repeated ×/.test(t), 'day page: mistake marked as repeated');
  check(/Rules/.test(t) && /3\/4 · 75%/.test(t), 'day page: rules 3/4 followed');
  check(/Only ORB, max 2 trades/.test(t) && /bullish/.test(t), 'day page: strategy + watchlist');
  check(/\+2\.00R/.test(t), 'day page: R column');

  await page.goto(`${base}?demo=1#/diary/new`, { waitUntil: 'networkidle0' }); await page.waitForSelector('#df');
  await page.$eval('[name=date]', (el, v) => { el.value = v; }, dateVal);
  await page.type('.trade [name=instrument]', 'X'); await page.click('#df [type=submit]');
  await page.waitForFunction(() => document.querySelector('#err').textContent.length > 0);
  check(/already exists/.test(await page.$eval('#err', (el) => el.textContent)), 'form: duplicate date is explained');

  console.log('Mobile (360px):');
  await visit('#/'); // leave the dirty form before the viewport change reloads
  await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
  for (const h of ['#/', '#/diary', '#/analytics', '#/market', '#/live', '#/diary/new', '#/playbook', '#/settings']) {
    await visit(h);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(over <= 1, `no horizontal overflow at 360px on ${h} (${over}px)`);
  }
  await visit('#/'); await page.screenshot({ path: path.join(ART, 'home-mobile.png'), fullPage: true });
  await page.setViewport({ width: 1100, height: 900 });
  await visit('#/analytics'); await page.screenshot({ path: path.join(ART, 'analytics.png'), fullPage: true });
  await visit('#/'); await page.screenshot({ path: path.join(ART, 'home.png'), fullPage: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await visit('#/analytics'); await page.screenshot({ path: path.join(ART, 'analytics-dark.png'), fullPage: true });

  console.log('Real config (no demo): login page + CSP:');
  await page.emulateMediaFeatures([]);
  await page.goto(base, { waitUntil: 'networkidle0' }); await page.waitForSelector('#lg');
  check(await page.$eval('#app h1', (el) => /Sign in/.test(el.textContent)), 'login page renders with real config');
  const csp = await page.evaluate(async () => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) => violations.push(e.blockedURI));
    const cfg = window.NOTEBOOK_CONFIG;
    try { const r = await fetch(`${cfg.supabaseUrl}/auth/v1/settings`, { headers: { apikey: cfg.supabaseAnonKey } }); return { status: r.status, violations }; }
    catch (e) { return { error: e.message, violations }; }
  });
  check(csp.status === 200 && !csp.violations.length, `CSP allows Supabase (auth settings HTTP ${csp.status})`);
} catch (e) {
  console.error('  EXCEPTION', e); failures++;
} finally {
  await browser.close(); server.kill();
}
const real = errors.filter((e) => !/favicon|ERR_INTERNET|net::ERR_/.test(e));
check(!real.length, `no console/page errors (${real.length})`);
for (const e of real) console.log('     ', e);
console.log(failures ? `\n${failures} check(s) failed` : '\nAll e2e checks passed');
process.exit(failures ? 1 : 0);
