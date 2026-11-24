import { describe, expect, it } from 'vitest';
import { generateBoard, hexNeighbors } from '../src/board';
import { RAIDERS, TOKEN_SEQUENCE } from '../src/data';
import { createGame, upgradeState } from '../src/engine';
import { handSize, victoryPoints, vpBreakdown } from '../src/helpers';
import type { GameState } from '../src/types';
import { act, rollWith, setHand, setupGame } from './util';

describe('game options', () => {
  it('a lower victory target ends the game sooner', () => {
    let s = setupGame(42);
    s.options.winVp = 10;
    s.rolled = true;
    s.players[0].shields = 10 - victoryPoints(s, 0) - 1;
    setHand(s, 0, { grain: 2, ore: 3 });
    const v = Number(Object.entries(s.buildings).find(([, b]) => b.owner === 0 && b.kind === 'settlement')![0]);
    s = act(s, 0, { type: 'buildCity', vertex: v });
    expect(s.winner).toBe(0);
  });

  it('rejects targets outside 10–15', () => {
    const players = [
      { name: 'A', civ: 'rome' as const },
      { name: 'B', civ: 'japan' as const },
      { name: 'C', civ: 'mali' as const },
    ];
    expect(() => createGame(players, 1, { winVp: 9 })).toThrow(/between 10 and 15/);
    expect(createGame(players, 1, { winVp: 15 }).options.winVp).toBe(15);
  });

  it('balanced layout never puts 6s and 8s next to each other', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const board = generateBoard({ rng: seed }, 'balanced');
      const red = (n: number | null) => n === 6 || n === 8;
      for (const h of board.hexes) if (red(h.token)) expect(hexNeighbors(board.hexes, h).some((x) => red(x.token))).toBe(false);
      const tokens = board.hexes.filter((h) => h.token !== null).map((h) => h.token).sort((a, b) => a! - b!);
      expect(tokens).toEqual([...TOKEN_SEQUENCE].sort((a, b) => a - b));
    }
  });
});

describe('raider themes', () => {
  it('picks a theme, never Vikings when a Norse player is at the table', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = createGame(
        [
          { name: 'A', civ: 'norse' },
          { name: 'B', civ: 'japan' },
          { name: 'C', civ: 'mali' },
        ],
        seed,
      );
      expect(Object.keys(RAIDERS)).toContain(s.raiders);
      expect(s.raiders).not.toBe('vikings');
      seen.add(s.raiders);
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('production record and stats', () => {
  it('records what each tile paid to whom, and counts it', () => {
    const s = setupGame(42);
    const producing = s.board.hexes.find((h) => h.token !== null && h.id !== s.robber && s.board.vertices.some((v) => v.hexes.includes(h.id) && s.buildings[v.id]))!;
    const red = Math.min(6, producing.token! - 1);
    const after = rollWith(s, red, producing.token! - red, 'politics');
    const rec = after.production!;
    expect(rec.sum).toBe(producing.token);
    expect(rec.items.some((i) => i.hex === producing.id)).toBe(true);
    for (const p of after.players) {
      const fromRecord = rec.items.filter((i) => i.player === p.id).reduce((n, i) => n + handSize(i.cards), 0);
      expect(after.stats.produced[p.id]).toBe(fromRecord);
      expect(handSize(p.hand) - handSize(s.players[p.id].hand)).toBe(fromRecord);
    }
  });

  it('counts trades, steals and played cards', () => {
    let s = setupGame(42);
    s.rolled = true;
    setHand(s, 0, { brick: 1 });
    setHand(s, 1, { ore: 1 });
    s = act(s, 0, { type: 'offerTrade', give: { brick: 1 }, get: { ore: 1 } });
    s = act(s, 1, { type: 'respondTrade', offer: s.trades[0].id, accept: true });
    s = act(s, 0, { type: 'confirmTrade', offer: s.trades[0].id, with: 1 });
    expect(s.stats.trades).toEqual([1, 1, 0]);
    s.players[0].progress = ['highPriest'];
    s.robberActive = true;
    setHand(s, 2, { wool: 2 });
    const v = Number(Object.entries(s.buildings).find(([, b]) => b.owner === 2)![0]);
    const hex = s.board.vertices[v].hexes.find((h) => h !== s.robber)!;
    s = act(s, 0, { type: 'playProgress', card: 'highPriest', params: { hex } });
    expect(s.stats.progressPlayed[0]).toBe(1);
    expect(s.stats.robbed[0]).toBeGreaterThanOrEqual(1);
    expect(s.stats.lostToRobber[2]).toBeGreaterThanOrEqual(1);
  });
});

describe('saves from before these features', () => {
  it('are upgraded with defaults', () => {
    const s = setupGame(42) as Partial<GameState>;
    delete s.options;
    delete s.stats;
    delete s.raiders;
    delete s.production;
    const up = upgradeState(s as GameState);
    expect(up.options.winVp).toBe(13);
    expect(up.stats.produced).toEqual([0, 0, 0]);
    expect(up.raiders).toBe('vikings');
  });
});

describe('VP breakdown', () => {
  it('adds up to the total', () => {
    const s = setupGame(42);
    s.players[1].shields = 2;
    s.players[1].vpCards = ['writing'];
    s.caravan = { hex: 0, owner: 1 };
    const b = vpBreakdown(s, 1);
    expect(b).toMatchObject({ settlements: 1, cities: 2, shields: 2, progress: 1, caravan: 1 });
    expect(b.total).toBe(victoryPoints(s, 1));
  });
});
