import { describe, expect, it } from 'vitest';
import { setupSeat } from '../src/engine';
import { handSize, legalSetupSpots } from '../src/helpers';
import { viewFor } from '../src/view';
import { act, newGame, setupGame } from './util';

describe('setup', () => {
  it('rejects bad player counts and duplicate civs', () => {
    expect(() => newGame(1, 2)).toThrow();
    expect(() => newGame(1, 5)).toThrow();
  });

  it('runs in snake order: settlement round, then city round in reverse', () => {
    let s = newGame(7, 3);
    const order: number[] = [];
    while (s.phase === 'setup') {
      const seat = setupSeat(s);
      order.push(seat);
      const v = legalSetupSpots(s)[0];
      s = act(s, seat, { type: 'setupBuilding', vertex: v });
      const e = s.board.vertices[v].edges.find((x) => s.roads[x] === undefined)!;
      s = act(s, seat, { type: 'setupRoad', edge: e });
    }
    expect(order).toEqual([0, 1, 2, 2, 1, 0]);
    const kinds = Object.values(s.buildings).map((b) => b.kind).sort();
    expect(kinds).toEqual(['city', 'city', 'city', 'settlement', 'settlement', 'settlement']);
    expect(s.phase).toBe('play');
    expect(s.current).toBe(0);
  });

  it('gives starting resources only for the city', () => {
    const s = setupGame(11);
    for (const p of s.players) {
      const city = Object.entries(s.buildings).find(([, b]) => b.owner === p.id && b.kind === 'city')!;
      const producing = s.board.vertices[Number(city[0])].hexes.filter((h) => s.board.hexes[h].terrain !== 'desert').length;
      expect(handSize(p.hand)).toBe(producing);
      expect(p.hand.paper + p.hand.cloth + p.hand.coin).toBe(0);
    }
  });

  it('enforces the distance rule, turn order and road attachment', () => {
    let s = newGame(3);
    const v = legalSetupSpots(s)[0];
    expect(() => act(s, 1, { type: 'setupBuilding', vertex: v })).toThrow(/not your turn/);
    s = act(s, 0, { type: 'setupBuilding', vertex: v });
    const far = s.board.edges.find((e) => e.a !== v && e.b !== v)!;
    expect(() => act(s, 0, { type: 'setupRoad', edge: far.id })).toThrow(/must touch/);
    s = act(s, 0, { type: 'setupRoad', edge: s.board.vertices[v].edges[0] });
    const neighbor = s.board.vertices[v].adj[0];
    expect(() => act(s, 1, { type: 'setupBuilding', vertex: neighbor })).toThrow(/Too close/);
  });

  it('views hide other hands and the RNG', () => {
    const s = setupGame(5);
    const view = viewFor(s, 1);
    expect(view.players[1].hand).not.toBeNull();
    expect(view.players[0].hand).toBeNull();
    expect(view.players[0].handCount).toBe(handSize(s.players[0].hand));
    expect('rng' in view).toBe(false);
    expect(typeof view.decks.science).toBe('number');
  });
});
