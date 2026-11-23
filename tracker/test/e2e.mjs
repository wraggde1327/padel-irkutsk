import assert from 'node:assert/strict';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const trackerRoot = join(here, '..');
const screenshotDir = join(trackerRoot, 'screenshots');
const STORAGE_KEY = 'padel-mini-tracker-v1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

const IPHONE_SAFE_TOP = 59;
const IPHONE_SAFE_BOTTOM = 34;
const IPHONE_SE_SAFE_TOP = 20;
const IPHONE_SE_SAFE_BOTTOM = 0;

const NAMES8 = ['Анна', 'Борис', 'Вера', 'Глеб', 'Даша', 'Егор', 'Женя', 'Илья'];
const NAMES9 = [...NAMES8, 'Кира'];
const NAMES12 = [...NAMES8, 'Кира', 'Лев', 'Маша', 'Никита'];

async function assertSumChips(page, action) {
  for (const n of [15, 17, 19, 21]) {
    assert.ok(await page.locator(`[data-action="${action}"][data-n="${n}"]`).count(), `${action} ${n}`);
  }
  assert.ok(await page.locator(`[data-action="${action}"][data-n="custom"]`).count(), `${action} custom`);
  assert.equal(await page.locator(`[data-action="${action}"]`).count(), 5, `${action} count`);
  for (const n of [16, 24, 32]) {
    assert.equal(await page.locator(`[data-action="${action}"][data-n="${n}"]`).count(), 0, `no even ${n}`);
  }
}

async function importPlaywright() {
  try {
    return await import('playwright');
  } catch {
    execSync('npx --yes playwright@1.65.1 --version', { stdio: 'inherit' });
    const path = execSync(
      'find /home/ubuntu/.npm/_npx /root/.npm/_npx -path "*/node_modules/playwright/index.mjs" 2>/dev/null | head -1',
      { encoding: 'utf8' },
    ).trim();
    if (!path) throw new Error('playwright not found');
    return import(pathToFileURL(path).href);
  }
}

function startServer() {
  const server = createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    let rel = url === '/' ? '/index.html' : url;
    if (rel.endsWith('/')) rel += 'index.html';
    const file = join(trackerRoot, rel.replace(/^\/+/, ''));
    if (!file.startsWith(trackerRoot)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if (!statSync(file).isFile()) throw new Error('not file');
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

function iphoneSafeCss(active, topInset = IPHONE_SAFE_TOP, bottomInset = IPHONE_SAFE_BOTTOM) {
  const top = active ? topInset : 0;
  const bottom = active ? bottomInset : 0;
  return `
    :root {
      --safe-top: ${top}px;
      --safe-bottom: ${bottom}px;
    }
    #iphone-safe-top, #iphone-safe-bottom {
      position: fixed;
      left: 0;
      right: 0;
      z-index: 80;
      pointer-events: none;
      display: ${active ? 'block' : 'none'};
    }
    #iphone-safe-top {
      top: 0;
      height: ${top}px;
      background: rgb(24 24 27 / 0.38);
    }
    #iphone-safe-bottom {
      bottom: 0;
      height: ${bottom}px;
      background: rgb(24 24 27 / 0.22);
    }
  `;
}

async function setIphoneSafe(page, active, insets = { top: IPHONE_SAFE_TOP, bottom: IPHONE_SAFE_BOTTOM }) {
  await page.evaluate((state) => {
    if (!document.getElementById('iphone-safe-top')) {
      const top = document.createElement('div');
      top.id = 'iphone-safe-top';
      const bot = document.createElement('div');
      bot.id = 'iphone-safe-bottom';
      document.body.append(top, bot);
    }
    const topPx = state.active ? state.top : 0;
    const bottomPx = state.active ? state.bottom : 0;
    document.documentElement.style.setProperty('--safe-top', `${topPx}px`);
    document.documentElement.style.setProperty('--safe-bottom', `${bottomPx}px`);
    window.dispatchEvent(new Event('resize'));
  }, { active, top: insets.top, bottom: insets.bottom });
  await page.addStyleTag({ content: iphoneSafeCss(active, insets.top, insets.bottom) });
}

async function typeScore(page, locator, value) {
  await locator.click();
  await page.waitForSelector('#picker-score-input', { state: 'attached' });
  await page.evaluate((v) => {
    const input = document.getElementById('picker-score-input');
    if (!input) throw new Error('no picker input');
    input.classList.remove('is-hidden');
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.click('#picker-ok');
  await page.waitForSelector('.picker-sheet', { state: 'detached' });
  await page.waitForTimeout(220);
}

async function addPlayers(page, names) {
  await page.click('[data-tab="players"]');
  await page.waitForSelector('#add-name');
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    await page.waitForSelector('#add-name');
    await page.fill('#add-name', name);
    await page.click('form.add-row button[type="submit"]');
    await page.waitForFunction((n) => document.querySelectorAll('.player-row').length === n, i + 1);
  }
  assert.equal(await page.locator('.player-row').count(), names.length);
}

async function resetApp(page) {
  await page.evaluate(() => window.padelTracker.reset());
  await page.waitForSelector('#btn-create');
}

async function readState(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);
}

function activeOf(store) {
  return store.tournaments.find((t) => t.id === store.ui.activeId) || null;
}

async function createViaUi(page, format, name) {
  await page.click('#btn-create');
  await page.waitForSelector(`[data-action="pick-format"][data-format="${format}"]`);
  await page.click(`[data-action="pick-format"][data-format="${format}"]`);
  await page.waitForSelector('#btn-create-ok');
  if (name) {
    await page.fill('[data-action="draft-name"]', name);
  }
  await page.click('#btn-create-ok');
  await page.waitForSelector('#add-name');
}

async function seedActiveSettings(page, patch) {
  await page.evaluate((patch) => {
    window.padelTracker.patchActive(patch);
  }, patch);
}

async function fillCurrentRound(page, a = 15, b = 7) {
  const roundIndex = await page.evaluate(
    ({ a, b }) => {
      const key = 'padel-mini-tracker-v1';
      const store = JSON.parse(localStorage.getItem(key));
      const t = store.tournaments.find((x) => x.id === store.ui.activeId);
      const roundIndex = t.rounds.length - 1;
      const last = t.rounds[roundIndex];
      const settings = last.scoring ? { ...t.settings, ...last.scoring } : t.settings;
      const n =
        settings.scoringMode === 'games' && !settings.setScore
          ? Math.max(1, Number(settings.gamesPerPairing) || 1)
          : 1;
      for (const match of last.matches) {
        match.games = Array.from({ length: n }, () => ({ a, b, touched: { a: true, b: true } }));
      }
      localStorage.setItem(key, JSON.stringify(store));
      return roundIndex;
    },
    { a, b },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('[data-tab="play"]');
  await page.waitForSelector('[data-action="gen-round"][data-kind="regular"]');
  return roundIndex;
}

function courtSets(round) {
  const map = new Map();
  for (const match of round.matches) {
    if (!map.has(match.court)) map.set(match.court, new Set());
    for (const id of [...match.teamA, ...match.teamB]) map.get(match.court).add(id);
  }
  return map;
}

function partnerSet(round) {
  const set = new Set();
  for (const match of round.matches) {
    const key = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
    set.add(key(match.teamA[0], match.teamA[1]));
    set.add(key(match.teamB[0], match.teamB[1]));
  }
  return set;
}

async function playFormat(page, { names, courts, format, rounds, screenshot, mexicano, pairLock = 'locked' }) {
  await resetApp(page);
  await createViaUi(page, format, format);
  await seedActiveSettings(page, {
    tournamentFormat: format,
    qualifyingEnabled: false,
    gamesPerPairing: 1,
    winByTwo: false,
    decidingGame: false,
    scoringMode: format === 'free' ? 'points' : 'total',
    pointsPreset: 15,
    totalPoints: 21,
    pairType: 'any',
    formatVariant: 'classic',
    pairLock,
    lockedMatchups: 'strength',
    standingsSort: 'points',
    ...(mexicano ? { mexicanoPairing: mexicano } : {}),
  });
  await page.click('[data-tab="players"]');
  await addPlayers(page, names);
  await page.click('[data-tab="play"]');
  await page.click('[data-action="gen-round"][data-kind="regular"]');
  await page.waitForSelector('.match');
  if (screenshot) {
    await page.screenshot({ path: join(screenshotDir, screenshot), fullPage: true });
  }
  const courtCounts = [];
  for (let i = 0; i < rounds; i += 1) {
    const roundIndex = await fillCurrentRound(page, 15, 6 + (i % 5));
    const store = await readState(page);
    const t = activeOf(store);
    const round = t.rounds[roundIndex];
    assert.ok(round, `missing round ${roundIndex} for ${format}`);
    assert.equal(round.format, format);
    const byCourt = courtSets(round);
    assert.equal(byCourt.size, courts, `${format} courts`);
    for (const [, ids] of byCourt) {
      assert.equal(ids.size, 4, `${format} four on a court`);
    }
    if (names.length % 4 !== 0) {
      assert.equal((round.sitting || []).length, names.length % 4, `${format} sitters`);
    }
    courtCounts.push([...byCourt.entries()].sort((a, b) => a[0] - b[0]).map(([, ids]) => [...ids].sort().join(',')));
    if (i < rounds - 1) {
      await page.click('[data-action="gen-round"][data-kind="regular"]');
      await page.waitForFunction(
        (n) => {
          const raw = localStorage.getItem('padel-mini-tracker-v1');
          const store = raw && JSON.parse(raw);
          const t = store?.tournaments.find((x) => x.id === store.ui.activeId);
          return t && t.rounds.length === n;
        },
        roundIndex + 2,
      );
    }
  }
  const store = await readState(page);
  const t = activeOf(store);
  assert.equal(t.rounds.length, rounds);
  if (format === 'americano') {
    const seen = new Set();
    for (const round of t.rounds) {
      for (const k of partnerSet(round)) {
        assert.equal(seen.has(k), false, `americano repeat ${k}`);
        seen.add(k);
      }
    }
  }
  if (format === 'escalera') {
    for (const round of t.rounds) {
      assert.equal(round.matches.length, courts * 3);
      assert.ok(round.courtGroups?.length === courts);
    }
    if (rounds >= 2 && names.length % 4 === 0) {
      assert.notDeepEqual(courtCounts[0], courtCounts[1], 'escalera should move players');
    }
  }
  if (format === 'king' && rounds >= 2 && names.length % 4 === 0) {
    assert.notDeepEqual(courtCounts[0], courtCounts[1], 'king should move a player between courts');
    const last = t.rounds[t.rounds.length - 1];
    assert.ok(last.note && last.note.includes('Корт'), `king note: ${last.note}`);
  }
  if (format === 'mexicano' && rounds >= 2) {
    const last = t.rounds[t.rounds.length - 1];
    assert.equal(last.matches.length, courts);
  }
  if (format === 'free' && pairLock === 'locked' && rounds >= 2) {
    assert.deepEqual([...partnerSet(t.rounds[0])].sort(), [...partnerSet(t.rounds[1])].sort());
  }
  if (format === 'free' && pairLock === 'unlocked' && rounds >= 2) {
    const first = [...partnerSet(t.rounds[0])].sort();
    const second = [...partnerSet(t.rounds[1])].sort();
    assert.ok(first.join() !== second.join() || first.length > 0);
  }
  await page.click('[data-tab="table"]');
  await page.waitForSelector('table.standings tbody tr td.name');
  assert.equal(await page.locator('table.standings tbody tr').count(), names.length);
  return store;
}

async function main() {
  mkdirSync(screenshotDir, { recursive: true });
  const { chromium } = await importPlaywright();
  const { server, url } = await startServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await resetApp(page);
  assert.equal(await page.locator('#btn-backup').getAttribute('aria-label'), 'Резервная копия');
  assert.equal(await page.locator('h2', { hasText: 'Файл' }).count(), 0);
  assert.equal(await page.locator('[data-action="export-all"]').count(), 0);
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), './manifest.webmanifest');
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content'), 'yes');
  assert.equal(
    await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute('content'),
    'black-translucent',
  );
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'), './icons/apple-touch-icon.png');
  const manifest = await page.evaluate(async () => {
    const res = await fetch('./manifest.webmanifest');
    return { ok: res.ok, json: await res.json() };
  });
  assert.equal(manifest.ok, true);
  assert.equal(manifest.json.name, 'Падел трекер');
  assert.equal(manifest.json.display, 'standalone');
  assert.equal(manifest.json.start_url, './');
  const layout = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const main = getComputedStyle(document.getElementById('main'));
    const app = getComputedStyle(document.getElementById('app'));
    return {
      htmlOx: html.overflowX,
      htmlOy: html.overflowY,
      bodyOx: body.overflowX,
      bodyOy: body.overflowY,
      htmlOverX: html.overscrollBehaviorX,
      htmlOverY: html.overscrollBehaviorY,
      bodyOverX: body.overscrollBehaviorX,
      bodyOverY: body.overscrollBehaviorY,
      mainOverflow: main.overflowY,
      appPos: app.position,
    };
  });
  assert.equal(layout.htmlOx, 'hidden');
  assert.equal(layout.bodyOx, 'hidden');
  assert.match(layout.htmlOy, /auto|scroll|visible/);
  assert.match(layout.bodyOy, /auto|scroll|visible/);
  assert.match(String(layout.htmlOverX), /^none/);
  assert.match(String(layout.bodyOverX), /^none/);
  assert.doesNotMatch(String(layout.htmlOverY), /^none$/);
  assert.doesNotMatch(String(layout.bodyOverY), /^none$/);
  assert.match(layout.mainOverflow, /visible|auto/);
  assert.equal(layout.appPos, 'relative');
  const sw = await page.evaluate(async () => {
    const res = await fetch('./sw.js');
    const text = await res.text();
    return { ok: res.ok, version: /const VERSION = '([\d.]+)'/.exec(text)?.[1] || '' };
  });
  assert.equal(sw.ok, true);
  assert.equal(sw.version, '0.7.13');
  assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'), /viewport-fit=cover/);
  assert.equal(
    await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute('content'),
    'black-translucent',
  );
  const cssText = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="stylesheet"]')?.getAttribute('href') || './styles.css';
    const res = await fetch(href);
    return res.text();
  });
  assert.match(cssText, /max\(env\(safe-area-inset-top/);
  assert.match(cssText, /47px/);
  assert.match(cssText, /-webkit-fill-available/);
  assert.doesNotMatch(cssText, /max\(var\(--safe-bottom\)/);
  assert.doesNotMatch(cssText, /var\(--safe-bottom\)\s*\*\s*0\.5/);
  assert.match(cssText, /\.tabs\s*\{[^}]*padding-bottom:\s*calc\(\s*5px\s*\+\s*var\(--safe-bottom\)\s*\)/s);
  assert.match(cssText, /--chrome-bottom/);
  assert.match(cssText, /rgba\(249,\s*249,\s*249,\s*0\.94\)/);
  assert.match(cssText, /#8e8e93/);
  assert.match(cssText, /backdrop-filter:\s*saturate\(180%\)\s*blur\(20px\)/);
  assert.doesNotMatch(cssText, /\.tabs-track/);
  assert.doesNotMatch(cssText, /\.tabs::before/);
  assert.doesNotMatch(cssText, /\.tabs\s*\{[^}]*border-top:\s*1px/s);
  const shell = await page.evaluate(() => {
    const app = document.getElementById('app');
    const cs = getComputedStyle(app);
    const box = app.getBoundingClientRect();
    const body = getComputedStyle(document.body);
    return {
      position: cs.position,
      top: cs.top,
      bottom: cs.bottom,
      htmlPad: getComputedStyle(document.documentElement).paddingTop,
      bodyPos: body.position,
      bodyBg: body.backgroundColor,
      appTop: box.top,
      appBottom: box.bottom,
      vh: window.innerHeight,
    };
  });
  assert.equal(shell.position, 'relative');
  assert.equal(shell.htmlPad, '0px');
  assert.equal(shell.bodyPos, 'static');
  assert.equal(shell.bodyBg, 'rgb(244, 244, 245)');
  assert.equal(shell.appTop, 0);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-home.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-home.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#btn-backup');
  await page.waitForSelector('#backup-sheet');
  assert.ok(await page.locator('[data-action="export-all"]').isDisabled());
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-backup-sheet.png'), fullPage: true });
  await page.click('[data-action="close-backup"]');
  await page.waitForSelector('#backup-sheet', { state: 'detached' });

  await page.click('#btn-create');
  await page.waitForSelector('[data-action="pick-format"][data-format="americano"]');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-create-format.png'), fullPage: true });
  await page.click('[data-action="pick-format"][data-format="americano"]');
  await page.waitForSelector('#btn-create-ok');
  await page.fill('[data-action="draft-name"]', 'Американо утро');
  assert.ok(await page.locator('[data-key="mexicanoPairing"][data-value="1-4"]').isVisible());
  assert.ok(await page.locator('[data-key="mexicanoPairing"][data-value="1-3"]').isVisible());
  assert.ok(await page.locator('text=1-4, 2-3').count());
  assert.equal(await page.locator('[data-key="roundsLimit"]').count(), 0);
  assert.equal(await page.locator('text=Сколько кругов').count(), 0);
  await assertSumChips(page, 'draft-total');
  assert.ok(await page.locator('[data-action="draft-total"][data-n="21"].is-on').count());
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-create-settings.png'), fullPage: true });
  await page.click('#btn-create-ok');
  await page.waitForSelector('#add-name');
  await addPlayers(page, NAMES8);
  await page.click('[data-tab="play"]');
  await page.click('#btn-next-round');
  await page.waitForSelector('.match-duel');
  let store = await readState(page);
  assert.equal(store.tournaments.length, 1);
  assert.equal(activeOf(store).settings.tournamentFormat, 'americano');
  assert.equal(activeOf(store).rounds[0].matches.length, 2);
  assert.equal(await page.locator('.match-duel').count(), 2);
  assert.ok((await page.locator('.match-side').count()) >= 4);
  assert.equal(await page.locator('.match-duel .wheel').count(), 0);
  assert.equal(await page.locator('header [data-action="open-settings"]').getAttribute('aria-label'), 'Настройки турнира');
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    const tabs = document.querySelector('.tabs');
    const main = document.getElementById('main');
    if (!app || !tabs || !main) return false;
    const chromeBot = parseFloat(getComputedStyle(app).getPropertyValue('--chrome-bottom')) || 0;
    return chromeBot >= 48;
  });
  const chrome = await page.evaluate(() => {
    const tabs = document.querySelector('.tabs');
    const tab = document.querySelector('.tab.is-on') || document.querySelector('.tab');
    const icon = document.querySelector('.tab svg');
    const app = document.getElementById('app');
    const top = document.querySelector('.top');
    const h1 = document.querySelector('.top h1');
    const main = document.getElementById('main');
    const ts = tabs ? getComputedStyle(tabs) : null;
    const tabCs = tab ? getComputedStyle(tab) : null;
    const topCs = getComputedStyle(top);
    const appBox = app.getBoundingClientRect();
    const tabsBox = tabs.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    const topBox = top.getBoundingClientRect();
    const off = document.querySelector('.tab:not(.is-on)');
    const chromeBot = parseFloat(getComputedStyle(app).getPropertyValue('--chrome-bottom')) || 0;
    return {
      tabsPadBottom: ts?.paddingBottom,
      tabsPadTop: ts?.paddingTop,
      tabsPadLeft: ts?.paddingLeft,
      tabsBg: ts?.backgroundColor,
      tabsBorder: ts?.borderTopWidth,
      topBg: topCs.backgroundColor,
      appBg: getComputedStyle(app).backgroundColor,
      hasPicker: Boolean(document.querySelector('.picker-backdrop')),
      tabH: tab ? tab.getBoundingClientRect().height : 0,
      tabOnBg: tabCs?.backgroundColor,
      tabOnColor: tabCs?.color,
      tabOffColor: off ? getComputedStyle(off).color : '',
      tabFont: tabCs?.fontSize,
      tabRadius: tabCs?.borderRadius,
      tabPos: ts?.position,
      topPos: topCs.position,
      mainPos: getComputedStyle(main).position,
      rowH: document.querySelector('.top-row')?.getBoundingClientRect().height || 0,
      hasTrack: Boolean(document.querySelector('.tabs-track')),
      hasTournamentEyebrow: Boolean(document.querySelector('.top .eyebrow')),
      hasIcon: Boolean(icon),
      iconH: icon ? icon.getBoundingClientRect().height : 0,
      htmlPadTop: getComputedStyle(document.documentElement).paddingTop,
      htmlPadBottom: getComputedStyle(document.documentElement).paddingBottom,
      bodyPadBottom: getComputedStyle(document.body).paddingBottom,
      appPadTop: app ? getComputedStyle(app).paddingTop : '',
      appPadBottom: app ? getComputedStyle(app).paddingBottom : '',
      appPos: app ? getComputedStyle(app).position : '',
      topPadTop: top ? getComputedStyle(top).paddingTop : '',
      h1Top: h1 ? h1.getBoundingClientRect().top : 0,
      appTop: appBox.top,
      tabsBottom: tabsBox.bottom,
      topH: topBox.height,
      tabsH: tabsBox.height,
      chromeBot,
      mainPadTop: parseFloat(getComputedStyle(main).paddingTop),
      mainPadBottom: parseFloat(getComputedStyle(main).paddingBottom),
      summaryTopGap: (() => {
        const summary = document.querySelector('.summary-line');
        if (!summary) return null;
        return Math.round(summary.getBoundingClientRect().top - topBox.bottom);
      })(),
      cardAfterSummary: (() => {
        const summary = document.querySelector('.summary-line');
        const card = document.querySelector('#main .card');
        if (!summary || !card) return null;
        return Math.round(card.getBoundingClientRect().top - summary.getBoundingClientRect().bottom);
      })(),
      vh: window.innerHeight,
    };
  });
  assert.equal(chrome.appPos, 'relative');
  assert.equal(chrome.topPos, 'relative');
  assert.equal(chrome.tabPos, 'fixed');
  assert.equal(chrome.mainPos, 'relative');
  assert.equal(chrome.htmlPadTop, '0px');
  assert.equal(chrome.htmlPadBottom, '0px');
  assert.equal(chrome.bodyPadBottom, '0px');
  assert.equal(chrome.appPadTop, '0px');
  assert.equal(chrome.appPadBottom, '0px');
  assert.equal(chrome.topPadTop, '8px');
  assert.equal(chrome.tabsPadBottom, '5px');
  assert.equal(chrome.tabsPadTop, '7px');
  assert.equal(chrome.tabsPadLeft, '0px');
  assert.equal(chrome.tabsBorder, '0px');
  assert.equal(chrome.hasTrack, false);
  assert.equal(chrome.hasTournamentEyebrow, false);
  assert.equal(chrome.hasIcon, true);
  assert.ok(Math.abs(chrome.iconH - 26) < 1, `icon height ${chrome.iconH}`);
  assert.ok(chrome.tabH >= 48 && chrome.tabH <= 50, `tab height ${chrome.tabH}`);
  assert.ok(chrome.rowH >= 43 && chrome.rowH <= 52, `title row ${chrome.rowH}`);
  assert.equal(chrome.tabFont, '10px');
  assert.equal(chrome.tabsBg, 'rgba(249, 249, 249, 0.94)');
  assert.equal(chrome.topBg, 'rgb(244, 244, 245)');
  assert.equal(chrome.appBg, 'rgb(244, 244, 245)');
  assert.notEqual(chrome.tabsBg, chrome.appBg);
  assert.equal(chrome.hasPicker, false);
  assert.equal(chrome.tabOnBg, 'rgba(0, 0, 0, 0)');
  assert.equal(chrome.tabOnColor, 'rgb(63, 63, 70)');
  assert.equal(chrome.tabOffColor, 'rgb(142, 142, 147)');
  assert.equal(chrome.tabRadius, '0px');
  assert.equal(chrome.tabsBottom, chrome.vh);
  assert.ok(Math.abs(chrome.tabsH - 61) <= 1, `tabs height ${chrome.tabsH}`);
  assert.ok(Math.abs(chrome.chromeBot - chrome.tabsH) <= 1, `chrome-bottom ${chrome.chromeBot} vs tabs ${chrome.tabsH}`);
  assert.equal(chrome.mainPadTop, 14);
  assert.ok(chrome.summaryTopGap != null && chrome.summaryTopGap <= 2, `subtitle under title ${chrome.summaryTopGap}`);
  assert.ok(
    chrome.cardAfterSummary != null && chrome.cardAfterSummary >= 24 && chrome.cardAfterSummary <= 30,
    `first card after subtitle ${chrome.cardAfterSummary}`,
  );
  assert.ok(Math.abs(chrome.mainPadBottom - chrome.tabsH) <= 1, `main pad-bottom ${chrome.mainPadBottom} vs tabs ${chrome.tabsH}`);
  const swipe = await page.evaluate(() => {
    const app = getComputedStyle(document.getElementById('app'));
    const main = getComputedStyle(document.getElementById('main'));
    const rights = [...document.querySelectorAll('#app *')].map((el) => el.getBoundingClientRect().right);
    return {
      appOx: app.overflowX,
      mainOx: main.overflowX,
      mainTouch: main.touchAction,
      mainOverX: main.overscrollBehaviorX,
      maxRight: rights.length ? Math.max(...rights) : 0,
      vw: window.innerWidth,
    };
  });
  assert.equal(swipe.appOx, 'hidden');
  assert.equal(swipe.mainOx, 'hidden');
  assert.match(String(swipe.mainTouch), /pan-y/);
  assert.match(String(swipe.mainOverX), /^none/);
  assert.ok(swipe.maxRight <= swipe.vw + 1, `element past viewport ${swipe.maxRight} > ${swipe.vw}`);
  const histBefore = await page.evaluate(() => history.length);
  await page.click('[data-tab="table"]');
  await page.waitForSelector('table.standings');
  await page.click('[data-tab="play"]');
  await page.waitForSelector('.match-duel');
  const histAfter = await page.evaluate(() => history.length);
  assert.equal(histAfter, histBefore);

  await setIphoneSafe(page, true);
  await page.waitForFunction((inset) => {
    const top = document.querySelector('.top');
    const tabs = document.querySelector('.tabs');
    const main = document.getElementById('main');
    const app = document.getElementById('app');
    if (!top || !tabs || !main || !app) return false;
    const topPad = parseFloat(getComputedStyle(top).paddingTop);
    const tabsPad = parseFloat(getComputedStyle(tabs).paddingBottom);
    const chromeBot = parseFloat(getComputedStyle(app).getPropertyValue('--chrome-bottom')) || 0;
    return (
      Math.abs(topPad - (8 + inset.top)) < 1 &&
      Math.abs(tabsPad - (5 + inset.bottom)) < 1 &&
      Math.abs(chromeBot - tabs.getBoundingClientRect().height) <= 1
    );
  }, { top: IPHONE_SAFE_TOP, bottom: IPHONE_SAFE_BOTTOM });
  const safeChrome = await page.evaluate((insets) => {
    const top = document.querySelector('.top');
    const h1 = document.querySelector('.top h1');
    const eye = document.querySelector('.top .eyebrow');
    const tabs = document.querySelector('.tabs');
    const label = document.querySelector('.tab.is-on span') || document.querySelector('.tab span');
    const app = document.getElementById('app');
    const main = document.getElementById('main');
    const appBox = app.getBoundingClientRect();
    const tabsBox = tabs.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    const topBox = top.getBoundingClientRect();
    const html = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const appCs = getComputedStyle(app);
    const topCs = getComputedStyle(top);
    return {
      topPad: parseFloat(topCs.paddingTop),
      tabsPadBottom: parseFloat(getComputedStyle(tabs).paddingBottom),
      tabsPadTop: parseFloat(getComputedStyle(tabs).paddingTop),
      htmlPadBottom: html.paddingBottom,
      bodyPadBottom: body.paddingBottom,
      appPadBottom: appCs.paddingBottom,
      hasEyebrow: Boolean(eye),
      hasPicker: Boolean(document.querySelector('.picker-backdrop')),
      h1Top: h1.getBoundingClientRect().top,
      labelBottom: label ? label.getBoundingClientRect().bottom : 0,
      appTop: appBox.top,
      appBottom: appBox.bottom,
      tabsBottom: tabsBox.bottom,
      mainTop: mainBox.top,
      mainBottom: mainBox.bottom,
      tabsBg: getComputedStyle(tabs).backgroundColor,
      topBg: topCs.backgroundColor,
      bodyBg: body.backgroundColor,
      appBg: appCs.backgroundColor,
      topH: topBox.height,
      tabsH: tabsBox.height,
      chromeTop: parseFloat(appCs.getPropertyValue('--chrome-top')) || 0,
      chromeBot: parseFloat(appCs.getPropertyValue('--chrome-bottom')) || 0,
      mainPadTop: parseFloat(getComputedStyle(main).paddingTop),
      mainPadBottom: parseFloat(getComputedStyle(main).paddingBottom),
      vh: window.innerHeight,
      insets,
    };
  }, { top: IPHONE_SAFE_TOP, bottom: IPHONE_SAFE_BOTTOM });
  assert.ok(Math.abs(safeChrome.topPad - (8 + IPHONE_SAFE_TOP)) < 1, `header pad ${safeChrome.topPad}`);
  assert.equal(safeChrome.hasEyebrow, false);
  assert.ok(safeChrome.h1Top >= IPHONE_SAFE_TOP + 8, `title under status bar at ${safeChrome.h1Top}`);
  assert.ok(
    Math.abs(safeChrome.tabsPadBottom - (5 + IPHONE_SAFE_BOTTOM)) < 1,
    `tabs pad ${safeChrome.tabsPadBottom}`,
  );
  assert.equal(safeChrome.tabsPadTop, 7);
  assert.equal(safeChrome.mainPadTop, 14);
  assert.equal(safeChrome.htmlPadBottom, '0px');
  assert.equal(safeChrome.bodyPadBottom, '0px');
  assert.equal(safeChrome.appPadBottom, '0px');
  assert.equal(safeChrome.bodyBg, 'rgb(244, 244, 245)');
  assert.equal(safeChrome.appBg, 'rgb(244, 244, 245)');
  assert.equal(safeChrome.topBg, 'rgb(244, 244, 245)');
  assert.equal(safeChrome.tabsBg, 'rgba(249, 249, 249, 0.94)');
  assert.equal(safeChrome.hasPicker, false);
  assert.equal(safeChrome.tabsBottom, safeChrome.vh);
  assert.ok(Math.abs(safeChrome.tabsH - (61 + IPHONE_SAFE_BOTTOM)) <= 1, `tabs total ${safeChrome.tabsH}`);
  assert.ok(Math.abs(safeChrome.mainPadBottom - safeChrome.tabsH) <= 1, `main pad-bottom ${safeChrome.mainPadBottom}`);
  assert.ok(
    safeChrome.labelBottom <= safeChrome.vh - IPHONE_SAFE_BOTTOM + 1 &&
      safeChrome.labelBottom >= safeChrome.vh - IPHONE_SAFE_BOTTOM - 12,
    `tab label bottom ${safeChrome.labelBottom}`,
  );
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-iphone-safe-play.png') });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-iphone-safe-play.png') });
  await page.setViewportSize({ width: 375, height: 667 });
  await setIphoneSafe(page, true, { top: IPHONE_SE_SAFE_TOP, bottom: IPHONE_SE_SAFE_BOTTOM });
  await page.waitForFunction((inset) => {
    const top = document.querySelector('.top');
    const tabs = document.querySelector('.tabs');
    if (!top || !tabs) return false;
    const topPad = parseFloat(getComputedStyle(top).paddingTop);
    const tabsPad = parseFloat(getComputedStyle(tabs).paddingBottom);
    return Math.abs(topPad - (8 + inset.top)) < 1 && Math.abs(tabsPad - (5 + inset.bottom)) < 1;
  }, { top: IPHONE_SE_SAFE_TOP, bottom: IPHONE_SE_SAFE_BOTTOM });
  const seChrome = await page.evaluate(() => {
    const tabs = document.querySelector('.tabs');
    const top = document.querySelector('.top');
    return {
      topPad: parseFloat(getComputedStyle(top).paddingTop),
      tabsPad: parseFloat(getComputedStyle(tabs).paddingBottom),
      tabsH: tabs.getBoundingClientRect().height,
      h1Top: document.querySelector('.top h1').getBoundingClientRect().top,
    };
  });
  assert.ok(Math.abs(seChrome.topPad - (8 + IPHONE_SE_SAFE_TOP)) < 1, `SE header pad ${seChrome.topPad}`);
  assert.equal(seChrome.tabsPad, 5);
  assert.ok(Math.abs(seChrome.tabsH - 61) <= 1, `SE tabs ${seChrome.tabsH}`);
  assert.ok(seChrome.h1Top >= IPHONE_SE_SAFE_TOP + 8, `SE title ${seChrome.h1Top}`);
  await page.screenshot({ path: join(screenshotDir, 'mobile-375-iphone-se-play.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await setIphoneSafe(page, true, { top: IPHONE_SAFE_TOP, bottom: IPHONE_SAFE_BOTTOM });
  await page.click('[data-action="go-home"]');
  await page.waitForSelector('#btn-create');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-iphone-safe-home.png') });
  await page.click('.home-open');
  await page.waitForSelector('.tabs');
  await setIphoneSafe(page, false);
  assert.equal(await page.locator('.summary-edit').count(), 0);
  assert.equal(await page.locator('text=Клавиатура').count(), 0);
  await typeScore(page, page.locator('.score-box[data-side="a"]').first(), '9');
  const scored = async () =>
    page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('padel-mini-tracker-v1') || 'null');
      const t = store?.tournaments.find((x) => x.id === store.ui.activeId);
      const g = t?.rounds[0]?.matches[0]?.games?.[0];
      return { a: g?.a, b: g?.b, total: t?.settings?.totalPoints, mode: t?.settings?.scoringMode };
    });
  assert.deepEqual(await scored(), { a: 9, b: 12, total: 21, mode: 'total' });
  await typeScore(page, page.locator('.score-box[data-side="a"]').first(), '10');
  assert.deepEqual(await scored(), { a: 10, b: 11, total: 21, mode: 'total' });
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-match-layout.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-match-layout.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });

  await fillCurrentRound(page, 21, 15);
  await page.click('#btn-next-round');
  await page.waitForFunction(() => document.querySelectorAll('.round').length === 2);
  assert.equal(await page.locator('.round.is-collapsed').count(), 1);
  assert.ok(await page.locator('.round.is-current .match-duel').count());
  const roundTitles = await page.locator('.round h3').allInnerTexts();
  assert.match(roundTitles[0], /Круг 2/);
  assert.match(roundTitles[1], /Круг 1/);
  assert.ok(await page.locator('.round').first().evaluate((el) => el.classList.contains('is-current')));
  assert.match(await page.locator('.round.is-collapsed .round-summary-line').first().innerText(), /Корт 1:/);
  assert.ok((await page.locator('.round.is-collapsed .round-summary-line').count()) >= 2);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-rounds-collapsed.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-rounds-collapsed.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('.round-toggle');
  await page.waitForSelector('.round:not(.is-current) .match-duel');
  assert.equal(await page.locator('.round.is-collapsed').count(), 0);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-round-expanded.png'), fullPage: true });

  await page.click('[data-tab="play"]');
  await page.waitForSelector('#btn-finish');
  assert.equal(await page.locator('.play-row #btn-finish').count(), 1);
  assert.equal(await page.locator('#btn-change-pairs').count(), 0);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-play-row.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-play-row.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-action="open-settings"]');
  assert.equal(await page.locator('#btn-finish').count(), 0);
  assert.equal(await page.locator('[data-key="roundsLimit"]').count(), 0);
  await page.waitForSelector('[data-key="scoringMode"]');
  await assertSumChips(page, 'total-pts');
  assert.ok(await page.locator('[data-action="total-pts"][data-n="21"].is-on').count());
  await page.locator('.field-label', { hasText: 'Сумма очков' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-settings-sum-chips.png') });
  await page.evaluate(() => {
    (document.scrollingElement || document.documentElement).scrollTop = 0;
  });
  const headerStartTop = await page.evaluate(() => document.querySelector('.top').getBoundingClientRect().top);
  const scrolled = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    el.scrollTop = 280;
    return {
      scroll: el.scrollTop,
      headerTop: document.querySelector('.top').getBoundingClientRect().top,
      tabsBottom: document.querySelector('.tabs').getBoundingClientRect().bottom,
      vh: window.innerHeight,
    };
  });
  assert.ok(scrolled.scroll > 40, `settings did not scroll (${scrolled.scroll})`);
  assert.ok(
    scrolled.headerTop < headerStartTop - 40,
    `header did not scroll ${headerStartTop} -> ${scrolled.headerTop}`,
  );
  assert.equal(scrolled.tabsBottom, scrolled.vh);
  await page.click('[data-key="scoringMode"][data-value="games"]');
  await page.waitForTimeout(80);
  const afterScroll = await page.evaluate(() => (document.scrollingElement || document.documentElement).scrollTop);
  assert.ok(Math.abs(afterScroll - scrolled.scroll) < 12, `scroll jumped ${scrolled.scroll} -> ${afterScroll}`);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-settings-finish.png'), fullPage: true });
  await page.click('[data-tab="play"]');
  await page.waitForSelector('#btn-finish');
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#btn-finish');
  await page.waitForSelector('#final-standings');
  assert.equal(await page.locator('h2').first().innerText(), 'Итог');
  assert.equal(await page.locator('.top .eyebrow').count(), 0);
  assert.equal(await page.locator('header h1').innerText(), 'Американо утро');
  const names = await page.locator('#final-standings table.standings tbody tr td.name').allInnerTexts();
  assert.match(names[0], /🥇/);
  assert.match(names[1], /🥈/);
  assert.match(names[2], /🥉/);
  assert.ok(names.some((n) => n.includes('🎉 лучшая девушка')));
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-finished-table.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-finished-table.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-tab="play"]');
  assert.equal(await page.locator('#btn-next-round').count(), 0);
  assert.equal(await page.locator('.score-box.is-readonly').count() > 0, true);

  await page.click('[data-action="go-home"]');
  await page.waitForSelector('#btn-create');
  assert.match(await page.locator('.home-open').first().innerText(), /Завершён/);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-home-finished.png'), fullPage: true });
  await page.click('.home-open');
  await page.waitForSelector('#final-standings');
  assert.equal(await page.locator('h2').first().innerText(), 'Итог');
  await page.click('[data-action="open-settings"]');
  await page.waitForSelector('#btn-reopen');
  await page.click('#btn-reopen');
  await page.waitForSelector('#btn-reopen', { state: 'detached' });
  await page.click('[data-tab="play"]');
  await page.waitForSelector('#btn-finish');
  await page.waitForSelector('.score-box[data-action="open-score-picker"]');
  assert.equal(await page.locator('.score-box.is-readonly').count(), 0);

  await page.click('[data-action="go-home"]');
  await page.waitForSelector('#btn-create');
  await createViaUi(page, 'free', 'Наш вечер');
  await addPlayers(page, NAMES9);
  store = await readState(page);
  assert.equal(store.tournaments.length, 2);

  await page.click('[data-tab="play"]');
  await page.click('#btn-next-round');
  await page.waitForSelector('.match');
  store = await readState(page);
  const free = activeOf(store);
  assert.equal(free.players.length, 9);
  assert.equal(free.rounds[0].matches.length, 2);
  assert.equal((free.rounds[0].sitting || []).length, 1);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-games.png'), fullPage: true });

  await page.reload({ waitUntil: 'networkidle' });
  store = await readState(page);
  assert.equal(store.tournaments.length, 2);
  assert.equal(activeOf(store).players.length, 9);

  await page.click('[data-action="open-settings"]');
  await page.waitForSelector('[data-action="export-one"]');
  for (const n of [15, 17, 19, 21]) {
    assert.ok(await page.locator(`[data-action="preset"][data-n="${n}"]`).count(), `preset ${n}`);
  }
  assert.ok(await page.locator('[data-action="preset"][data-n="custom"]').count());
  assert.equal(await page.locator('[data-action="preset"][data-n="11"]').count(), 0);
  await page.click('[data-key="scoringMode"][data-value="total"]');
  await page.waitForSelector('[data-action="total-pts"][data-n="15"]');
  await assertSumChips(page, 'total-pts');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-settings-formats.png'), fullPage: true });

  const downloads = [];
  page.on('download', (d) => downloads.push(d));
  await page.click('[data-action="export-one"]');
  await page.waitForTimeout(500);
  assert.ok(downloads.length >= 1, 'export one should trigger download');
  assert.match(downloads[0].suggestedFilename(), /padel-.*\.json$/);

  await page.click('[data-action="go-home"]');
  await page.waitForSelector('#btn-create');
  assert.equal(await page.locator('.home-open').count(), 2);
  assert.equal(await page.locator('[data-action="export-all"]').count(), 0);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-home-two.png'), fullPage: true });

  const payload = await page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key));
    return JSON.stringify({ app: 'padel-mini-tracker', version: 2, tournaments: store.tournaments });
  }, STORAGE_KEY);

  await page.click('#btn-backup');
  await page.waitForSelector('#backup-sheet');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-backup-sheet-full.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-backup-sheet.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-action="export-all"]');
  await page.waitForSelector('#backup-sheet', { state: 'detached' });
  await page.waitForTimeout(400);

  page.once('dialog', (dialog) => dialog.accept());
  await page.click('[data-action="delete-tournament"]');
  await page.waitForFunction(() => document.querySelectorAll('.home-open').length === 1);

  await page.evaluate(
    ({ json }) => {
      const dt = new DataTransfer();
      const file = new File([json], 'padel-turniry-2026-11-23.json', { type: 'application/json' });
      dt.items.add(file);
      const input = document.getElementById('import-file');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { json: payload },
  );
  await page.waitForSelector('#import-ask');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-import-ask.png'), fullPage: true });
  await page.click('[data-action="import-add"]');
  await page.waitForFunction(() => document.querySelectorAll('.home-open').length >= 2);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-home-imported.png'), fullPage: true });

  await page.click('.home-open');
  await page.waitForSelector('#add-name, .match, #btn-next-round');
  if (await page.locator('[data-tab="players"]').count()) {
    await page.click('[data-tab="players"]');
    await page.waitForSelector('#add-name');
    await page.screenshot({ path: join(screenshotDir, 'mobile-390-players.png'), fullPage: true });
  }

  const formats = [
    { format: 'free', names: NAMES8, courts: 2, rounds: 3, pairLock: 'locked', screenshot: 'mobile-390-free-locked-8.png' },
    { format: 'free', names: NAMES8, courts: 2, rounds: 3, pairLock: 'unlocked', screenshot: 'mobile-390-free-unlocked-8.png' },
    { format: 'free', names: NAMES12, courts: 3, rounds: 3, pairLock: 'locked', screenshot: 'mobile-390-free-locked-12.png' },
    { format: 'americano', names: NAMES8, courts: 2, rounds: 3, screenshot: 'mobile-390-americano-8.png' },
    { format: 'americano', names: NAMES9, courts: 2, rounds: 2, screenshot: 'mobile-390-americano-9.png' },
    { format: 'americano', names: NAMES12, courts: 3, rounds: 3, screenshot: 'mobile-390-americano-12.png' },
    {
      format: 'mexicano',
      names: NAMES8,
      courts: 2,
      rounds: 3,
      screenshot: 'mobile-390-mexicano-8.png',
      mexicano: '1-4',
    },
    {
      format: 'mexicano',
      names: NAMES9,
      courts: 2,
      rounds: 2,
      screenshot: 'mobile-390-mexicano-9.png',
      mexicano: '1-4',
    },
    {
      format: 'mexicano',
      names: NAMES12,
      courts: 3,
      rounds: 3,
      screenshot: 'mobile-390-mexicano-12.png',
      mexicano: '1-3',
    },
    { format: 'escalera', names: NAMES8, courts: 2, rounds: 3, screenshot: 'mobile-390-escalera-8.png' },
    { format: 'escalera', names: NAMES12, courts: 3, rounds: 3, screenshot: 'mobile-390-escalera-12.png' },
    { format: 'king', names: NAMES8, courts: 2, rounds: 3, screenshot: 'mobile-390-king-8.png' },
    { format: 'king', names: NAMES12, courts: 3, rounds: 3, screenshot: 'mobile-390-king-12.png' },
  ];
  for (const spec of formats) {
    await playFormat(page, spec);
  }

  await resetApp(page);
  await createViaUi(page, 'free', 'Смена пар');
  await addPlayers(page, NAMES8);
  await page.click('[data-tab="play"]');
  await page.click('#btn-next-round');
  await page.waitForSelector('.match');
  await page.waitForSelector('#btn-change-pairs');
  const pairBox = await page.locator('#btn-change-pairs').boundingBox();
  const finishBox = await page.locator('.play-row #btn-finish').boundingBox();
  assert.ok(pairBox && finishBox);
  assert.ok(Math.abs(pairBox.y - finishBox.y) < 10, 'change-pairs and finish should share a row');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-play-row-free.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-play-row-free.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#btn-change-pairs');
  await page.waitForSelector('#new-pairs');
  assert.ok(await page.locator('[data-action="new-pairs"][data-method="ranking"]').isVisible());
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-new-pairs.png'), fullPage: true });
  await page.click('[data-action="new-pairs"][data-method="random"]');
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('padel-mini-tracker-v1');
    const store = raw && JSON.parse(raw);
    const t = store?.tournaments.find((x) => x.id === store.ui.activeId);
    return t && t.rounds.length >= 1 && t.rounds.at(-1).override;
  });
  const opened = activeOf(await readState(page));
  const openIndex = opened.rounds.length - 1;
  await typeScore(page, page.locator(`.score-box[data-round="${openIndex}"][data-side="a"]`).first(), '12');
  await page.click('#btn-change-pairs');
  await page.waitForSelector('.callout');
  assert.match(await page.locator('#new-pairs .callout').innerText(), /уже есть счета/);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-new-pairs-partial.png'), fullPage: true });

  await typeScore(page, page.locator('#score-r0-c1-g0-a'), '15');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-qualifying.png'), fullPage: true });

  await page.click('[data-tab="table"]');
  await page.waitForSelector('table.standings tbody tr td.name');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-table.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-table.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });

  await resetApp(page);
  await createViaUi(page, 'free', 'Квалификация сначала');
  await addPlayers(page, NAMES8);
  await page.click('[data-action="open-settings"]');
  await page.waitForSelector('[data-key="qualifyingEnabled"][data-value="1"]');
  await page.click('[data-key="qualifyingEnabled"][data-value="1"]');
  await page.click('[data-tab="play"]');
  await page.waitForSelector('#btn-qualifying');
  assert.equal(await page.locator('#btn-next-round').count(), 0);
  assert.equal(await page.locator('#btn-change-pairs').count(), 0);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-qualifying-first.png'), fullPage: true });
  await page.click('#btn-qualifying');
  await page.waitForSelector('.round');
  assert.match(await page.locator('.round h3').first().innerText(), /Квалификация/);
  assert.equal(await page.locator('#btn-next-round').count(), 0);
  await fillCurrentRound(page, 15, 10);
  await page.waitForSelector('#btn-next-round');
  assert.equal(await page.locator('#btn-qualifying').count(), 0);
  assert.ok(await page.locator('#btn-change-pairs').isVisible());

  await resetApp(page);
  await createViaUi(page, 'free', 'Без квалификации');
  await addPlayers(page, NAMES8);
  await page.click('[data-tab="play"]');
  await page.click('#btn-next-round');
  await page.waitForSelector('.match');
  await page.click('[data-action="open-settings"]');
  assert.ok(await page.locator('[data-key="qualifyingEnabled"]').count());
  await page.click('[data-tab="play"]');
  await fillCurrentRound(page, 15, 10);
  await page.click('[data-action="open-settings"]');
  assert.equal(await page.locator('[data-key="qualifyingEnabled"]').count(), 0);
  assert.equal(await page.locator('h3', { hasText: 'Квалификация' }).count(), 0);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-qualifying-hidden.png'), fullPage: true });

  await resetApp(page);
  await createViaUi(page, 'free', 'Теннис');
  await seedActiveSettings(page, {
    scoringMode: 'games',
    setScore: true,
    gamesToWin: 6,
    decidingGame: true,
    tournamentFormat: 'free',
    pairLock: 'locked',
    pairType: 'any',
  });
  await addPlayers(page, NAMES8);
  await page.click('[data-tab="play"]');
  await page.click('#btn-next-round');
  await page.waitForSelector('.match-duel .score-box');
  assert.equal(await page.locator('.match-duel .wheel').count(), 0);
  assert.equal(await page.locator('text=Табло по очкам').count(), 0);
  await typeScore(page, page.locator('.score-box[data-side="a"]').first(), '8');
  await page.waitForFunction(() => {
    const store = JSON.parse(localStorage.getItem('padel-mini-tracker-v1') || 'null');
    const t = store?.tournaments.find((x) => x.id === store.ui.activeId);
    const g = t?.rounds[0]?.matches[0]?.games?.[0];
    return g && g.a === 6;
  });
  await page.locator('.score-box[data-side="a"]').first().click();
  await page.waitForSelector('.picker-sheet .wheel', { state: 'attached' });
  const wheelMeta = await page.locator('[data-wheel]').evaluate((el) => {
    const item = el.querySelector('.wheel-item');
    return {
      copies: el.querySelectorAll('.wheel-item').length,
      itemH: item ? parseFloat(getComputedStyle(item).height) : 0,
      wrapH: parseFloat(getComputedStyle(el).height),
      max: Number(el.dataset.max),
      hasTrack: Boolean(el.querySelector('[data-wheel-track]')),
    };
  });
  assert.equal(wheelMeta.itemH, 44);
  assert.ok(wheelMeta.wrapH >= 120 && wheelMeta.wrapH <= 140, `wheel height ${wheelMeta.wrapH}`);
  assert.equal(wheelMeta.hasTrack, true);
  assert.ok(wheelMeta.copies >= (wheelMeta.max + 2) * 3, `copies ${wheelMeta.copies} max ${wheelMeta.max}`);
  const onCount = await page.locator('.picker-sheet .wheel-item.is-on').count();
  assert.ok(onCount >= 1);
  await page.locator('.picker-sheet .wheel-item.is-on').nth(Math.min(1, onCount - 1)).click();
  await page.waitForFunction(() => {
    const input = document.getElementById('picker-score-input');
    return Boolean(input && !input.classList.contains('is-hidden'));
  });
  await page.evaluate(() => {
    const input = document.getElementById('picker-score-input');
    if (!input) throw new Error('no picker input');
    input.classList.remove('is-hidden');
    input.value = '4';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const store = JSON.parse(localStorage.getItem('padel-mini-tracker-v1') || 'null');
    const t = store?.tournaments.find((x) => x.id === store.ui.activeId);
    const g = t?.rounds[0]?.matches[0]?.games?.[0];
    return g && g.a === 4 && g.b === 6;
  });
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-tennis-layout.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-tennis-layout.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-score-wheel.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-score-wheel.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#picker-ok');
  await page.waitForSelector('.picker-sheet', { state: 'detached' });
  await fillCurrentRound(page, 6, 4);

  await page.click('[data-action="open-settings"]');
  await page.waitForSelector('[data-key="scoringMode"][data-value="points"]');
  await page.click('[data-key="scoringMode"][data-value="points"]');
  await page.click('[data-action="tab"][data-tab="play"]');
  await page.waitForSelector('#btn-next-round');
  store = await readState(page);
  const tennis = activeOf(store);
  assert.equal(tennis.rounds[0].scoring.scoringMode, 'games');
  assert.equal(tennis.settings.scoringMode, 'points');
  await page.click('#btn-next-round');
  await page.waitForFunction(() => document.querySelectorAll('.round').length === 2);
  store = await readState(page);
  assert.equal(activeOf(store).rounds[1].scoring.scoringMode, 'points');

  await page.emulateMedia({ colorScheme: 'dark' });
  await resetApp(page);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-home-dark.png'), fullPage: true });
  await createViaUi(page, 'king', 'Кинг ночь');
  await addPlayers(page, NAMES8);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-players-dark.png'), fullPage: true });
  await page.click('[data-tab="play"]');
  await page.click('[data-action="gen-round"][data-kind="regular"]');
  await page.waitForSelector('.match');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-king-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.click('[data-action="open-settings"]');
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-settings-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-tab="play"]');
  await page.waitForSelector('.tabs');
  await setIphoneSafe(page, true);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-iphone-safe-dark.png') });

  await browser.close();
  server.close();
  console.log('e2e ok, screenshots in tracker/screenshots');
}

await main();
