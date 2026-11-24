import { describe, expect, it } from 'vitest';
import { CARD_TYPES, COMMODITIES, LIMITS, PROGRESS, RESOURCES, TRACKS } from '../src/data';
import { RuleError, activeDecisions, applyAction } from '../src/engine';
import {
  handSize,
  knightMoveTargets,
  legalKnightSpots,
  legalRoadSpots,
  legalSettlementSpots,
  ownedKnights,
  ownedVertices,
  pieceCounts,
} from '../src/helpers';
import { random, randInt } from '../src/rng';
import type { Action, GameState, Hand } from '../src/types';
import { viewFor } from '../src/view';
import { setupGame } from './util';

const pick = <T,>(r: { rng: number }, xs: T[]): T | undefined => (xs.length ? xs[randInt(r, xs.length)] : undefined);

function randomCards(r: { rng: number }, hand: Hand, count: number): Partial<Hand> {
  const pool: string[] = [];
  for (const t of CARD_TYPES) for (let i = 0; i < hand[t]; i++) pool.push(t);
  const out: Partial<Hand> = {};
  for (let i = 0; i < count && pool.length; i++) {
    const [t] = pool.splice(randInt(r, pool.length), 1);
    out[t as keyof Hand] = (out[t as keyof Hand] ?? 0) + 1;
  }
  return out;
}

/** Proposes a plausible action for some player. Many will be illegal; that's fine. */
function propose(s: GameState, r: { rng: number }): [number, Action] {
  const decisions = activeDecisions(s);
  if (decisions.length) {
    const d = decisions[randInt(r, decisions.length)];
    const p = d.player;
    const hand = s.players[p].hand;
    switch (d.kind) {
      case 'discard':
        return [p, { type: 'discard', cards: randomCards(r, hand, d.count) }];
      case 'moveRobber':
        return [p, { type: 'moveRobber', hex: randInt(r, 19) }];
      case 'steal':
        return [p, { type: 'steal', victim: pick(r, d.candidates)! }];
      case 'pickResource':
        return [p, { type: 'pickResource', resource: pick(r, RESOURCES)! }];
      case 'loseCity':
        return [p, { type: 'loseCity', vertex: pick(r, ownedVertices(s, p, 'city'))! }];
      case 'pickTrack':
        return [p, { type: 'pickTrack', track: pick(r, TRACKS)! }];
      case 'discardProgress':
        return [p, { type: 'discardProgress', card: pick(r, s.players[p].progress)! }];
      case 'relocateKnight':
        return [p, { type: 'relocateKnight', vertex: pick(r, d.options)! }];
      case 'giveCards':
        return [p, { type: 'giveCards', cards: randomCards(r, hand, d.count) }];
      case 'harborLevyOffer':
        return [p, { type: 'harborLevyOffer', resource: pick(r, RESOURCES.filter((x) => hand[x] > 0)) ?? null }];
      case 'harborLevyReturn':
        return [p, { type: 'harborLevyReturn', commodity: pick(r, COMMODITIES.filter((x) => hand[x] > 0))! }];
      case 'tributeTake':
        return [p, { type: 'tributeTake', cards: randomCards(r, s.players[d.target].hand, d.count) }];
      case 'informantTake':
        return [p, { type: 'informantTake', card: pick(r, s.players[d.target].progress)! }];
      case 'turncoatRemove':
        return [p, { type: 'turncoatRemove', vertex: pick(r, ownedKnights(s, p))! }];
      case 'turncoatPlace':
        return [p, { type: 'turncoatPlace', vertex: pick(r, legalKnightSpots(s, p)) ?? null }];
      case 'envoyRebuild':
        return [p, { type: 'envoyRebuild', edge: pick(r, legalRoadSpots(s, p)) ?? null }];
    }
  }
  const p = s.current;
  if (!s.rolled) {
    if (s.players[p].progress.includes('augury') && random(r) < 0.3)
      return [p, { type: 'playProgress', card: 'augury', params: { red: randInt(r, 6) + 1, yellow: randInt(r, 6) + 1 } }];
    return [p, { type: 'roll' }];
  }
  const roll = random(r);
  const hand = s.players[p].hand;
  const knights = ownedKnights(s, p);
  if (roll < 0.04) return [p, { type: 'endTurn' }];
  if (roll < 0.1) {
    const card = pick(r, s.players[p].progress);
    if (card) {
      const params = {
        red: randInt(r, 6) + 1,
        yellow: randInt(r, 6) + 1,
        vertex: pick(r, [...ownedVertices(s, p), ...Object.keys(s.knights).map(Number)]),
        hexA: randInt(r, 19),
        hexB: randInt(r, 19),
        hex: randInt(r, 19),
        knights: knights.slice(0, 2),
        card: pick(r, CARD_TYPES),
        resource: pick(r, RESOURCES),
        commodity: pick(r, COMMODITIES),
        target: randInt(r, s.players.length),
        edge: pick(r, Object.keys(s.roads).map(Number)),
      };
      return [p, { type: 'playProgress', card, params }];
    }
  }
  if (roll < 0.13 && s.players[p].progress.length > 4) return [p, { type: 'discardProgress', card: s.players[p].progress[0] }];
  if (roll < 0.25) return [p, { type: 'buildRoad', edge: pick(r, legalRoadSpots(s, p)) ?? 0 }];
  if (roll < 0.33) return [p, { type: 'buildSettlement', vertex: pick(r, legalSettlementSpots(s, p)) ?? 0 }];
  if (roll < 0.4) return [p, { type: 'buildCity', vertex: pick(r, ownedVertices(s, p, 'settlement')) ?? 0 }];
  if (roll < 0.44) return [p, { type: 'buildWall', vertex: pick(r, ownedVertices(s, p, 'city')) ?? 0 }];
  if (roll < 0.5) return [p, { type: 'buildKnight', vertex: pick(r, legalKnightSpots(s, p)) ?? 0 }];
  if (roll < 0.55) return [p, { type: 'activateKnight', vertex: pick(r, knights) ?? 0 }];
  if (roll < 0.58) return [p, { type: 'promoteKnight', vertex: pick(r, knights) ?? 0 }];
  if (roll < 0.63) {
    const from = pick(r, knights);
    if (from !== undefined) return [p, { type: 'moveKnight', from, to: pick(r, knightMoveTargets(s, from)) ?? 0 }];
  }
  if (roll < 0.65 && knights.length) return [p, { type: 'chaseRobber', vertex: pick(r, knights)! }];
  if (roll < 0.75) return [p, { type: 'improve', track: pick(r, TRACKS)!, vertex: pick(r, ownedVertices(s, p, 'city')) }];
  if (roll < 0.85) {
    const give = pick(r, CARD_TYPES.filter((t) => hand[t] >= 2)) ?? 'brick';
    return [p, { type: 'bankTrade', give, get: pick(r, CARD_TYPES)! }];
  }
  if (roll < 0.9) {
    const give = pick(r, CARD_TYPES.filter((t) => hand[t] > 0));
    if (give) return [p, { type: 'offerTrade', give: { [give]: 1 }, get: { [pick(r, CARD_TYPES.filter((t) => t !== give))!]: 1 } }];
  }
  if (roll < 0.95 && s.trades.length) {
    const o = s.trades[0];
    if (o.from === p && o.accepted.length) return [p, { type: 'confirmTrade', offer: o.id, with: o.accepted[0] }];
    const other = (p + 1 + randInt(r, s.players.length - 1)) % s.players.length;
    return [other, { type: 'respondTrade', offer: o.id, accept: random(r) < 0.5 }];
  }
  if (roll < 0.97 && s.undo.length) return [p, { type: 'undo' }];
  return [p, { type: 'endTurn' }];
}

function checkInvariants(s: GameState): void {
  for (const pl of s.players) {
    for (const t of CARD_TYPES) expect(pl.hand[t], `${pl.name} ${t}`).toBeGreaterThanOrEqual(0);
    const c = pieceCounts(s, pl.id);
    expect(c.roads).toBeLessThanOrEqual(LIMITS.roads);
    expect(c.cities).toBeLessThanOrEqual(LIMITS.cities);
    expect(c.walls).toBeLessThanOrEqual(LIMITS.walls);
    for (const lvl of [1, 2, 3] as const) expect(c.knights[lvl]).toBeLessThanOrEqual(LIMITS.knightsPerLevel);
    for (const card of pl.progress) expect(PROGRESS[card].vp).toBeFalsy();
  }
  // progress card conservation: 54 cards across decks, hands and revealed VP cards
  const total =
    TRACKS.reduce((n, t) => n + s.decks[t].length, 0) +
    s.players.reduce((n, pl) => n + pl.progress.length + pl.vpCards.length, 0);
  expect(total).toBe(54);
  // knights never share a vertex with buildings
  for (const v of Object.keys(s.knights)) expect(s.buildings[Number(v)]).toBeUndefined();
  // walls only on cities
  for (const b of Object.values(s.buildings)) if (b.wall) expect(b.kind).toBe('city');
  // metropolis bookkeeping matches the board
  for (const t of TRACKS) {
    const holders = Object.values(s.buildings).filter((b) => b.metropolis === t);
    expect(holders.length).toBeLessThanOrEqual(1);
    if (holders.length) expect(s.metropolis[t]).toBe(holders[0].owner);
  }
  // views never leak opponents' hands
  const view = viewFor(s, 0);
  for (const pl of view.players) if (pl.id !== 0) expect(pl.hand).toBeNull();
  expect(handSize(s.players[0].hand)).toBe(view.players[0].handCount);
}

describe('random play', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`survives a long random game (seed ${seed})`, () => {
      let s = setupGame(seed, seed % 2 ? 3 : 4);
      const r = { rng: seed * 7919 };
      let applied = 0;
      for (let i = 0; i < 6000 && s.phase !== 'ended'; i++) {
        const [p, a] = propose(s, r);
        try {
          s = applyAction(s, p, a);
          applied++;
        } catch (err) {
          if (!(err instanceof RuleError)) throw err;
        }
        if (i % 50 === 0) checkInvariants(s);
      }
      checkInvariants(s);
      expect(applied).toBeGreaterThan(300);
    });
  }
});
