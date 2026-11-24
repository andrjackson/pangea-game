import { describe, expect, it } from 'vitest';
import { activeDecisions } from '../src/engine';
import { bankRate, isOpenRoad, victoryPoints } from '../src/helpers';
import type { GameState, ProgressId } from '../src/types';
import { viewFor } from '../src/view';
import { act, rollWith, setHand, setupGame } from './util';

function ready(card: ProgressId, seed = 42): GameState {
  const s = setupGame(seed);
  s.rolled = true;
  s.players[0].progress = [card];
  return s;
}

function ownSettlement(s: GameState, p: number): number {
  return Number(Object.entries(s.buildings).find(([, b]) => b.owner === p && b.kind === 'settlement')![0]);
}

function ownCity(s: GameState, p: number): number {
  return Number(Object.entries(s.buildings).find(([, b]) => b.owner === p && b.kind === 'city')![0]);
}

function emptyNextToRoad(s: GameState, p: number): number {
  return s.board.vertices.find((v) => !s.buildings[v.id] && !s.knights[v.id] && v.edges.some((e) => s.roads[e] === p))!.id;
}

describe('science cards', () => {
  it('Augury sets the number dice and must come before the roll', () => {
    let s = setupGame(42);
    s.players[0].progress = ['augury'];
    s = act(s, 0, { type: 'playProgress', card: 'augury', params: { red: 6, yellow: 5 } });
    s = act(s, 0, { type: 'roll' });
    expect(s.dice).toMatchObject({ red: 6, yellow: 5 });
    s.players[0].progress = ['augury'];
    expect(() => act(s, 0, { type: 'playProgress', card: 'augury', params: { red: 1, yellow: 1 } })).toThrow(/before rolling/);
  });

  it('Scaffolding discounts the next improvement', () => {
    let s = ready('scaffolding');
    setHand(s, 0, { paper: 1 });
    s.players[0].improvements.science = 1;
    s = act(s, 0, { type: 'playProgress', card: 'scaffolding' });
    s = act(s, 0, { type: 'improve', track: 'science' });
    expect(s.players[0].improvements.science).toBe(2);
    expect(s.players[0].hand.paper).toBe(0);
    expect(s.flags.scaffolding).toBe(false);
  });

  it('Master Mason builds a free wall', () => {
    let s = ready('masterMason');
    setHand(s, 0, {});
    const c = ownCity(s, 0);
    s = act(s, 0, { type: 'playProgress', card: 'masterMason', params: { vertex: c } });
    expect(s.buildings[c].wall).toBe(true);
  });

  it('Surveyor swaps tokens but never 2, 6, 8 or 12', () => {
    let s = ready('surveyor');
    const a = s.board.hexes.find((h) => h.token === 3)!;
    const b = s.board.hexes.find((h) => h.token === 4)!;
    const six = s.board.hexes.find((h) => h.token === 6)!;
    expect(() => act(s, 0, { type: 'playProgress', card: 'surveyor', params: { hexA: a.id, hexB: six.id } })).toThrow(/cannot be moved/);
    s = act(s, 0, { type: 'playProgress', card: 'surveyor', params: { hexA: a.id, hexB: b.id } });
    expect(s.board.hexes[a.id].token).toBe(4);
    expect(s.board.hexes[b.id].token).toBe(3);
  });

  it('Canals and Deep Shafts pay 2 per touching tile', () => {
    let s = ready('canals');
    setHand(s, 0, {});
    const fields = new Set<number>();
    for (const [v, b] of Object.entries(s.buildings)) if (b.owner === 0) for (const h of s.board.vertices[Number(v)].hexes) if (s.board.hexes[h].terrain === 'fields') fields.add(h);
    s = act(s, 0, { type: 'playProgress', card: 'canals' });
    expect(s.players[0].hand.grain).toBe(2 * fields.size);
  });

  it('Physician builds a city for 2 ore and 1 grain', () => {
    let s = ready('physician');
    setHand(s, 0, { ore: 2, grain: 1 });
    const v = ownSettlement(s, 0);
    s = act(s, 0, { type: 'playProgress', card: 'physician', params: { vertex: v } });
    expect(s.buildings[v].kind).toBe('city');
    expect(s.players[0].hand.ore).toBe(0);
  });

  it('Road Corps gives 2 free roads', () => {
    let s = ready('roadCorps');
    setHand(s, 0, {});
    s = act(s, 0, { type: 'playProgress', card: 'roadCorps' });
    for (let i = 0; i < 2; i++) {
      const e = s.board.edges.find((x) => s.roads[x.id] === undefined && [x.a, x.b].some((v) => s.buildings[v]?.owner === 0))!.id;
      s = act(s, 0, { type: 'buildRoad', edge: e });
    }
    expect(s.flags.freeRoads).toBe(0);
    const e = s.board.edges.find((x) => s.roads[x.id] === undefined && [x.a, x.b].some((v) => s.buildings[v]?.owner === 0))!.id;
    expect(() => act(s, 0, { type: 'buildRoad', edge: e })).toThrow(/need/);
  });

  it('Armory promotes up to two knights for free', () => {
    let s = ready('armory');
    setHand(s, 0, {});
    const v = emptyNextToRoad(s, 0);
    s.knights[v] = { owner: 0, level: 1, active: false, activatedOnTurn: -1, actedOnTurn: -1, promotedOnTurn: -1 };
    s = act(s, 0, { type: 'playProgress', card: 'armory', params: { knights: [v] } });
    expect(s.knights[v].level).toBe(2);
  });
});

describe('trade cards', () => {
  it('Caravan is worth 1 VP and gives 2:1 on its tile', () => {
    let s = ready('caravan');
    const v = ownCity(s, 0);
    const hex = s.board.vertices[v].hexes.find((h) => s.board.hexes[h].terrain !== 'desert')!;
    const before = victoryPoints(s, 0);
    s = act(s, 0, { type: 'playProgress', card: 'caravan', params: { hex } });
    expect(victoryPoints(s, 0)).toBe(before + 1);
    const terrain = s.board.hexes[hex].terrain;
    const res = ({ hills: 'brick', forest: 'lumber', pasture: 'wool', fields: 'grain', mountains: 'ore' } as const)[terrain as 'hills'];
    expect(bankRate(s, 0, res, null)).toBe(2);
  });

  it('Harbor Levy trades a resource for a commodity with each opponent who has one', () => {
    let s = ready('harborLevy');
    setHand(s, 0, { brick: 2 });
    setHand(s, 1, { coin: 1 });
    setHand(s, 2, {});
    s = act(s, 0, { type: 'playProgress', card: 'harborLevy' });
    expect(activeDecisions(s)[0]).toMatchObject({ kind: 'harborLevyOffer', player: 0, target: 1 });
    s = act(s, 0, { type: 'harborLevyOffer', resource: 'brick' });
    expect(activeDecisions(s)[0]).toMatchObject({ kind: 'harborLevyReturn', player: 1 });
    s = act(s, 1, { type: 'harborLevyReturn', commodity: 'coin' });
    expect(s.players[0].hand).toMatchObject({ brick: 1, coin: 1 });
    expect(s.players[1].hand).toMatchObject({ brick: 1, coin: 0 });
    expect(s.queue).toHaveLength(0);
  });

  it('Monsoon Winds sets a 2:1 rate this turn', () => {
    let s = ready('monsoonWinds');
    setHand(s, 0, { wool: 2 });
    s = act(s, 0, { type: 'playProgress', card: 'monsoonWinds', params: { card: 'wool' } });
    s = act(s, 0, { type: 'bankTrade', give: 'wool', get: 'ore' });
    expect(s.players[0].hand).toMatchObject({ wool: 0, ore: 1 });
  });

  it('Tribute lets you see a richer hand and take 2', () => {
    let s = ready('tribute');
    s.players[1].shields = 3;
    setHand(s, 1, { ore: 2, paper: 1 });
    s = act(s, 0, { type: 'playProgress', card: 'tribute', params: { target: 1 } });
    const view = viewFor(s, 0);
    expect(view.reveal.hand).toMatchObject({ player: 1, hand: { ore: 2, paper: 1 } });
    expect(viewFor(s, 2).reveal.hand).toBeUndefined();
    s = act(s, 0, { type: 'tributeTake', cards: { ore: 1, paper: 1 } });
    expect(s.players[0].hand.paper).toBe(1);
    expect(s.players[1].hand).toMatchObject({ ore: 1, paper: 0 });
  });

  it('Tribute requires a target with more VP', () => {
    const s = ready('tribute');
    setHand(s, 1, { ore: 2 });
    expect(() => act(s, 0, { type: 'playProgress', card: 'tribute', params: { target: 1 } })).toThrow(/more victory points/);
  });

  it('Market Corner and Guild Charter collect from every opponent', () => {
    let s = ready('marketCorner');
    setHand(s, 0, {});
    setHand(s, 1, { wool: 3 });
    setHand(s, 2, { wool: 1, cloth: 2 });
    s = act(s, 0, { type: 'playProgress', card: 'marketCorner', params: { resource: 'wool' } });
    expect(s.players[0].hand.wool).toBe(3);
    s.players[0].progress = ['guildCharter'];
    s = act(s, 0, { type: 'playProgress', card: 'guildCharter', params: { commodity: 'cloth' } });
    expect(s.players[0].hand.cloth).toBe(1);
  });
});

describe('politics cards', () => {
  it('High Priest needs an awake robber and robs everyone on the tile', () => {
    let s = ready('highPriest');
    const v = ownCity(s, 1);
    const hex = s.board.vertices[v].hexes.find((h) => h !== s.robber)!;
    expect(() => act(s, 0, { type: 'playProgress', card: 'highPriest', params: { hex } })).toThrow(/sleeps/);
    s.robberActive = true;
    setHand(s, 1, { grain: 1 });
    s = act(s, 0, { type: 'playProgress', card: 'highPriest', params: { hex } });
    expect(s.robber).toBe(hex);
    expect(s.players[1].hand.grain).toBe(0);
  });

  it('Turncoat: the victim picks a knight to lose, you may place one like it', () => {
    let s = ready('turncoat');
    const theirs = emptyNextToRoad(s, 1);
    s.knights[theirs] = { owner: 1, level: 2, active: true, activatedOnTurn: -1, actedOnTurn: -1, promotedOnTurn: -1 };
    s = act(s, 0, { type: 'playProgress', card: 'turncoat', params: { target: 1 } });
    expect(activeDecisions(s)[0]).toMatchObject({ kind: 'turncoatRemove', player: 1 });
    s = act(s, 1, { type: 'turncoatRemove', vertex: theirs });
    expect(activeDecisions(s)[0]).toMatchObject({ kind: 'turncoatPlace', player: 0, level: 2 });
    const mine = emptyNextToRoad(s, 0);
    s = act(s, 0, { type: 'turncoatPlace', vertex: mine });
    expect(s.knights[mine]).toMatchObject({ owner: 0, level: 2, active: true });
  });

  it('Envoy removes an open road; your own can be rebuilt', () => {
    let s = ready('envoy');
    const road = Number(Object.entries(s.roads).find(([e, o]) => o === 1 && isOpenRoad(s, Number(e)))![0]);
    s = act(s, 0, { type: 'playProgress', card: 'envoy', params: { edge: road } });
    expect(s.roads[road]).toBeUndefined();
    expect(s.queue).toHaveLength(0);
    s.players[0].progress = ['envoy'];
    const mine = Number(Object.entries(s.roads).find(([e, o]) => o === 0 && isOpenRoad(s, Number(e)))![0]);
    s = act(s, 0, { type: 'playProgress', card: 'envoy', params: { edge: mine } });
    expect(activeDecisions(s)[0]).toMatchObject({ kind: 'envoyRebuild', player: 0 });
    s = act(s, 0, { type: 'envoyRebuild', edge: mine });
    expect(s.roads[mine]).toBe(0);
  });

  it('Plot displaces a knight your road reaches', () => {
    let s = ready('plot');
    const myRoadEnd = emptyNextToRoad(s, 0);
    s.knights[myRoadEnd] = { owner: 2, level: 3, active: true, activatedOnTurn: -1, actedOnTurn: -1, promotedOnTurn: -1 };
    s = act(s, 0, { type: 'playProgress', card: 'plot', params: { vertex: myRoadEnd } });
    expect(s.knights[myRoadEnd]).toBeUndefined();
  });

  it('Unrest halves the hands of players at or above your VP', () => {
    let s = ready('unrest');
    setHand(s, 1, { brick: 5 });
    setHand(s, 2, { ore: 1 });
    s = act(s, 0, { type: 'playProgress', card: 'unrest' });
    const waiting = activeDecisions(s);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ kind: 'discard', player: 1, count: 2 });
  });

  it('Informant reveals and takes a progress card', () => {
    let s = ready('informant');
    s.players[2].progress = ['canals', 'plot'];
    s = act(s, 0, { type: 'playProgress', card: 'informant', params: { target: 2 } });
    expect(viewFor(s, 0).reveal.progress).toEqual({ player: 2, cards: ['canals', 'plot'] });
    s = act(s, 0, { type: 'informantTake', card: 'plot' });
    expect(s.players[0].progress).toEqual(['plot']);
    expect(s.players[2].progress).toEqual(['canals']);
  });

  it('War Horn activates every knight', () => {
    let s = ready('warHorn');
    const v = emptyNextToRoad(s, 0);
    s.knights[v] = { owner: 0, level: 1, active: false, activatedOnTurn: -1, actedOnTurn: -1, promotedOnTurn: -1 };
    s = act(s, 0, { type: 'playProgress', card: 'warHorn' });
    expect(s.knights[v].active).toBe(true);
  });

  it('Dynastic Marriage: richer players each give 2 of their choice', () => {
    let s = ready('dynasticMarriage');
    s.players[2].shields = 2;
    setHand(s, 2, { ore: 1, coin: 3 });
    s = act(s, 0, { type: 'playProgress', card: 'dynasticMarriage' });
    expect(activeDecisions(s)).toEqual([expect.objectContaining({ kind: 'giveCards', player: 2, count: 2 })]);
    s = act(s, 2, { type: 'giveCards', cards: { coin: 2 } });
    expect(s.players[0].hand.coin).toBeGreaterThanOrEqual(2);
  });
});

describe('VP cards', () => {
  it('are revealed and scored when drawn', () => {
    const s = setupGame(42);
    s.players[1].improvements.politics = 5;
    s.decks.politics = ['lawCode', ...s.decks.politics.filter((c) => c !== 'lawCode')];
    const before = victoryPoints(s, 1);
    const after = rollWith(s, 1, 2, 'politics');
    expect(after.players[1].vpCards).toEqual(['lawCode']);
    expect(victoryPoints(after, 1)).toBe(before + 1);
  });
});
