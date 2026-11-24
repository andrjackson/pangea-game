import { applyAction, createGame, setupSeat } from '../src/engine';
import { legalSetupSpots } from '../src/helpers';
import type { Action, CivId, EventFace, GameState, Hand } from '../src/types';
import { emptyHand } from '../src/data';

export const CIVS3: CivId[] = ['rome', 'japan', 'mali'];

export function newGame(seed = 42, n = 3): GameState {
  const civs: CivId[] = ['rome', 'japan', 'mali', 'norse'];
  return createGame(
    Array.from({ length: n }, (_, i) => ({ name: `P${i}`, civ: civs[i] })),
    seed,
  );
}

/** Plays through setup choosing spread-out legal spots. */
export function setupGame(seed = 42, n = 3): GameState {
  let s = newGame(seed, n);
  let pick = 0;
  while (s.phase === 'setup') {
    const seat = setupSeat(s);
    const spots = legalSetupSpots(s);
    const v = spots[(pick * 17) % spots.length];
    pick++;
    s = applyAction(s, seat, { type: 'setupBuilding', vertex: v });
    const e = s.board.vertices[v].edges.find((x) => s.roads[x] === undefined)!;
    s = applyAction(s, seat, { type: 'setupRoad', edge: e });
  }
  return s;
}

export function act(s: GameState, p: number, a: Action): GameState {
  return applyAction(s, p, a);
}

export function setHand(s: GameState, p: number, cards: Partial<Hand>): void {
  s.players[p].hand = { ...emptyHand(), ...cards };
}

/** Rolls for the current player with chosen number dice and event face (searches RNG seeds for the face). */
export function rollWith(s: GameState, red: number, yellow: number, event: EventFace): GameState {
  for (let k = 1; k < 5000; k++) {
    const t = structuredClone(s);
    t.rng = k;
    t.flags.augury = { red, yellow };
    const next = applyAction(t, t.current, { type: 'roll' });
    if (next.dice!.event === event) return next;
  }
  throw new Error('could not force event face');
}

/** Clears the board of all pieces (keeps board geometry) for hand-built scenarios. */
export function clearPieces(s: GameState): void {
  s.buildings = {};
  s.roads = {};
  s.knights = {};
  s.longestRoad = null;
}

/** Finds a vertex whose hexes include the given terrain types and that is a legal fresh spot. */
export function vertexTouching(s: GameState, pred: (terrains: string[]) => boolean, exclude: number[] = []): number {
  const v = s.board.vertices.find(
    (x) =>
      !exclude.includes(x.id) &&
      x.hexes.length === 3 &&
      pred(x.hexes.map((h) => s.board.hexes[h].terrain)) &&
      !s.buildings[x.id] &&
      x.adj.every((a) => !s.buildings[a]),
  );
  if (!v) throw new Error('no such vertex');
  return v.id;
}
