import assert from 'node:assert/strict';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const trackerRoot = join(here, '..');
const screenshotDir = join(trackerRoot, 'screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

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

const NAMES = ['Анна', 'Борис', 'Вера', 'Глеб', 'Даша', 'Егор', 'Женя', 'Илья'];

async function typeScore(page, locator, value) {
  await locator.click();
  await locator.fill('');
  await locator.type(String(value), { delay: 20 });
  await page.waitForTimeout(220);
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

  for (const name of NAMES) {
    await page.fill('#add-name', name);
    await page.click('form.add-row button[type="submit"]');
  }
  assert.equal(await page.locator('.player-row').count(), 8);
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-players.png'), fullPage: true });

  await page.click('[data-tab="settings"]');
  const winByTwo = page.locator('[data-action="toggle"][data-key="winByTwo"]');
  if (await winByTwo.isChecked()) await winByTwo.click();
  await page.click('[data-action="preset"][data-n="15"]');
  const qual = page.locator('[data-action="toggle"][data-key="qualifyingEnabled"]');
  if (!(await qual.isChecked())) await qual.click();

  await page.click('[data-tab="play"]');
  await page.click('[data-action="gen-round"][data-kind="qualifying"]');
  await page.waitForSelector('.match');
  const courts = await page.locator('.court-line').allTextContents();
  assert.ok(courts.some((t) => t.includes('Корт 1')));
  assert.ok(courts.some((t) => t.includes('Корт 2')));

  await typeScore(page, page.locator('#score-r0-c1-g0-a'), '15');
  assert.equal(await page.locator('#score-r0-c1-g0-b').inputValue(), '0');
  await typeScore(page, page.locator('#score-r0-c1-g0-b'), '11');
  await typeScore(page, page.locator('#score-r0-c2-g0-a'), '15');
  await typeScore(page, page.locator('#score-r0-c2-g0-b'), '9');

  await page.screenshot({ path: join(screenshotDir, 'mobile-390-qualifying.png'), fullPage: true });

  await page.click('[data-action="gen-round"][data-kind="regular"]');
  await page.waitForSelector('input.score[data-round="1"]');
  const aIds = await page.$$eval('input.score[data-round="1"][data-side="a"]', (els) =>
    els.map((el) => el.id),
  );
  assert.ok(aIds.length >= 4, `expected regular-round scores, got ${aIds.join(',')}`);
  for (const id of aIds) {
    await typeScore(page, page.locator(`#${id}`), '15');
  }

  await page.click('[data-tab="table"]');
  await page.waitForSelector('table.standings tbody tr td.name');
  const firstName = (await page.locator('table.standings tbody tr td.name').first().textContent()) || '';
  assert.ok(firstName.length > 0);
  const pointsCell = (await page.locator('table.standings tbody tr td').nth(4).textContent()) || '';
  assert.ok(pointsCell.includes('–'));

  await page.screenshot({ path: join(screenshotDir, 'mobile-390-table.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: join(screenshotDir, 'mobile-360-table.png'), fullPage: true });

  await page.reload({ waitUntil: 'networkidle' });
  await page.click('[data-tab="players"]');
  assert.equal(await page.locator('.player-row').count(), 8);

  await page.click('[data-tab="settings"]');
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('[data-action="reset"]');
  await page.click('[data-tab="players"]');
  await page.waitForFunction(() => document.querySelectorAll('.player-row').length === 0);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of NAMES) {
    await page.fill('#add-name', name);
    await page.click('form.add-row button[type="submit"]');
  }
  await page.screenshot({ path: join(screenshotDir, 'mobile-390-players-dark.png'), fullPage: true });

  await browser.close();
  server.close();
  console.log('e2e ok, screenshots in tracker/screenshots');
}

await main();
