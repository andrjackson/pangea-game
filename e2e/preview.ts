/**
 * Art preview: seats players, grows a plausible mid-game board, and screenshots it.
 *
 *   npm run build && npx tsx e2e/preview.ts out.png [civ,civ,civ]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CIVS, legalRoadSpots, legalSettlementSpots, type CivId, type GameState } from '@pangea/engine';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = require('playwright') as any;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3101;
const URL = `http://localhost:${PORT}`;
const out = process.argv[2] ?? 'preview.png';
const civs = (process.argv[3]?.split(',') ?? ['rome', 'japan', 'mali']) as CivId[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'pangea-preview-'));
  const proc = spawn(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'packages/server/src/index.ts')], {
    env: { ...process.env, PORT: String(PORT), PANGEA_DEBUG: '1', PANGEA_DATA: dataDir },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${URL}/health`)).ok) break;
    } catch {
      /* starting */
    }
    await sleep(250);
  }
  const browser = await chromium.launch();
  try {
    const pages = [];
    for (let i = 0; i < civs.length; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
      const p = await ctx.newPage();
      await p.goto(URL);
      pages.push(p);
    }
    await pages[0].fill('input', 'P1');
    await pages[0].click('text=Create a new game');
    await pages[0].waitForSelector('.code-box strong');
    const code = (await pages[0].textContent('.code-box strong')).trim();
    for (let i = 1; i < pages.length; i++) {
      await pages[i].fill('input >> nth=0', `P${i + 1}`);
      await pages[i].fill('.code-input', code);
      await pages[i].click('button:text-is("Join")');
      await pages[i].waitForSelector('.civ-grid');
    }
    for (let i = 0; i < pages.length; i++) {
      await pages[i].click(`.civ-card:has-text("${CIVS[civs[i]].name}")`);
      await sleep(100);
    }
    await pages[0].click('text=Start the game');
    await pages[0].waitForSelector('.board');
    for (let step = 0; step < pages.length * 4; step++) {
      for (let tries = 0; tries < 20; tries++) {
        let done = false;
        for (const p of pages) {
          const n = await p.locator('.target').count();
          if (n) {
            await p.locator('.target').nth((step * 7) % n).click({ force: true });
            done = true;
            break;
          }
        }
        if (done) break;
        await sleep(100);
      }
      await sleep(120);
    }
    const s = (await (await fetch(`${URL}/debug/${code}`)).json()) as GameState;
    // grow each player's network
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 9301 + 49297) % 233280), Math.floor((seed / 233280) * n));
    for (let round = 0; round < 5; round++) {
      for (const p of s.players) {
        const roads = legalRoadSpots(s, p.id);
        if (roads.length) s.roads[roads[rand(roads.length)]] = p.id;
      }
    }
    for (const p of s.players) {
      const spots = legalSettlementSpots(s, p.id);
      if (spots.length) s.buildings[spots[rand(spots.length)]] = { owner: p.id, kind: 'settlement', wall: false, metropolis: null };
    }
    const firstCity = Number(Object.entries(s.buildings).find(([, b]) => b.owner === 0 && b.kind === 'city')![0]);
    s.buildings[firstCity].metropolis = 'trade';
    s.buildings[firstCity].wall = true;
    await fetch(`${URL}/debug/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roads: s.roads, buildings: s.buildings }) });
    await sleep(500);
    await pages[0].locator('.board').screenshot({ path: out });
    console.log('wrote', out);
  } finally {
    await browser.close();
    proc.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
})();
