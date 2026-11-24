import { describe, expect, it } from 'vitest';
import { generateBoard, ring, spiral } from '../src/board';
import { TOKEN_SEQUENCE } from '../src/data';

describe('board generation', () => {
  const board = generateBoard({ rng: 1234 });

  it('has the standard island geometry', () => {
    expect(board.hexes).toHaveLength(19);
    expect(board.vertices).toHaveLength(54);
    expect(board.edges).toHaveLength(72);
    expect(board.edges.filter((e) => e.hexes.length === 1)).toHaveLength(30);
  });

  it('uses the standard terrain mix', () => {
    const count = (t: string) => board.hexes.filter((h) => h.terrain === t).length;
    expect([count('hills'), count('forest'), count('pasture'), count('fields'), count('mountains'), count('desert')]).toEqual([3, 4, 4, 4, 3, 1]);
  });

  it('places every number token once, none on the desert', () => {
    const desert = board.hexes.find((h) => h.terrain === 'desert')!;
    expect(desert.token).toBeNull();
    const tokens = board.hexes.filter((h) => h.token !== null).map((h) => h.token!).sort((a, b) => a - b);
    expect(tokens).toEqual([...TOKEN_SEQUENCE].sort((a, b) => a - b));
  });

  it('lays tokens in spiral order', () => {
    // Read tokens back in every possible spiral order; one of them must match the sequence exactly.
    const matches = [0, 1, 2, 3, 4, 5].some((start) => {
      const seq = spiral(start)
        .map(([q, r]) => board.hexes.find((h) => h.q === q && h.r === r)!)
        .filter((h) => h.terrain !== 'desert')
        .map((h) => h.token);
      return seq.every((t, i) => t === TOKEN_SEQUENCE[i]);
    });
    expect(matches).toBe(true);
  });

  it('has 9 harbors: four 3:1 and one 2:1 of each resource, on separate coastal vertices', () => {
    expect(board.harbors).toHaveLength(9);
    const kinds = board.harbors.map((h) => h.kind).sort();
    expect(kinds).toEqual(['any', 'any', 'any', 'any', 'brick', 'grain', 'lumber', 'ore', 'wool']);
    expect(board.vertices.filter((v) => v.harbor !== null)).toHaveLength(18);
    for (const h of board.harbors) expect(board.edges[h.edge].hexes).toHaveLength(1);
  });

  it('rings cover the island exactly once', () => {
    const all = spiral(3).map(([q, r]) => `${q},${r}`);
    expect(new Set(all).size).toBe(19);
    expect(ring(2, 0)).toHaveLength(12);
  });

  it('is deterministic for a seed', () => {
    expect(generateBoard({ rng: 99 })).toEqual(generateBoard({ rng: 99 }));
    expect(generateBoard({ rng: 99 })).not.toEqual(generateBoard({ rng: 100 }));
  });
});
