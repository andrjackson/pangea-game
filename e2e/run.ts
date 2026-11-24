/**
 * Browser test pass: drives real game screens with three players.
 *
 *   npm run build            (the server serves the built client)
 *   npx tsx e2e/run.ts       (needs the `playwright` package and a Chromium it can launch)
 *
 * Starts its own server on port 3100 with a throwaway save folder and the debug hook on,
 * which the tests use to set up situations (hands, knights, cards) quickly.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CIVS, RAIDERS, bankRate, emptyHand, victoryPoints, type CivId, type GameState, type Hand, type Knight, type ProgressId } from '@pangea/engine';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = require('playwright') as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3100;
const URL = `http://localhost:${PORT}`;
const NAMES = ['Ana', 'Ben', 'Cy'];
const only = process.argv[2];
let DATA_DIR = '';

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function startServer(): Promise<{ proc: ChildProcess; dataDir: string }> {
  if (!existsSync(join(root, 'packages/client/dist/index.html'))) throw new Error('Run "npm run build" first.');
  const dataDir = mkdtempSync(join(tmpdir(), 'pangea-e2e-'));
  const proc = spawn(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'packages/server/src/index.ts')], {
    env: { ...process.env, PORT: String(PORT), PANGEA_DEBUG: '1', PANGEA_DATA: join(dataDir, 'games') },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${URL}/health`)).ok) return { proc, dataDir };
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  proc.kill();
  throw new Error('Server did not start');
}

async function getState(code: string): Promise<GameState> {
  const res = await fetch(`${URL}/debug/${code}`);
  assert(res.ok, 'debug state fetch');
  return (await res.json()) as GameState;
}

async function patch(code: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${URL}/debug/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert(res.ok, 'debug patch');
  await sleep(150);
}

async function waitFor(code: string, what: string, pred: (s: GameState) => boolean, ms = 4000): Promise<GameState> {
  const end = Date.now() + ms;
  let s = await getState(code);
  while (!pred(s)) {
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${what}`);
    await sleep(100);
    s = await getState(code);
  }
  return s;
}

const hand = (cards: Partial<Hand>): Hand => ({ ...emptyHand(), ...cards });
const knight = (owner: number, level: 1 | 2 | 3, active = true): Knight => ({ owner, level, active, activatedOnTurn: -1, actedOnTurn: -1, promotedOnTurn: -1 });

interface Table {
  code: string;
  /** Pages by game player index. */
  P: Page[];
  name: (i: number) => string;
  errors: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function table(browser: any, civs: CivId[] = ['rome', 'japan', 'mali'], lobby?: (pages: Page[]) => Promise<void>): Promise<Table> {
  const errors: string[] = [];
  const pages: Page[] = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e: Error) => errors.push(`${NAMES[i]}: ${e.message}`));
    await p.goto(URL);
    pages.push(p);
  }
  await pages[0].fill('input', NAMES[0]);
  await pages[0].click('text=Create a new game');
  await pages[0].waitForSelector('.code-box strong');
  const code = (await pages[0].textContent('.code-box strong')).trim();
  for (let i = 1; i < 3; i++) {
    await pages[i].fill('input >> nth=0', NAMES[i]);
    await pages[i].fill('.code-input', code);
    await pages[i].click('button:text-is("Join")');
    await pages[i].waitForSelector('.civ-grid');
  }
  for (let i = 0; i < 3; i++) {
    await pages[i].click(`.civ-card:has-text("${CIVS[civs[i]].name}")`);
    await sleep(100);
  }
  if (lobby) await lobby(pages);
  await pages[0].click('text=Start the game');
  await pages[0].waitForSelector('.board');
  for (let step = 0; step < 12; step++) {
    let done = false;
    for (let tries = 0; tries < 20 && !done; tries++) {
      for (const p of pages) {
        const n = await p.locator('.target').count();
        if (n) {
          await p.locator('.target').nth((step * 7) % n).click({ force: true });
          done = true;
          break;
        }
      }
      if (!done) await sleep(100);
    }
    await sleep(120);
  }
  const s = await waitFor(code, 'setup to finish', (g) => g.phase === 'play');
  const P = s.players.map((pl) => pages[civs.indexOf(pl.civ)]);
  return { code, P, name: (i) => s.players[i].name, errors };
}

async function clickVertex(p: Page, v: number) {
  await p.locator(`[data-vertex="${v}"]`).click({ force: true });
}
async function clickEdge(p: Page, e: number) {
  await p.locator(`[data-edge="${e}"]`).click({ force: true });
}
async function clickHex(p: Page, h: number) {
  await p.locator(`[data-hex="${h}"]`).click({ force: true });
}
/** Waits up to 3s for the tab title to contain `text`; returns the last title seen. */
async function titleContains(p: Page, text: string): Promise<string> {
  let title = '';
  for (let i = 0; i < 30; i++) {
    title = await p.title();
    if (title.includes(text)) break;
    await sleep(100);
  }
  return title;
}

async function openCard(p: Page, name: string) {
  await p.waitForSelector('.card-player', { state: 'detached' });
  await sleep(150);
  await p.click(`.progress-card:has-text("${name}")`);
  await p.waitForSelector('.card-player');
}
async function pickCards(p: Page, n: number) {
  for (let i = 0; i < n; i++) await p.locator('.decision .card-chip.clickable').first().click();
  await p.click('.decision button.primary');
}

function edgeBetween(s: GameState, a: number, b: number): number {
  return s.board.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))!.id;
}
function isEmpty(s: GameState, v: number) {
  return !s.buildings[v] && !s.knights[v];
}
function freeNextToRoad(s: GameState, p: number, exclude: number[] = []): number {
  const v = s.board.vertices.find((x) => !exclude.includes(x.id) && isEmpty(s, x.id) && x.edges.some((e) => s.roads[e] === p));
  assert(v, `free vertex next to player ${p}'s road`);
  return v.id;
}
function ownVertex(s: GameState, p: number, kind: 'settlement' | 'city'): number {
  return Number(Object.entries(s.buildings).find(([, b]) => b.owner === p && b.kind === kind)![0]);
}
/** A chain S–X–Y–Z of empty vertices starting from a player's settlement. */
function chainFrom(s: GameState, start: number): [number, number, number] {
  for (const x of s.board.vertices[start].adj) {
    if (!isEmpty(s, x)) continue;
    for (const y of s.board.vertices[x].adj) {
      if (y === start || !isEmpty(s, y)) continue;
      for (const z of s.board.vertices[y].adj) {
        if (z === x || z === start || !isEmpty(s, z)) continue;
        return [x, y, z];
      }
    }
  }
  throw new Error('no chain');
}

// ---------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------

type Scenario = { name: string; run: (t: Table) => Promise<void>; civs?: CivId[]; lobby?: (pages: Page[]) => Promise<void> };

const scenarios: Scenario[] = [
  {
    name: 'lobby options: host sets the victory target and number layout',
    lobby: async (pages) => {
      await pages[0].selectOption('.options select >> nth=0', '10');
      await pages[0].selectOption('.options select >> nth=1', 'balanced');
      await pages[1].waitForSelector('.options:has-text("First to 10")');
      const guestSelects = await pages[1].locator('.options select').count();
      assert(guestSelects === 0, 'only the host gets controls');
    },
    run: async (t) => {
      const s = await getState(t.code);
      assert(s.options.winVp === 10 && s.options.tokens === 'balanced', 'options carried into the game');
      const title = await t.P[0].getAttribute('.raid', 'title');
      assert(title.includes(RAIDERS[s.raiders].name), `top bar names the raiders (${s.raiders})`);
    },
  },
  {
    name: 'what just happened: production labels float up, new pieces glow, tooltips explain',
    run: async (t) => {
      let s = await getState(t.code);
      const hex = s.board.hexes.find((h) => h.token !== null && h.token !== 7 && h.id !== s.robber && s.board.vertices.some((v) => v.hexes.includes(h.id) && s.buildings[v.id]))!;
      const red = Math.min(6, hex.token! - 1);
      await patch(t.code, { 'flags.augury': { red, yellow: hex.token! - red } });
      await t.P[0].click('text=Roll dice');
      await t.P[1].waitForSelector('.float-label', { timeout: 4000 });
      if (process.env.PANGEA_SHOTS) {
        await sleep(500);
        await t.P[1].screenshot({ path: join(process.env.PANGEA_SHOTS, 'production-labels.png') });
      }
      await patch(t.code, { 'players.0.hand': hand({ brick: 1, lumber: 1 }) });
      await t.P[0].click('.btn.build:has-text("Road")');
      await t.P[0].locator('[data-edge]').first().click({ force: true });
      await t.P[2].waitForSelector('.recent-edge', { state: 'attached', timeout: 4000 });
      if (process.env.PANGEA_SHOTS) await t.P[2].screenshot({ path: join(process.env.PANGEA_SHOTS, 'recent-road.png') });
      const tips = await t.P[0].locator('svg.board title').allTextContents();
      assert(tips.some((x) => x.includes('Produces')), 'tiles explain what they produce');
      assert(tips.some((x) => x.includes("'s road")), 'roads name their owner');
      const heads = await t.P[0].locator('.log-turn').allTextContents();
      assert(heads.some((h) => h.startsWith('Turn 1')) && heads.includes('Setup'), `log grouped by turn (${heads.join(' | ')})`);
      s = await getState(t.code);
      assert(s.production && s.production.items.length > 0, 'production recorded');
    },
  },
  {
    name: 'trading: responses show, counter-offer goes straight to the current player',
    run: async (t) => {
      await patch(t.code, { rolled: true, 'players.0.hand': hand({ brick: 2 }), 'players.1.hand': hand({ ore: 2 }), 'players.2.hand': hand({ wool: 1 }) });
      await t.P[0].locator('.trade-side:has-text("You give") .card-chip[title="Brick"]').click();
      await t.P[0].locator('.trade-side:has-text("You get") .card-chip[title="Ore"]').click();
      await t.P[0].click('text=Propose trade');
      await t.P[2].waitForSelector('.offers li');
      await t.P[2].click('.offers button:has-text("Decline")');
      await t.P[0].waitForSelector('.resp.no');
      await t.P[1].click('.offers button:has-text("Counter")');
      // Ben counters: 2 ore for 2 brick instead of 1 for 1
      await t.P[1].locator('.trade-side:has-text("You give") .card-chip[title="Ore"]').click();
      await t.P[1].locator('.trade-side:has-text("You get") .card-chip[title="Brick"]').click();
      await t.P[1].click('text=Propose trade');
      await waitFor(t.code, 'counter-offer', (g) => g.trades.some((o) => o.from === 1 && o.to === 0));
      await t.P[0].waitForSelector('.offers li:has-text("(to you)")');
      await t.P[0].locator('.offers li:has-text("(to you)") button:has-text("Accept")').click();
      const s = await waitFor(t.code, 'counter accepted', (g) => g.players[0].hand.ore === 2);
      assert(s.players[0].hand.brick === 0 && s.players[1].hand.brick === 2, 'counter-offer traded 2 for 2');
    },
  },
  {
    name: 'end of game: results screen, then play again with the same table',
    run: async (t) => {
      let s = await getState(t.code);
      const settlement = Number(Object.entries(s.buildings).find(([, b]) => b.owner === 0 && b.kind === 'settlement')![0]);
      await patch(t.code, { rolled: true, 'players.0.shields': s.options.winVp - victoryPoints(s, 0) - 1, 'players.0.hand': hand({ grain: 2, ore: 3 }) });
      await t.P[0].click('.btn.build:has-text("City")');
      await clickVertex(t.P[0], settlement);
      s = await waitFor(t.code, 'game over', (g) => g.phase === 'ended');
      for (const p of t.P) await p.waitForSelector('.end-screen');
      if (process.env.PANGEA_SHOTS) await t.P[1].screenshot({ path: join(process.env.PANGEA_SHOTS, 'end-screen.png') });
      const heading = await t.P[1].textContent('.end-title');
      assert(heading.includes(t.name(0)), `winner announced (${heading})`);
      assert((await t.P[1].locator('.stats tbody tr').count()) === 6, 'stats table shown');
      await t.P[2].click('text=Look at the board');
      await t.P[2].click('text=Show results');
      await t.P[2].waitForSelector('.end-screen');
      await t.P[1].click('text=Play again with the same table');
      s = await waitFor(t.code, 'new game', (g) => g.phase === 'setup' && g.turn === 0);
      for (const p of t.P) await p.waitForSelector('.end-screen', { state: 'detached' });
      assert(s.players.map((p) => p.civ).sort().join() === ['japan', 'mali', 'rome'].sort().join(), 'same civs at the table');
    },
  },
  {
    name: 'territory: tiles take on civ art and shared tiles show both civs',
    run: async (t) => {
      const owned = await t.P[0].locator('[data-territory]').count();
      assert(owned > 0, 'tiles touching starting pieces are claimed');
      const s = await getState(t.code);
      // a tile player 0 holds alone; give player 1 a road on one of its edges
      const solo = s.board.hexes.find((h) => {
        const owners = new Set<number>();
        for (const v of s.board.vertices) if (v.hexes.includes(h.id) && s.buildings[v.id]) owners.add(s.buildings[v.id].owner);
        for (const e of s.board.edges) if (e.hexes.includes(h.id) && s.roads[e.id] !== undefined) owners.add(s.roads[e.id]);
        return owners.size === 1 && owners.has(0);
      })!;
      const edge = s.board.edges.find((e) => e.hexes.includes(solo.id) && s.roads[e.id] === undefined)!;
      await patch(t.code, { [`roads.${edge.id}`]: 1 });
      await t.P[2].waitForSelector('[data-territory="0,1"], [data-territory="1,0"]', { timeout: 4000 });
    },
  },
  {
    name: 'report a problem saves the game and the note on the host',
    run: async (t) => {
      await t.P[1].click('button:has-text("Report a problem")');
      await t.P[1].fill('.modal textarea', 'Test report: the robber looked sleepy');
      await t.P[1].click('.modal button:has-text("Save report")');
      await t.P[1].waitForSelector('.toast.ok');
      const dir = join(DATA_DIR, 'reports');
      const files = readdirSync(dir);
      assert(files.length === 1, 'one report file written');
      const report = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
      assert(report.note.includes('sleepy') && report.reporter === t.name(1) && report.game?.board, 'report holds note, reporter and full game');
    },
  },
  {
    name: 'turn alerts: tab title follows whose move it is',
    run: async (t) => {
      const title0 = await titleContains(t.P[0], 'Your turn');
      const title1 = await t.P[1].title();
      assert(title0.includes('Your turn'), `current player's title shows their turn (got "${title0}")`);
      assert(title1 === 'Pangea', `others' titles stay plain (got "${title1}")`);
      await patch(t.code, { 'players.1.hand': hand({ brick: 9 }), 'flags.augury': { red: 3, yellow: 4 } });
      await t.P[0].click('text=Roll dice');
      await waitFor(t.code, 'discard decision', (s) => s.queue.some((q) => q.kind === 'discard'));
      const t1 = await titleContains(t.P[1], 'discard 4');
      assert(t1.includes('discard 4'), `discarding player's title says so (got "${t1}")`);
      await pickCards(t.P[1], 4);
      await waitFor(t.code, 'discard resolved', (s) => s.queue.length === 0);
    },
  },
  {
    name: 'bank trade through the trade panel',
    run: async (t) => {
      await patch(t.code, { rolled: true, 'players.0.hand': hand({ grain: 4 }) });
      await t.P[0].click('.bank .card-chip[title="Grain"]');
      await t.P[0].click('.bank .btn-row:has-text("Get") .card-chip[title="Ore"]');
      const rate = bankRate(await getState(t.code), 0, 'grain', null);
      const s = await waitFor(t.code, 'bank trade', (g) => g.players[0].hand.ore === 1);
      assert(s.players[0].hand.grain === 4 - rate, `paid grain at the player's ${rate}:1 rate`);
    },
  },
  {
    name: 'barbarian raid lost: player with two cities chooses which to lose',
    run: async (t) => {
      let s = await getState(t.code);
      const settlement = ownVertex(s, 1, 'settlement');
      await patch(t.code, {
        [`buildings.${settlement}.kind`]: 'city',
        'barbarian.position': 6,
        'flags.augury': { red: 2, yellow: 3 },
      });
      // find an rng seed whose first draw is a ship face (0-2 of 6)
      await patch(t.code, { rng: await shipSeed() });
      await t.P[0].click('text=Roll dice');
      s = await waitFor(t.code, 'loseCity decision', (g) => g.queue.some((q) => q.kind === 'loseCity'));
      assert(s.barbarian.attacks === 1 && s.robberActive, 'raid happened and robber woke');
      const panel = await t.P[1].textContent('.decision');
      assert(panel.includes('choose a city to lose'), 'decision panel explains the choice');
      await clickVertex(t.P[1], settlement);
      s = await waitFor(t.code, 'city reduced', (g) => g.queue.length === 0);
      assert(s.buildings[settlement].kind === 'settlement', 'chosen city reduced');
      assert(Object.values(s.buildings).filter((b) => b.owner === 0 && b.kind === 'city').length === 0, 'single-city players lost theirs automatically');
    },
  },
  {
    name: 'barbarian raid won with tied defenders: both pick a progress deck',
    run: async (t) => {
      let s = await getState(t.code);
      const k0 = freeNextToRoad(s, 0);
      const k1 = freeNextToRoad(s, 1, [k0]);
      await patch(t.code, {
        [`knights.${k0}`]: knight(0, 2),
        [`knights.${k1}`]: knight(1, 2),
        'barbarian.position': 6,
        'flags.augury': { red: 2, yellow: 3 },
        rng: await shipSeed(),
      });
      await t.P[0].click('text=Roll dice');
      s = await waitFor(t.code, 'pickTrack decisions', (g) => g.queue.filter((q) => q.kind === 'pickTrack').length === 2);
      await t.P[0].click('.decision button:has-text("Science")');
      await t.P[1].click('.decision button:has-text("Politics")');
      s = await waitFor(t.code, 'cards drawn', (g) => g.queue.length === 0);
      for (const i of [0, 1]) assert(s.players[i].progress.length + s.players[i].vpCards.length === 1, `player ${i} drew a card`);
      assert(Object.values(s.knights).every((k) => !k.active), 'knights went home');
    },
  },
  {
    name: 'knight displaces a weaker knight; owner relocates it',
    run: async (t) => {
      let s = await getState(t.code);
      const start = ownVertex(s, 0, 'settlement');
      const [x, y, z] = chainFrom(s, start);
      await patch(t.code, {
        rolled: true,
        [`roads.${edgeBetween(s, start, x)}`]: 0,
        [`roads.${edgeBetween(s, x, y)}`]: 0,
        [`roads.${edgeBetween(s, y, z)}`]: 1,
        [`knights.${x}`]: knight(0, 2),
        [`knights.${y}`]: knight(1, 1),
      });
      await t.P[0].click('.btn.build:has-text("Move knight")');
      await clickVertex(t.P[0], x);
      await clickVertex(t.P[0], y);
      s = await waitFor(t.code, 'relocation decision', (g) => g.queue.some((q) => q.kind === 'relocateKnight'));
      await clickVertex(t.P[1], z);
      s = await waitFor(t.code, 'relocated', (g) => g.queue.length === 0);
      assert(s.knights[y]?.owner === 0 && s.knights[z]?.owner === 1, 'knights swapped places correctly');
    },
  },
  {
    name: 'cards: Harbor Levy offers and returns across two opponents',
    run: async (t) => {
      await patch(t.code, {
        rolled: true,
        'players.0.progress': ['harborLevy'],
        'players.0.hand': hand({ brick: 2 }),
        'players.1.hand': hand({ coin: 1 }),
        'players.2.hand': hand({ cloth: 1 }),
      });
      await openCard(t.P[0], 'Harbor Levy');
      await t.P[0].click('.card-player button.primary');
      for (const opp of [1, 2]) {
        await waitFor(t.code, `offer to ${opp}`, (g) => g.queue[0]?.kind === 'harborLevyOffer');
        await t.P[0].click('.decision .card-chip[title="Brick"]');
        await waitFor(t.code, `return from ${opp}`, (g) => g.queue[0]?.kind === 'harborLevyReturn');
        await t.P[opp].locator('.decision .card-chip.clickable').first().click();
      }
      const s = await waitFor(t.code, 'levy done', (g) => g.queue.length === 0);
      assert(s.players[0].hand.coin === 1 && s.players[0].hand.cloth === 1 && s.players[0].hand.brick === 0, 'got both commodities');
    },
  },
  {
    name: 'cards: Tribute shows the richer hand and takes 2',
    run: async (t) => {
      await patch(t.code, { rolled: true, 'players.0.progress': ['tribute'], 'players.1.shields': 4, 'players.1.hand': hand({ ore: 2, wool: 1 }) });
      await openCard(t.P[0], 'Tribute');
      await t.P[0].click(`.card-player button:has-text("${t.name(1)}")`);
      await waitFor(t.code, 'tribute decision', (g) => g.queue[0]?.kind === 'tributeTake');
      await pickCards(t.P[0], 2);
      const s = await waitFor(t.code, 'tribute done', (g) => g.queue.length === 0);
      assert(s.players[1].hand.ore + s.players[1].hand.wool === 1, 'took 2 cards');
    },
  },
  {
    name: 'cards: Turncoat (opponent gives up a knight, you place one)',
    run: async (t) => {
      let s = await getState(t.code);
      const theirs = freeNextToRoad(s, 1);
      await patch(t.code, { rolled: true, 'players.0.progress': ['turncoat'], [`knights.${theirs}`]: knight(1, 2) });
      await openCard(t.P[0], 'Turncoat');
      await t.P[0].click(`.card-player button:has-text("${t.name(1)}")`);
      await waitFor(t.code, 'remove decision', (g) => g.queue[0]?.kind === 'turncoatRemove');
      await clickVertex(t.P[1], theirs);
      s = await waitFor(t.code, 'place decision', (g) => g.queue[0]?.kind === 'turncoatPlace');
      const mine = freeNextToRoad(s, 0);
      await clickVertex(t.P[0], mine);
      s = await waitFor(t.code, 'placed', (g) => g.queue.length === 0);
      assert(s.knights[mine]?.owner === 0 && s.knights[mine].level === 2, 'turncoat placed at level 2');
    },
  },
  {
    name: 'cards: Envoy removes an opponent road, then rebuilds one of yours',
    run: async (t) => {
      let s = await getState(t.code);
      const theirRoad = Number(Object.entries(s.roads).find(([, o]) => o === 2)![0]);
      await patch(t.code, { rolled: true, 'players.0.progress': ['envoy', 'envoy'] });
      await openCard(t.P[0], 'Envoy');
      await t.P[0].click('text=Choose on the board');
      await clickEdge(t.P[0], theirRoad);
      s = await waitFor(t.code, 'road removed', (g) => g.roads[theirRoad] === undefined);
      const myRoad = Number(Object.entries(s.roads).find(([, o]) => o === 0)![0]);
      await openCard(t.P[0], 'Envoy');
      await t.P[0].click('text=Choose on the board');
      await clickEdge(t.P[0], myRoad);
      await waitFor(t.code, 'rebuild decision', (g) => g.queue[0]?.kind === 'envoyRebuild');
      await t.P[0].waitForSelector('.decision:has-text("rebuild a road")');
      await clickEdge(t.P[0], myRoad);
      s = await waitFor(t.code, 'rebuilt', (g) => g.queue.length === 0);
      assert(s.roads[myRoad] === 0, 'own road rebuilt');
    },
  },
  {
    name: 'cards: Plot displaces a knight on your road',
    run: async (t) => {
      let s = await getState(t.code);
      const v = freeNextToRoad(s, 0);
      await patch(t.code, { rolled: true, 'players.0.progress': ['plot'], [`knights.${v}`]: knight(2, 3) });
      await openCard(t.P[0], 'Plot');
      await t.P[0].click('text=Choose on the board');
      await clickVertex(t.P[0], v);
      s = await waitFor(t.code, 'plot resolved', (g) => !g.knights[v]);
      if (s.queue[0]?.kind === 'relocateKnight') {
        const opt = (s.queue[0] as { options: number[] }).options[0];
        await clickVertex(t.P[2], opt);
        s = await waitFor(t.code, 'relocated', (g) => g.queue.length === 0);
        assert(s.knights[opt]?.owner === 2, 'knight relocated');
      }
    },
  },
  {
    name: 'cards: Informant takes a chosen progress card',
    run: async (t) => {
      await patch(t.code, { rolled: true, 'players.0.progress': ['informant'], 'players.2.progress': ['canals', 'warHorn'] });
      await openCard(t.P[0], 'Informant');
      await t.P[0].click(`.card-player button:has-text("${t.name(2)}")`);
      await waitFor(t.code, 'informant decision', (g) => g.queue[0]?.kind === 'informantTake');
      await t.P[0].click('.decision button:has-text("War Horn")');
      const s = await waitFor(t.code, 'taken', (g) => g.queue.length === 0);
      assert(s.players[0].progress.includes('warHorn') && s.players[2].progress.length === 1, 'card moved');
    },
  },
  {
    name: 'cards: Dynastic Marriage and Unrest make others choose cards',
    run: async (t) => {
      await patch(t.code, { rolled: true, 'players.0.progress': ['dynasticMarriage', 'unrest'], 'players.1.shields': 3, 'players.1.hand': hand({ ore: 3 }), 'players.2.hand': hand({ wool: 6 }) });
      await openCard(t.P[0], 'Dynastic Marriage');
      await t.P[0].click('.card-player button.primary');
      await waitFor(t.code, 'give decision', (g) => g.queue[0]?.kind === 'giveCards');
      await pickCards(t.P[1], 2);
      let s = await waitFor(t.code, 'given', (g) => g.queue.length === 0);
      assert(s.players[0].hand.ore >= 2, 'received 2 ore');
      await patch(t.code, { 'players.1.hand': hand({ ore: 4 }) });
      await openCard(t.P[0], 'Unrest');
      await t.P[0].click('.card-player button.primary');
      s = await waitFor(t.code, 'unrest discards', (g) => g.queue.filter((q) => q.kind === 'discard').length === 2);
      const counts = s.queue.map((q) => (q as { count: number }).count);
      await pickCards(t.P[1], counts[0]);
      await pickCards(t.P[2], counts[1]);
      s = await waitFor(t.code, 'unrest done', (g) => g.queue.length === 0);
      assert(s.players[2].hand.wool === 3, 'half of 6 discarded');
    },
  },
  {
    name: 'cards: board-targeted science and politics cards',
    run: async (t) => {
      let s = await getState(t.code);
      // High Priest
      const target = ownVertex(s, 1, 'city');
      const hex = s.board.vertices[target].hexes.find((h) => h !== s.robber)!;
      await patch(t.code, { rolled: true, robberActive: true, 'players.0.progress': ['highPriest'], 'players.1.hand': hand({ grain: 1 }) });
      await openCard(t.P[0], 'High Priest');
      await t.P[0].click('text=Choose on the board');
      await clickHex(t.P[0], hex);
      s = await waitFor(t.code, 'robber moved', (g) => g.robber === hex);
      // Surveyor
      const a = s.board.hexes.find((h) => h.token === 3)!.id;
      const b = s.board.hexes.find((h) => h.token === 10)!.id;
      await patch(t.code, { 'players.0.progress': ['surveyor'] });
      await openCard(t.P[0], 'Surveyor');
      await t.P[0].click('text=Choose on the board');
      await clickHex(t.P[0], a);
      await clickHex(t.P[0], b);
      s = await waitFor(t.code, 'tokens swapped', (g) => g.board.hexes[a].token === 10 && g.board.hexes[b].token === 3);
      // Armory
      const kv = freeNextToRoad(s, 0);
      await patch(t.code, { 'players.0.progress': ['armory'], [`knights.${kv}`]: knight(0, 1, false) });
      await openCard(t.P[0], 'Armory');
      await t.P[0].click('text=Choose on the board');
      await clickVertex(t.P[0], kv);
      await t.P[0].click('button:has-text("Promote 1")');
      s = await waitFor(t.code, 'promoted', (g) => g.knights[kv]?.level === 2);
      // Master Mason
      const city = ownVertex(s, 0, 'city');
      await patch(t.code, { 'players.0.progress': ['masterMason'] });
      await openCard(t.P[0], 'Master Mason');
      await t.P[0].click('text=Choose on the board');
      await clickVertex(t.P[0], city);
      s = await waitFor(t.code, 'wall', (g) => g.buildings[city].wall);
      // Physician
      const settle = ownVertex(s, 0, 'settlement');
      await patch(t.code, { 'players.0.progress': ['physician'], 'players.0.hand': hand({ ore: 2, grain: 1 }) });
      await openCard(t.P[0], 'Physician');
      await t.P[0].click('text=Choose on the board');
      await clickVertex(t.P[0], settle);
      s = await waitFor(t.code, 'city', (g) => g.buildings[settle].kind === 'city');
      // Caravan
      const chex = s.board.vertices[settle].hexes.find((h) => s.board.hexes[h].terrain !== 'desert')!;
      await patch(t.code, { 'players.0.progress': ['caravan'] });
      await openCard(t.P[0], 'Caravan');
      await t.P[0].click('text=Choose on the board');
      await clickHex(t.P[0], chex);
      await waitFor(t.code, 'caravan', (g) => g.caravan?.owner === 0 && g.caravan.hex === chex);
    },
  },
  {
    name: 'cards: instant and chooser cards (Monsoon Winds, Guild Charter, Road Corps, Canals)',
    run: async (t) => {
      await patch(t.code, { rolled: true, 'players.0.progress': ['monsoonWinds', 'guildCharter', 'roadCorps', 'canals'], 'players.1.hand': hand({ cloth: 1 }) });
      await openCard(t.P[0], 'Monsoon Winds');
      await t.P[0].click('.card-player .card-chip[title="Wool"]');
      await waitFor(t.code, 'monsoon', (g) => g.flags.monsoon === 'wool');
      await openCard(t.P[0], 'Guild Charter');
      await t.P[0].click('.card-player .card-chip[title="Cloth"]');
      await waitFor(t.code, 'charter', (g) => g.players[1].hand.cloth === 0);
      await openCard(t.P[0], 'Road Corps');
      await t.P[0].click('.card-player button.primary');
      await waitFor(t.code, 'free roads', (g) => g.flags.freeRoads === 2);
      await t.P[0].click('.btn.build:has-text("Road")');
      await t.P[0].locator('[data-edge]').first().click({ force: true });
      await waitFor(t.code, 'free road used', (g) => g.flags.freeRoads === 1);
      await openCard(t.P[0], 'Canals');
      await t.P[0].click('.card-player button.primary');
      await waitFor(t.code, 'canals played', (g) => !g.players[0].progress.includes('canals'));
    },
  },
  {
    name: 'cards: Augury sets the dice; opponent over the progress limit must discard',
    run: async (t) => {
      await patch(t.code, { rolled: false, 'players.0.progress': ['augury'], 'players.1.progress': ['canals', 'plot', 'envoy', 'tribute', 'informant'] as ProgressId[] });
      await openCard(t.P[0], 'Augury');
      await t.P[0].fill('.card-player input >> nth=0', '6');
      await t.P[0].fill('.card-player input >> nth=1', '5');
      await t.P[0].click('.card-player button.primary');
      await waitFor(t.code, 'augury flag', (g) => g.flags.augury?.red === 6);
      // Ben is over the 4-card limit, so the game waits for his discard before the roll.
      let s = await waitFor(t.code, 'progress discard', (g) => g.queue.some((q) => q.kind === 'discardProgress' && q.player === 1));
      const t1 = await titleContains(t.P[1], 'discard down to 4');
      assert(t1.includes('discard down to 4'), `over-limit player is alerted (got "${t1}")`);
      await t.P[1].locator('.decision button').first().click();
      s = await waitFor(t.code, 'discarded', (g) => g.players[1].progress.length === 4 && g.queue.length === 0);
      await t.P[0].click('text=Roll dice');
      s = await waitFor(t.code, 'rolled', (g) => g.rolled);
      assert(s.dice!.red === 6 && s.dice!.yellow === 5, 'dice as chosen');
    },
  },
];

async function shipSeed(): Promise<number> {
  // mulberry32 first draw; faces 0-2 are the ship
  for (let k = 1; ; k++) {
    let a = (k + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    if (Math.floor(v * 6) < 3) return k;
  }
}

// ---------------------------------------------------------------------------

(async () => {
  const { proc, dataDir } = await startServer();
  DATA_DIR = dataDir;
  const browser = await chromium.launch();
  let failed = 0;
  try {
    for (const sc of scenarios) {
      if (only && !sc.name.includes(only)) continue;
      const t = await table(browser, sc.civs, sc.lobby);
      try {
        await sc.run(t);
        assert(t.errors.length === 0, `no page errors (${t.errors.join('; ')})`);
        console.log(`PASS  ${sc.name}`);
      } catch (err) {
        failed++;
        console.log(`FAIL  ${sc.name}\n      ${(err as Error).message}`);
        await t.P[0].screenshot({ path: join(tmpdir(), `pangea-fail-${failed}.png`) });
      }
      for (const p of t.P) await p.context().close();
    }
  } finally {
    await browser.close();
    proc.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} scenario(s) failed` : '\nAll scenarios passed');
  process.exit(failed ? 1 : 0);
})();
