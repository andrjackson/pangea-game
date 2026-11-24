import {
  canKnightAct,
  canPlaceSetupRoad,
  hasRoadAt,
  isOpenRoad,
  knightMoveTargets,
  legalKnightSpots,
  legalRoadSpots,
  legalSettlementSpots,
  legalSetupSpots,
  metropolisCandidates,
  ownedKnights,
  ownedVertices,
  playerHexes,
  setupSeat,
  type Action,
  type Decision,
  type PlayerView,
  type ProgressId,
  type Track,
} from '@pangea/engine';
import type { Targets } from './Board';

export type Mode =
  | { t: 'road' }
  | { t: 'settlement' }
  | { t: 'city' }
  | { t: 'wall' }
  | { t: 'knight' }
  | { t: 'activate' }
  | { t: 'promote' }
  | { t: 'move'; from?: number }
  | { t: 'chase' }
  | { t: 'metropolis'; track: Track }
  | { t: 'card'; card: ProgressId; picks: number[] };

export interface Interaction {
  targets: Targets;
  hint: string | null;
  selected?: Set<number>;
  /** Called with the picked id; returns an action to send, a new mode, or nothing. */
  pick?: (kind: 'vertex' | 'edge' | 'hex', id: number) => { send?: Action; mode?: Mode | null };
}

const NONE: Interaction = { targets: {}, hint: null };

export function myDecision(view: PlayerView): Decision | null {
  return view.waitingOn.find((d) => d.player === view.me) ?? null;
}

export function isMyTurn(view: PlayerView): boolean {
  return view.phase === 'play' && view.current === view.me && view.queue.length === 0;
}

export function computeInteraction(view: PlayerView, mode: Mode | null): Interaction {
  const me = view.me;

  if (view.phase === 'setup') {
    if (setupSeat(view) !== me) return NONE;
    if (view.setup.awaiting === 'building') {
      const second = view.setup.index >= view.players.length;
      return {
        targets: { vertices: new Set(legalSetupSpots(view)) },
        hint: second ? 'Place your starting city (it collects resources right away).' : 'Place your first settlement.',
        pick: (_k, id) => ({ send: { type: 'setupBuilding', vertex: id } }),
      };
    }
    const from = view.setup.lastVertex!;
    return {
      targets: { edges: new Set(view.board.edges.filter((e) => canPlaceSetupRoad(view, e.id, from)).map((e) => e.id)) },
      hint: 'Place a road next to it.',
      pick: (_k, id) => ({ send: { type: 'setupRoad', edge: id } }),
    };
  }

  const d = myDecision(view);
  if (d) {
    switch (d.kind) {
      case 'moveRobber':
        return {
          targets: { hexes: new Set(view.board.hexes.filter((h) => h.id !== view.robber).map((h) => h.id)) },
          hint: 'Move the robber to a new tile.',
          pick: (_k, id) => ({ send: { type: 'moveRobber', hex: id } }),
        };
      case 'loseCity':
        return {
          targets: { vertices: new Set(metropolisCandidates(view, me)) },
          hint: 'The barbarians sack one of your cities. Choose which.',
          pick: (_k, id) => ({ send: { type: 'loseCity', vertex: id } }),
        };
      case 'relocateKnight':
        return {
          targets: { vertices: new Set(d.options) },
          hint: 'Your knight was displaced. Move it to a free intersection on your roads.',
          pick: (_k, id) => ({ send: { type: 'relocateKnight', vertex: id } }),
        };
      case 'turncoatRemove':
        return {
          targets: { vertices: new Set(ownedKnights(view, me)) },
          hint: 'Choose one of your knights to desert.',
          pick: (_k, id) => ({ send: { type: 'turncoatRemove', vertex: id } }),
        };
      case 'turncoatPlace':
        return {
          targets: { vertices: new Set(legalKnightSpots(view, me)) },
          hint: 'Place the turncoat knight (or skip).',
          pick: (_k, id) => ({ send: { type: 'turncoatPlace', vertex: id } }),
        };
      case 'envoyRebuild':
        return {
          targets: { edges: new Set(legalRoadSpots(view, me)) },
          hint: 'Rebuild your road somewhere else (or skip).',
          pick: (_k, id) => ({ send: { type: 'envoyRebuild', edge: id } }),
        };
      default:
        return NONE;
    }
  }

  if (!mode || !isMyTurn(view)) return NONE;

  const myKnights = ownedKnights(view, me);
  switch (mode.t) {
    case 'road':
      return { targets: { edges: new Set(legalRoadSpots(view, me)) }, hint: view.flags.freeRoads ? `Place a free road (${view.flags.freeRoads} left).` : 'Place a road.', pick: (_k, id) => ({ send: { type: 'buildRoad', edge: id } }) };
    case 'settlement':
      return { targets: { vertices: new Set(legalSettlementSpots(view, me)) }, hint: 'Place a settlement.', pick: (_k, id) => ({ send: { type: 'buildSettlement', vertex: id } }) };
    case 'city':
      return { targets: { vertices: new Set(ownedVertices(view, me, 'settlement')) }, hint: 'Upgrade a settlement to a city.', pick: (_k, id) => ({ send: { type: 'buildCity', vertex: id } }) };
    case 'wall':
      return {
        targets: { vertices: new Set(ownedVertices(view, me, 'city').filter((v) => !view.buildings[v].wall)) },
        hint: 'Build a wall around a city.',
        pick: (_k, id) => ({ send: { type: 'buildWall', vertex: id } }),
      };
    case 'knight':
      return { targets: { vertices: new Set(legalKnightSpots(view, me)) }, hint: 'Raise a knight next to your road.', pick: (_k, id) => ({ send: { type: 'buildKnight', vertex: id } }) };
    case 'activate':
      return {
        targets: { vertices: new Set(myKnights.filter((v) => !view.knights[v].active)) },
        hint: 'Activate a knight (costs 1 grain).',
        pick: (_k, id) => ({ send: { type: 'activateKnight', vertex: id } }),
      };
    case 'promote':
      return {
        targets: { vertices: new Set(myKnights.filter((v) => view.knights[v].level < 3 && view.knights[v].promotedOnTurn !== view.turn)) },
        hint: 'Promote a knight one level.',
        pick: (_k, id) => ({ send: { type: 'promoteKnight', vertex: id } }),
      };
    case 'move':
      if (mode.from === undefined)
        return {
          targets: { vertices: new Set(myKnights.filter((v) => canKnightAct(view.knights[v], view.turn))) },
          hint: 'Choose a knight to move.',
          pick: (_k, id) => ({ mode: { t: 'move', from: id } }),
        };
      return {
        targets: { vertices: new Set(knightMoveTargets(view, mode.from)) },
        selected: new Set([mode.from]),
        hint: 'Move along your roads to a free spot, or onto a weaker enemy knight to displace it.',
        pick: (_k, id) => ({ send: { type: 'moveKnight', from: mode.from!, to: id } }),
      };
    case 'chase':
      return {
        targets: {
          vertices: new Set(myKnights.filter((v) => canKnightAct(view.knights[v], view.turn) && view.board.vertices[v].hexes.includes(view.robber))),
        },
        hint: 'Choose a knight next to the robber.',
        pick: (_k, id) => ({ send: { type: 'chaseRobber', vertex: id } }),
      };
    case 'metropolis':
      return {
        targets: { vertices: new Set(metropolisCandidates(view, me)) },
        hint: 'Choose the city that becomes the metropolis.',
        pick: (_k, id) => ({ send: { type: 'improve', track: mode.track, vertex: id } }),
      };
    case 'card':
      return cardInteraction(view, mode);
  }
}

function cardInteraction(view: PlayerView, mode: Extract<Mode, { t: 'card' }>): Interaction {
  const me = view.me;
  const play = (params: object): { send: Action } => ({ send: { type: 'playProgress', card: mode.card, params } });
  switch (mode.card) {
    case 'masterMason':
      return {
        targets: { vertices: new Set(ownedVertices(view, me, 'city').filter((v) => !view.buildings[v].wall)) },
        hint: 'Choose a city for the free wall.',
        pick: (_k, id) => play({ vertex: id }),
      };
    case 'physician':
      return { targets: { vertices: new Set(ownedVertices(view, me, 'settlement')) }, hint: 'Choose a settlement to upgrade.', pick: (_k, id) => play({ vertex: id }) };
    case 'surveyor': {
      const ok = view.board.hexes.filter((h) => h.token !== null && ![2, 6, 8, 12].includes(h.token)).map((h) => h.id);
      return {
        targets: { hexes: new Set(ok.filter((h) => !mode.picks.includes(h))) },
        hint: mode.picks.length ? 'Choose the second tile.' : 'Choose two number tokens to swap.',
        pick: (_k, id) => (mode.picks.length ? play({ hexA: mode.picks[0], hexB: id }) : { mode: { ...mode, picks: [id] } }),
      };
    }
    case 'armory':
      return {
        targets: { vertices: new Set(ownedKnights(view, me).filter((v) => view.knights[v].level < 3)) },
        selected: new Set(mode.picks),
        hint: 'Choose up to two knights, then confirm.',
        pick: (_k, id) => {
          const picks = mode.picks.includes(id) ? mode.picks.filter((x) => x !== id) : [...mode.picks, id].slice(-2);
          return { mode: { ...mode, picks } };
        },
      };
    case 'caravan':
      return {
        targets: { hexes: new Set(playerHexes(view, me).filter((h) => view.board.hexes[h].terrain !== 'desert')) },
        hint: 'Place the caravan next to one of your buildings.',
        pick: (_k, id) => play({ hex: id }),
      };
    case 'highPriest':
      return {
        targets: { hexes: new Set(view.board.hexes.filter((h) => h.id !== view.robber).map((h) => h.id)) },
        hint: 'Move the robber; you rob everyone there.',
        pick: (_k, id) => play({ hex: id }),
      };
    case 'envoy':
      return {
        targets: { edges: new Set(Object.keys(view.roads).map(Number).filter((e) => isOpenRoad(view, e))) },
        hint: 'Choose an open-ended road to remove.',
        pick: (_k, id) => play({ edge: id }),
      };
    case 'plot':
      return {
        targets: {
          vertices: new Set(
            Object.entries(view.knights)
              .filter(([v, k]) => k.owner !== me && hasRoadAt(view, me, Number(v)))
              .map(([v]) => Number(v)),
          ),
        },
        hint: 'Choose an enemy knight your road reaches.',
        pick: (_k, id) => play({ vertex: id }),
      };
    default:
      return NONE;
  }
}

/** Cards whose parameters are chosen on the board. */
export const BOARD_CARDS = new Set<ProgressId>(['masterMason', 'physician', 'surveyor', 'armory', 'caravan', 'highPriest', 'envoy', 'plot']);
