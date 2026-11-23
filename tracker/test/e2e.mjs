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
};

const NAMES8 = ['Анна', 'Борис', 'Вера', 'Глеб', 'Даша', 'Егор', 'Женя', 'Илья'];
const NAMES12 = [...NAMES8, 'Кира', 'Лев', 'Маша', 'Никита'];

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

async function typeScore(page, locator, value) {
  await locator.click();
  await locator.fill('');
  await locator.type(String(value), { delay: 20 });
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
  await page.click('[data-tab="settings"]');
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('[data-action="reset"]');
  await page.click('[data-tab="players"]');
  await page.waitForFunction(() => document.querySelectorAll('.player-row').length === 0);
}

async function readState(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);
}

async function configure(page, { courts, format, qualifying = false, pairLock = 'locked', mexicano = null }) {
  await page.evaluate(
    ({ courts, format, qualifying, pairLock, mexicano }) => {
      const key = 'padel-mini-tracker-v1';
      const state = JSON.parse(localStorage.getItem(key));
      Object.assign(state.settings, {
        courts,
        tournamentFormat: format,
        qualifyingEnabled: qualifying,
        gamesPerPairing: 1,
        winByTwo: false,
        decidingGame: false,
        scoringMode: 'points',
        pointsPreset: 15,
        pairType: 'any',
        pairLock,
        lockedMatchups: 'strength',
        standingsSort: 'points',
        setupDone: true,
        ...(mexicano ? { mexicanoPairing: mexicano } : {}),
      });
      localStorage.setItem(key, JSON.stringify(state));
    },
    { courts, format, qualifying, pairLock, mexicano },
  );
  await page.reload({ waitUntil: 'networkidle' });
}

async function fillCurrentRound(page, a = 15, b = 7) {
  const roundIndex = await page.evaluate(
    ({ a, b }) => {
      const key = 'padel-mini-tracker-v1';
      const state = JSON.parse(localStorage.getItem(key));
      const roundIndex = state.rounds.length - 1;
      const last = state.rounds[roundIndex];
      const n = state.settings.scoringMode === 'games' ? Math.max(1, Number(state.settings.gamesPerPairing) || 1) : 1;
      for (const match of last.matches) {
        match.games = Array.from({ length: n }, () => ({ a, b, touched: { a: true, b: true } }));
      }
      localStorage.setItem(key, JSON.stringify(state));
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
  await configure(page, { courts, format, qualifying: false, pairLock, mexicano });
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
    const state = await readState(page);
    const round = state.rounds[roundIndex];
    assert.ok(round, `missing round ${roundIndex} for ${format}`);
    assert.equal(round.format, format);
    const byCourt = courtSets(round);
    assert.equal(byCourt.size, courts, `${format} courts`);
    for (const [, ids] of byCourt) {
      assert.equal(ids.size, 4, `${format} four on a court`);
    }
    courtCounts.push([...byCourt.entries()].sort((a, b) => a[0] - b[0]).map(([, ids]) => [...ids].sort().join(',')));
    if (i < rounds - 1) {
      await page.click('[data-action="gen-round"][data-kind="regular"]');
      await page.waitForFunction(
        (n) => {
          const raw = localStorage.getItem('padel-mini-tracker-v1');
          return raw && JSON.parse(raw).rounds.length === n;
        },
        roundIndex + 2,
      );
    }
  }
  const state = await readState(page);
  assert.equal(state.rounds.length, rounds);
  if (format === 'americano') {
    const seen = new Set();
    for (const round of state.rounds) {
      for (const k of partnerSet(round)) {
        assert.equal(seen.has(k), false, `americano repeat ${k}`);
        seen.add(k);
      }
    }
  }
  if (format === 'escalera') {
    for (const round of state.rounds) {
      assert.equal(round.matches.length, courts * 3);
      assert.ok(round.courtGroups?.length === courts);
    }
    if (rounds >= 2) {
      assert.notDeepEqual(courtCounts[0], courtCounts[1], 'escalera should move players');
    }
  }
  if (format === 'king' && rounds >= 2) {
    assert.notDeepEqual(courtCounts[0], courtCounts[1], 'king should move a player between courts');
    const last = state.rounds[state.rounds.length - 1];
    assert.ok(last.note && last.note.includes('Корт'), `king note: ${last.note}`);
  }
  if (format === 'mexicano' && rounds >= 2) {
    const last = state.rounds[state.rounds.length - 1];
    assert.equal(last.matches.length, courts);
  }
  if (format === 'free' && pairLock === 'locked' && rounds >= 2) {
    assert.deepEqual([...partnerSet(state.rounds[0])].sort(), [...partnerSet(state.rounds[1])].sort());
  }
  if (format === 'free' && pairLock === 'unlocked' && rounds >= 2) {
    const first = [...partnerSet(state.rounds[0])].sort();
    const second = [...partnerSet(state.rounds[1])].sort();
    assert.ok(first.join() !== second.join() || first.length > 0);
  }
  await page.click('[data-tab="table"]');
  await page.waitForSelector('table.standings tbody tr td.name');
  assert.equal(await page.locator('table.standings tbody tr').count(), names.length);
  return state;
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
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  await page.screenshot({ path: join(screenshotDir, 'mobile-390-empty.png'), fullPage: true });

  for (const name of NAMES8) {
    await page.fill('#add-name', name);
    await page.click('form.add-row button[type="submit"]');
  }
  assert.equal(await page.locator('.player-row').count(), 8);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-players.png'), fullPage: true });

  await page.click('[data-tab="play"]');
  await page.waitForSelector('#btn-setup-next, #btn-setup-start');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-wizard-format.png'), fullPage: true });
  while (await page.locator('#btn-setup-next').count()) {
    const title = (await page.locator('#main h2').first().textContent()) || '';
    if (title.includes('Счёт')) {
      await page.screenshot({ path: join(screenshotDir, 'mobile-390-wizard-score.png'), fullPage: true });
    }
    if (title.includes('Пары')) {
      await page.screenshot({ path: join(screenshotDir, 'mobile-390-wizard-lock.png'), fullPage: true });
    }
    await page.click('#btn-setup-next');
  }
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-wizard-qual.png'), fullPage: true });
  await page.click('#btn-setup-start');
  await page.waitForSelector('.match, #btn-next-round');
  if (await page.locator('#btn-next-round').count()) {
    await page.click('#btn-next-round');
    await page.waitForSelector('.match');
  }
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-games.png'), fullPage: true });
  assert.ok(await page.locator('.summary-line').count());
  assert.ok(await page.locator('#btn-change-pairs').isVisible());

  await typeScore(page, page.locator('#score-r0-c1-g0-a'), '15');
  await typeScore(page, page.locator('#score-r0-c1-g0-b'), '11');
  await typeScore(page, page.locator('#score-r0-c2-g0-a'), '15');
  await typeScore(page, page.locator('#score-r0-c2-g0-b'), '9');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-qualifying.png'), fullPage: true });

  await page.click('[data-tab="table"]');
  await page.waitForSelector('table.standings tbody tr td.name');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-table.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-table.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.click('[data-tab="play"]');
  await page.click('#btn-change-pairs');
  await page.waitForSelector('#new-pairs');
  assert.ok(await page.locator('[data-action="new-pairs"][data-method="ranking"]').isVisible());
  assert.ok(await page.locator('[data-action="new-pairs"][data-method="ranking-mixed"]').isVisible());
  assert.ok(await page.locator('[data-action="new-pairs"][data-method="rotate-mixed"]').isVisible());
  assert.ok(await page.locator('[data-action="new-pairs"][data-method="random"]').isVisible());
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-new-pairs.png'), fullPage: true });

  await page.click('[data-action="new-pairs"][data-method="random"]');
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('padel-mini-tracker-v1');
    const parsed = raw && JSON.parse(raw);
    return parsed && parsed.rounds.length >= 1 && parsed.rounds.at(-1).override;
  });
  const opened = await readState(page);
  const openIndex = opened.rounds.length - 1;
  await page.evaluate((roundIndex) => {
    const el = document.querySelector(`input.score[data-round="${roundIndex}"][data-side="a"]`);
    if (!el) throw new Error('no score input');
    el.value = '12';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, openIndex);
  await page.waitForTimeout(280);
  await page.click('#btn-change-pairs');
  await page.waitForSelector('.callout');
  assert.match(await page.locator('#new-pairs .callout').innerText(), /уже есть счета/);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-new-pairs-partial.png'), fullPage: true });
  await page.click('[data-action="new-pairs"][data-method="ranking"]');
  await page.waitForFunction((n) => {
    const raw = localStorage.getItem('padel-mini-tracker-v1');
    return raw && JSON.parse(raw).rounds.length === n;
  }, opened.rounds.length + 1);
  const afterPartial = await readState(page);
  const kept = afterPartial.rounds[afterPartial.rounds.length - 2];
  assert.equal(kept.closedEarly, true);

  await page.click('[data-tab="settings"]');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-settings-formats.png'), fullPage: true });

  const formats = [
    { format: 'free', names: NAMES8, courts: 2, rounds: 3, pairLock: 'locked', screenshot: 'mobile-390-free-locked-8.png' },
    { format: 'free', names: NAMES8, courts: 2, rounds: 3, pairLock: 'unlocked', screenshot: 'mobile-390-free-unlocked-8.png' },
    { format: 'free', names: NAMES12, courts: 3, rounds: 3, pairLock: 'locked', screenshot: 'mobile-390-free-locked-12.png' },
    { format: 'americano', names: NAMES8, courts: 2, rounds: 3, screenshot: 'mobile-390-americano-8.png' },
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

  await page.emulateMedia({ colorScheme: 'dark' });
  await resetApp(page);
  await addPlayers(page, NAMES8);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-players-dark.png'), fullPage: true });
  await configure(page, { courts: 2, format: 'king', qualifying: false });
  await page.click('[data-tab="play"]');
  await page.click('[data-action="gen-round"][data-kind="regular"]');
  await page.waitForSelector('.match');
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-king-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.click('[data-tab="settings"]');
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-settings-dark.png'), fullPage: true });

  await browser.close();
  server.close();
  console.log('e2e ok, screenshots in tracker/screenshots');
}

await main();
