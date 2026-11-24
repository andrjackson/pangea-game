import { describe, expect, it } from 'vitest';
import { hexInfluence } from '../src/helpers';
import { clearPieces, setupGame } from './util';

describe('territory', () => {
  it('a lone settlement claims every tile it touches', () => {
    const s = setupGame(42);
    clearPieces(s);
    const v = s.board.vertices.find((x) => x.hexes.length === 3)!;
    s.buildings[v.id] = { owner: 1, kind: 'settlement', wall: false, metropolis: null };
    for (const h of v.hexes) expect(hexInfluence(s, h)).toEqual([expect.objectContaining({ player: 1, weight: 2 })]);
    const untouched = s.board.hexes.find((h) => !v.hexes.includes(h.id))!;
    expect(hexInfluence(s, untouched.id)).toEqual([]);
  });

  it('roads spread territory and shared tiles list every player, weighted', () => {
    const s = setupGame(42);
    clearPieces(s);
    const hex = s.board.hexes.find((h) => h.terrain !== 'desert' && s.board.vertices.filter((v) => v.hexes.includes(h.id)).length === 6)!;
    const corners = s.board.vertices.filter((v) => v.hexes.includes(hex.id));
    const edges = s.board.edges.filter((e) => e.hexes.includes(hex.id));
    s.buildings[corners[0].id] = { owner: 0, kind: 'city', wall: false, metropolis: null };
    s.roads[edges[3].id] = 2;
    const inf = hexInfluence(s, hex.id);
    expect(inf.map((i) => [i.player, i.weight]).sort()).toEqual([
      [0, 3],
      [2, 1],
    ]);
    // angles point from the tile center toward each player's piece
    const city = inf.find((i) => i.player === 0)!;
    expect(Math.atan2(corners[0].y - hex.y, corners[0].x - hex.x)).toBeCloseTo(city.angle, 5);
  });

  it('metropolises weigh the most', () => {
    const s = setupGame(42);
    clearPieces(s);
    const v = s.board.vertices.find((x) => x.hexes.length === 3)!;
    s.buildings[v.id] = { owner: 0, kind: 'city', wall: false, metropolis: 'trade' };
    expect(hexInfluence(s, v.hexes[0])[0].weight).toBe(4);
  });
});
