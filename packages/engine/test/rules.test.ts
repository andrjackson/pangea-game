import { describe, expect, it } from 'vitest';
import { activeDecisions } from '../src/engine';
import { bankRate, handSize, longestRoadLength, victoryPoints } from '../src/helpers';
import type { GameState, Knight } from '../src/types';
import { viewFor } from '../src/view';
import { act, clearPieces, rollWith, setHand, setupGame } from './util';

function edgeBetween(s: GameState, a: number, b: number): number {
  return s.board.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))!.id;
}

/** A simple path of n+1 vertices along the board graph starting at `start`, avoiding revisits. */
function path(s: GameState, start: number, n: number): number[] {
  const out = [start];
  while (out.length <= n) {
    const last = out[out.length - 1];
    const next = s.board.vertices[last].adj.find((a) => !out.includes(a) && !out.some((o) => s.board.vertices[o].adj.includes(a) && o !== last));
    out.push(next ?? s.board.vertices[last].adj.find((a) => !out.includes(a))!);
  }
  return out;
}

function knight(owner: number, level: 1 | 2 | 3, active = true): Knight {
  return { owner, level, active, activatedOnTurn: -1, actedOnTurn: -1, promotedOnTurn: -1 };
}

function city(owner: number, metropolis: null | 'science' | 'trade' | 'politics' = null) {
  return { owner, kind: 'city' as const, wall: false, metropolis };
}

/** Vertices far apart from each other (pairwise non-adjacent) for placing test buildings. */
function spread(s: GameState, n: number): number[] {
  const out: number[] = [];
  for (const v of s.board.vertices) {
    if (out.every((o) => o !== v.id && !s.board.vertices[o].adj.includes(v.id) && !s.board.vertices[o].adj.some((x) => s.board.vertices[x].adj.includes(v.id)))) out.push(v.id);
    if (out.length === n) break;
  }
  return out;
}

function ready(seed = 42): GameState {
  const s = setupGame(seed);
  s.rolled = true;
  return s;
}

function diceFor(sum: number): [number, number] {
  const red = Math.min(6, sum - 1);
  return [red, sum - red];
}

describe('production', () => {
  it('pays resources and commodities, and the robber blocks', () => {
    let s = setupGame(42);
    clearPieces(s);
    const forest = s.board.hexes.find((h) => h.terrain === 'forest' && h.token !== null)!;
    const v = s.board.vertices.find((x) => x.hexes.includes(forest.id))!;
    s.buildings[v.id] = city(0);
    s.robber = s.board.hexes.find((h) => h.terrain === 'desert')!.id;
    setHand(s, 0, {});
    const [red, yellow] = diceFor(forest.token!);
    const after = rollWith(s, red, yellow, 'politics');
    // expected from every touching tile showing that number
    let lumber = 0;
    let paper = 0;
    for (const h of v.hexes) {
      const hex = s.board.hexes[h];
      if (hex.token !== forest.token) continue;
      if (hex.terrain === 'forest') {
        lumber++;
        paper++;
      }
    }
    expect(after.players[0].hand.lumber).toBeGreaterThanOrEqual(lumber);
    expect(after.players[0].hand.paper).toBe(paper);

    s.robber = forest.id;
    const blocked = rollWith(s, red, yellow, 'politics');
    expect(blocked.players[0].hand.paper).toBe(paper - 1);
  });

  it('cities on hills give 2 brick', () => {
    const s = setupGame(42);
    clearPieces(s);
    const hills = s.board.hexes.find((h) => h.terrain === 'hills')!;
    const v = s.board.vertices.find((x) => x.hexes.includes(hills.id) && x.hexes.every((h) => s.board.hexes[h].token !== hills.token || h === hills.id))!;
    s.buildings[v.id] = city(1);
    setHand(s, 1, {});
    const [r, y] = diceFor(hills.token!);
    const after = rollWith(s, r, y, 'politics');
    expect(after.players[1].hand.brick).toBe(2);
  });
});

describe('rolling a seven', () => {
  it('makes players over their limit discard half; walls raise the limit; sleeping robber stays', () => {
    let s = setupGame(42);
    setHand(s, 1, { brick: 9 });
    setHand(s, 2, { ore: 9 });
    const p2city = Object.entries(s.buildings).find(([, b]) => b.owner === 2 && b.kind === 'city')!;
    s.buildings[Number(p2city[0])].wall = true;
    s = rollWith(s, 3, 4, 'politics');
    const waiting = activeDecisions(s);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ kind: 'discard', player: 1, count: 4 });
    expect(() => act(s, 0, { type: 'endTurn' })).toThrow(/waiting/);
    expect(() => act(s, 1, { type: 'discard', cards: { brick: 3 } })).toThrow(/exactly 4/);
    s = act(s, 1, { type: 'discard', cards: { brick: 4 } });
    expect(s.players[1].hand.brick).toBe(5);
    expect(s.queue).toHaveLength(0);
    expect(s.robber).toBe(s.board.hexes.find((h) => h.terrain === 'desert')!.id);
  });

  it('once awake, the roller moves the robber and steals', () => {
    let s = setupGame(42);
    s.robberActive = true;
    setHand(s, 1, { wool: 1 });
    const target = Number(Object.entries(s.buildings).find(([, b]) => b.owner === 1)![0]);
    const hex = s.board.vertices[target].hexes.find((h) => h !== s.robber && !s.board.vertices.some((v) => v.hexes.includes(h) && s.buildings[v.id] && s.buildings[v.id].owner === 2))!;
    s = rollWith(s, 3, 4, 'politics');
    expect(activeDecisions(s)[0]).toMatchObject({ kind: 'moveRobber', player: 0 });
    expect(() => act(s, 0, { type: 'moveRobber', hex: s.robber })).toThrow(/different/);
    const woolBefore = s.players[0].hand.wool;
    s = act(s, 0, { type: 'moveRobber', hex });
    expect(s.robber).toBe(hex);
    expect(s.players[1].hand.wool).toBe(0);
    expect(s.players[0].hand.wool).toBe(woolBefore + 1);
  });
});

describe('barbarians', () => {
  function scene(): { s: GameState; cities: number[] } {
    const s = setupGame(42);
    clearPieces(s);
    const cities = spread(s, 6);
    s.buildings[cities[0]] = city(0);
    s.buildings[cities[1]] = city(1);
    s.buildings[cities[2]] = city(2);
    s.barbarian.position = 6;
    return { s, cities };
  }

  it('a single top defender earns a shield; knights go home; robber wakes', () => {
    const { s, cities } = scene();
    s.knights[cities[3]] = knight(0, 2);
    s.knights[cities[4]] = knight(1, 1);
    const after = rollWith(s, 2, 3, 'ship');
    expect(after.players[0].shields).toBe(1);
    expect(Object.values(after.knights).every((k) => !k.active)).toBe(true);
    expect(after.barbarian).toEqual({ position: 0, attacks: 1 });
    expect(after.robberActive).toBe(true);
  });

  it('tied top defenders each pick a progress deck', () => {
    const { s, cities } = scene();
    s.knights[cities[3]] = knight(0, 2);
    s.knights[cities[4]] = knight(1, 2);
    let after = rollWith(s, 2, 3, 'ship');
    const waiting = activeDecisions(after);
    expect(waiting.map((d) => [d.kind, d.player])).toEqual([
      ['pickTrack', 0],
      ['pickTrack', 1],
    ]);
    after = act(after, 1, { type: 'pickTrack', track: 'trade' });
    after = act(after, 0, { type: 'pickTrack', track: 'politics' });
    expect(after.players[0].progress.length + after.players[0].vpCards.length).toBe(1);
    expect(after.players[1].progress.length + after.players[1].vpCards.length).toBe(1);
  });

  it('when defense fails, the weakest defenders lose a city', () => {
    const { s, cities } = scene();
    s.knights[cities[3]] = knight(0, 1);
    const after = rollWith(s, 2, 3, 'ship');
    expect(after.buildings[cities[0]].kind).toBe('city');
    expect(after.buildings[cities[1]].kind).toBe('settlement');
    expect(after.buildings[cities[2]].kind).toBe('settlement');
  });

  it('metropolis-only players are skipped and players with a choice decide', () => {
    const { s, cities } = scene();
    s.buildings[cities[1]] = city(1, 'science');
    s.metropolis.science = 1;
    s.buildings[cities[5]] = city(2);
    s.knights[cities[3]] = knight(0, 1);
    let after = rollWith(s, 2, 3, 'ship');
    expect(after.buildings[cities[1]].kind).toBe('city');
    expect(activeDecisions(after)[0]).toMatchObject({ kind: 'loseCity', player: 2 });
    after = act(after, 2, { type: 'loseCity', vertex: cities[5] });
    expect(after.buildings[cities[5]].kind).toBe('settlement');
    expect(after.buildings[cities[2]].kind).toBe('city');
  });
});

describe('progress card draws', () => {
  it('draw when the red die is within level + 1', () => {
    const s = setupGame(42);
    s.players[1].improvements.science = 2;
    const count = (g: GameState) => g.players[1].progress.length + g.players[1].vpCards.length;
    expect(count(rollWith(s, 3, 2, 'science'))).toBe(1);
    expect(count(rollWith(s, 4, 2, 'science'))).toBe(0);
    expect(count(rollWith(s, 1, 2, 'trade'))).toBe(0);
  });

  it('an opponent over 4 progress cards must discard one', () => {
    let s = ready();
    s.players[1].progress = ['augury', 'canals', 'tribute', 'envoy', 'plot'];
    setHand(s, 0, { brick: 4 });
    s = act(s, 0, { type: 'bankTrade', give: 'brick', get: 'ore' });
    expect(activeDecisions(s)[0]).toMatchObject({ kind: 'discardProgress', player: 1 });
    s = act(s, 1, { type: 'discardProgress', card: 'plot' });
    expect(s.players[1].progress).toHaveLength(4);
    expect(s.decks.politics[s.decks.politics.length - 1]).toBe('plot');
  });

  it('the current player cannot end their turn holding 5', () => {
    let s = ready();
    s.players[0].progress = ['augury', 'canals', 'tribute', 'envoy', 'plot'];
    expect(() => act(s, 0, { type: 'endTurn' })).toThrow(/more than 4/);
    s = act(s, 0, { type: 'discardProgress', card: 'envoy' });
    s = act(s, 0, { type: 'endTurn' });
    expect(s.current).toBe(1);
  });
});

describe('knights', () => {
  it('build, activate, wait a turn, then move along roads', () => {
    let s = ready();
    clearPieces(s);
    const p = path(s, spread(s, 1)[0], 3);
    s.buildings[p[0]] = { owner: 0, kind: 'settlement', wall: false, metropolis: null };
    s.roads[edgeBetween(s, p[0], p[1])] = 0;
    s.roads[edgeBetween(s, p[1], p[2])] = 0;
    s.roads[edgeBetween(s, p[2], p[3])] = 0;
    setHand(s, 0, { wool: 1, ore: 1, grain: 1 });
    expect(() => act(s, 0, { type: 'buildKnight', vertex: p[0] })).toThrow(/empty intersection/);
    s = act(s, 0, { type: 'buildKnight', vertex: p[1] });
    s = act(s, 0, { type: 'activateKnight', vertex: p[1] });
    expect(() => act(s, 0, { type: 'moveKnight', from: p[1], to: p[3] })).toThrow(/cannot act/);
    s.knights[p[1]].activatedOnTurn = s.turn - 1;
    s = act(s, 0, { type: 'moveKnight', from: p[1], to: p[3] });
    expect(s.knights[p[3]]).toMatchObject({ owner: 0, active: false });
    expect(s.knights[p[1]]).toBeUndefined();
  });

  it('displaces weaker knights, who relocate along their own roads', () => {
    let s = ready();
    clearPieces(s);
    const p = path(s, spread(s, 1)[0], 3);
    s.buildings[p[0]] = { owner: 0, kind: 'settlement', wall: false, metropolis: null };
    s.roads[edgeBetween(s, p[0], p[1])] = 0;
    s.roads[edgeBetween(s, p[1], p[2])] = 0;
    const u = s.board.vertices[p[2]].adj.find((x) => x !== p[1])!;
    s.roads[edgeBetween(s, p[2], u)] = 1;
    s.knights[p[1]] = knight(0, 2);
    s.knights[p[2]] = knight(1, 1);
    expect(() => {
      const t = structuredClone(s);
      t.knights[p[2]] = knight(1, 2);
      act(t, 0, { type: 'moveKnight', from: p[1], to: p[2] });
    }).toThrow(/cannot reach/);
    s = act(s, 0, { type: 'moveKnight', from: p[1], to: p[2] });
    expect(s.knights[p[2]].owner).toBe(0);
    expect(activeDecisions(s)[0]).toMatchObject({ kind: 'relocateKnight', player: 1, options: [u] });
    s = act(s, 1, { type: 'relocateKnight', vertex: u });
    expect(s.knights[u]).toMatchObject({ owner: 1, level: 1, active: true });
  });

  it('promotion needs a Citadel for level 3 and happens once per turn', () => {
    let s = ready();
    const v = Object.keys(s.buildings).map(Number).find((x) => s.buildings[x].owner === 0)!;
    const spot = s.board.vertices[v].adj.find((a) => s.board.vertices[a].edges.some((e) => s.roads[e] === 0) && !s.buildings[a])!;
    s.knights[spot] = knight(0, 2, false);
    setHand(s, 0, { wool: 2, ore: 2 });
    expect(() => act(s, 0, { type: 'promoteKnight', vertex: spot })).toThrow(/Citadel/);
    s.players[0].improvements.politics = 3;
    s = act(s, 0, { type: 'promoteKnight', vertex: spot });
    expect(s.knights[spot].level).toBe(3);
    expect(() => act(s, 0, { type: 'promoteKnight', vertex: spot })).toThrow();
  });

  it('opponent knights break the longest road', () => {
    let s = ready();
    clearPieces(s);
    const p = path(s, spread(s, 1)[0], 6);
    s.buildings[p[0]] = { owner: 0, kind: 'settlement', wall: false, metropolis: null };
    for (let i = 0; i < 5; i++) s.roads[edgeBetween(s, p[i], p[i + 1])] = 0;
    setHand(s, 0, { brick: 1, lumber: 1 });
    s = act(s, 0, { type: 'buildRoad', edge: edgeBetween(s, p[5], p[6]) });
    expect(longestRoadLength(s, 0)).toBe(6);
    expect(s.longestRoad).toBe(0);
    s.knights[p[3]] = knight(1, 1);
    expect(longestRoadLength(s, 0)).toBe(3);
  });

  it('can chase the robber only after the first raid', () => {
    let s = ready();
    const robberHex = s.board.hexes.find((h) => h.terrain !== 'desert')!.id;
    s.robber = robberHex;
    const v = s.board.vertices.find((x) => x.hexes.includes(robberHex) && !s.buildings[x.id] && !s.knights[x.id])!.id;
    s.knights[v] = knight(0, 1);
    expect(() => act(s, 0, { type: 'chaseRobber', vertex: v })).toThrow(/sleeps/);
    s.robberActive = true;
    s = act(s, 0, { type: 'chaseRobber', vertex: v });
    expect(activeDecisions(s)[0]).toMatchObject({ kind: 'moveRobber', player: 0 });
    expect(s.knights[v].active).toBe(false);
  });
});

describe('city improvements', () => {
  it('cost rises per level and level 3 unlocks abilities', () => {
    let s = ready();
    setHand(s, 0, { cloth: 6 });
    s = act(s, 0, { type: 'improve', track: 'trade' });
    s = act(s, 0, { type: 'improve', track: 'trade' });
    s = act(s, 0, { type: 'improve', track: 'trade' });
    expect(s.players[0].improvements.trade).toBe(3);
    expect(s.players[0].hand.cloth).toBe(0);
    expect(bankRate(s, 0, 'coin', null)).toBe(2);
    expect(bankRate(s, 0, 'brick', null)).toBeGreaterThanOrEqual(2);
  });

  it('first to level 4 raises the metropolis; first to 5 takes it from a level-4 holder', () => {
    let s = ready();
    s.players[0].improvements.politics = 3;
    setHand(s, 0, { coin: 4 });
    s = act(s, 0, { type: 'improve', track: 'politics' });
    expect(s.metropolis.politics).toBe(0);
    expect(victoryPoints(s, 0)).toBeGreaterThanOrEqual(5);
    // player 1 jumps ahead to 5
    s = act(s, 0, { type: 'endTurn' });
    s.rolled = true;
    s.players[1].improvements.politics = 4;
    setHand(s, 1, { coin: 5 });
    s = act(s, 1, { type: 'improve', track: 'politics' });
    expect(s.metropolis.politics).toBe(1);
    expect(Object.values(s.buildings).filter((b) => b.metropolis === 'politics').map((b) => b.owner)).toEqual([1]);
  });

  it('needs a city', () => {
    const s = ready();
    for (const b of Object.values(s.buildings)) if (b.owner === 0) b.kind = 'settlement';
    setHand(s, 0, { paper: 1 });
    expect(() => act(s, 0, { type: 'improve', track: 'science' })).toThrow(/need a city/);
  });
});

describe('trading', () => {
  it('bank trades at 4:1 by default', () => {
    let s = ready();
    for (const v of s.board.vertices) v.harbor = null;
    setHand(s, 0, { grain: 4 });
    s = act(s, 0, { type: 'bankTrade', give: 'grain', get: 'paper' });
    expect(s.players[0].hand).toMatchObject({ grain: 0, paper: 1 });
  });

  it('offers, accepts and confirms between players; counter-offers go straight to the current player', () => {
    let s = ready();
    setHand(s, 0, { brick: 2 });
    setHand(s, 1, { ore: 1 });
    setHand(s, 2, { wool: 1 });
    s = act(s, 0, { type: 'offerTrade', give: { brick: 1 }, get: { ore: 1 } });
    const id = s.trades[0].id;
    expect(() => act(s, 2, { type: 'respondTrade', offer: id, accept: true })).toThrow(/do not have/);
    s = act(s, 1, { type: 'respondTrade', offer: id, accept: true });
    s = act(s, 0, { type: 'confirmTrade', offer: id, with: 1 });
    expect(s.players[0].hand).toMatchObject({ brick: 1, ore: 1 });
    expect(s.players[1].hand).toMatchObject({ brick: 1, ore: 0 });

    s = act(s, 2, { type: 'offerTrade', give: { wool: 1 }, get: { brick: 1 } });
    s = act(s, 0, { type: 'respondTrade', offer: s.trades[0].id, accept: true });
    expect(s.players[0].hand).toMatchObject({ brick: 0, wool: 1 });
  });

  it('rejects gifts and same-type swaps', () => {
    const s = ready();
    setHand(s, 0, { brick: 2 });
    expect(() => act(s, 0, { type: 'offerTrade', give: { brick: 1 }, get: {} })).toThrow();
    expect(() => act(s, 0, { type: 'offerTrade', give: { brick: 1 }, get: { brick: 1 } })).toThrow();
  });
});

describe('undo, scoring, turn order', () => {
  it('undoes a build but never a roll', () => {
    let s = setupGame(42);
    expect(() => act(s, 0, { type: 'undo' })).toThrow(/Nothing/);
    s = rollWith(s, 2, 3, 'politics');
    expect(s.undo).toHaveLength(0);
    setHand(s, 0, { brick: 1, lumber: 1 });
    const edge = s.board.edges.find((e) => s.roads[e.id] === undefined && [e.a, e.b].some((v) => s.buildings[v]?.owner === 0))!.id;
    s = act(s, 0, { type: 'buildRoad', edge });
    expect(viewFor(s, 0).canUndo).toBe(true);
    expect(viewFor(s, 1).canUndo).toBe(false);
    s = act(s, 0, { type: 'undo' });
    expect(s.roads[edge]).toBeUndefined();
    expect(s.players[0].hand.brick).toBe(1);
  });

  it('reaching 13 VP on your turn wins', () => {
    let s = ready();
    s.players[0].shields = 9;
    expect(victoryPoints(s, 0)).toBe(12);
    s.players[0].improvements.science = 0;
    setHand(s, 0, { grain: 2, ore: 3 });
    const settlement = Number(Object.entries(s.buildings).find(([, b]) => b.owner === 0 && b.kind === 'settlement')![0]);
    s = act(s, 0, { type: 'buildCity', vertex: settlement });
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe(0);
    expect(() => act(s, 1, { type: 'roll' })).toThrow(/over/);
  });

  it('only the current player acts, and only after rolling', () => {
    const s = setupGame(42);
    expect(() => act(s, 1, { type: 'roll' })).toThrow(/not your turn/);
    expect(() => act(s, 0, { type: 'endTurn' })).toThrow(/Roll/);
    expect(handSize(s.players[0].hand)).toBeGreaterThanOrEqual(0);
  });
});
