import { CARD_TYPES, COMMODITIES, LIMITS, TERRAIN_RESOURCE } from './data';
import type { Board, Building, CardType, Hand, Knight, Player, Track } from './types';

/** The public parts of a game that both the server state and player views carry. */
export interface GameLike {
  board: Board;
  buildings: Record<number, Building>;
  roads: Record<number, number>;
  knights: Record<number, Knight>;
  players: Pick<Player, 'id' | 'shields' | 'vpCards' | 'improvements'>[];
  longestRoad: number | null;
  caravan: { hex: number; owner: number } | null;
  robber: number;
  metropolis: Record<Track, number | null>;
}

// ---------- hands ----------

export function handSize(hand: Partial<Hand>): number {
  let n = 0;
  for (const t of CARD_TYPES) n += hand[t] ?? 0;
  return n;
}

export function hasCards(hand: Hand, cost: Partial<Hand>): boolean {
  return CARD_TYPES.every((t) => hand[t] >= (cost[t] ?? 0));
}

export function pay(hand: Hand, cost: Partial<Hand>): void {
  for (const t of CARD_TYPES) hand[t] -= cost[t] ?? 0;
}

export function gain(hand: Hand, cards: Partial<Hand>): void {
  for (const t of CARD_TYPES) hand[t] += cards[t] ?? 0;
}

export function isValidCardSet(cards: Partial<Hand> | undefined | null): cards is Partial<Hand> {
  if (!cards || typeof cards !== 'object') return false;
  for (const [k, v] of Object.entries(cards)) {
    if (!CARD_TYPES.includes(k as CardType)) return false;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return false;
  }
  return true;
}

export function isCommodity(t: CardType): boolean {
  return (COMMODITIES as string[]).includes(t);
}

// ---------- occupancy ----------

export function isVertexEmpty(g: GameLike, v: number): boolean {
  return !g.buildings[v] && !g.knights[v];
}

/** True if an opponent of `player` blocks passage through vertex v (building or knight). */
export function blockedFor(g: GameLike, player: number, v: number): boolean {
  const b = g.buildings[v];
  if (b && b.owner !== player) return true;
  const k = g.knights[v];
  if (k && k.owner !== player) return true;
  return false;
}

export function hasRoadAt(g: GameLike, player: number, v: number): boolean {
  return g.board.vertices[v].edges.some((e) => g.roads[e] === player);
}

export function distanceRuleOk(g: GameLike, v: number): boolean {
  if (g.buildings[v]) return false;
  return g.board.vertices[v].adj.every((a) => !g.buildings[a]);
}

// ---------- counts ----------

export interface PieceCounts {
  roads: number;
  settlements: number;
  cities: number;
  walls: number;
  knights: Record<1 | 2 | 3, number>;
}

export function pieceCounts(g: GameLike, player: number): PieceCounts {
  const c: PieceCounts = { roads: 0, settlements: 0, cities: 0, walls: 0, knights: { 1: 0, 2: 0, 3: 0 } };
  for (const owner of Object.values(g.roads)) if (owner === player) c.roads++;
  for (const b of Object.values(g.buildings)) {
    if (b.owner !== player) continue;
    if (b.kind === 'settlement') c.settlements++;
    else c.cities++;
    if (b.wall) c.walls++;
  }
  for (const k of Object.values(g.knights)) if (k.owner === player) c.knights[k.level]++;
  return c;
}

export function ownedVertices(g: GameLike, player: number, kind?: Building['kind']): number[] {
  return Object.entries(g.buildings)
    .filter(([, b]) => b.owner === player && (!kind || b.kind === kind))
    .map(([v]) => Number(v));
}

export function ownedKnights(g: GameLike, player: number): number[] {
  return Object.entries(g.knights)
    .filter(([, k]) => k.owner === player)
    .map(([v]) => Number(v));
}

/** Hexes touching at least one of the player's buildings. */
export function playerHexes(g: GameLike, player: number): number[] {
  const set = new Set<number>();
  for (const v of ownedVertices(g, player)) for (const h of g.board.vertices[v].hexes) set.add(h);
  return [...set];
}

export function handLimit(g: GameLike, player: number): number {
  return 7 + 2 * pieceCounts(g, player).walls;
}

// ---------- legality: placement ----------

export function canPlaceSetupBuilding(g: GameLike, v: number): boolean {
  return v >= 0 && v < g.board.vertices.length && !g.knights[v] && distanceRuleOk(g, v);
}

export function canPlaceSettlement(g: GameLike, player: number, v: number): boolean {
  return (
    v >= 0 &&
    v < g.board.vertices.length &&
    !g.knights[v] &&
    distanceRuleOk(g, v) &&
    hasRoadAt(g, player, v)
  );
}

export function canPlaceRoad(g: GameLike, player: number, e: number): boolean {
  if (e < 0 || e >= g.board.edges.length) return false;
  if (g.roads[e] !== undefined) return false;
  const edge = g.board.edges[e];
  return [edge.a, edge.b].some((v) => {
    const b = g.buildings[v];
    if (b && b.owner === player) return true;
    if (blockedFor(g, player, v)) return false;
    return g.board.vertices[v].edges.some((x) => x !== e && g.roads[x] === player);
  });
}

export function canPlaceSetupRoad(g: GameLike, e: number, fromVertex: number): boolean {
  if (e < 0 || e >= g.board.edges.length) return false;
  if (g.roads[e] !== undefined) return false;
  const edge = g.board.edges[e];
  return edge.a === fromVertex || edge.b === fromVertex;
}

export function canPlaceKnight(g: GameLike, player: number, v: number): boolean {
  return v >= 0 && v < g.board.vertices.length && isVertexEmpty(g, v) && hasRoadAt(g, player, v);
}

export function legalSettlementSpots(g: GameLike, player: number): number[] {
  return g.board.vertices.filter((v) => canPlaceSettlement(g, player, v.id)).map((v) => v.id);
}

export function legalSetupSpots(g: GameLike): number[] {
  return g.board.vertices.filter((v) => canPlaceSetupBuilding(g, v.id)).map((v) => v.id);
}

export function legalRoadSpots(g: GameLike, player: number): number[] {
  return g.board.edges.filter((e) => canPlaceRoad(g, player, e.id)).map((e) => e.id);
}

export function legalKnightSpots(g: GameLike, player: number): number[] {
  return g.board.vertices.filter((v) => canPlaceKnight(g, player, v.id)).map((v) => v.id);
}

// ---------- knights ----------

/**
 * Vertices reachable from `from` along `player`'s roads. Passage through a vertex held by an
 * opponent is not allowed. The start vertex is excluded.
 */
export function roadReach(g: GameLike, player: number, from: number): Set<number> {
  const seen = new Set<number>([from]);
  const out = new Set<number>();
  const stack = [from];
  while (stack.length) {
    const v = stack.pop()!;
    for (const e of g.board.vertices[v].edges) {
      if (g.roads[e] !== player) continue;
      const edge = g.board.edges[e];
      const w = edge.a === v ? edge.b : edge.a;
      if (seen.has(w)) continue;
      seen.add(w);
      out.add(w);
      // Can arrive at an opponent-held vertex (e.g. to displace) but not pass through it.
      if (!blockedFor(g, player, w)) stack.push(w);
    }
  }
  return out;
}

export function knightMoveTargets(g: GameLike, from: number): number[] {
  const k = g.knights[from];
  if (!k) return [];
  const out: number[] = [];
  for (const v of roadReach(g, k.owner, from)) {
    if (isVertexEmpty(g, v)) out.push(v);
    else {
      const other = g.knights[v];
      if (other && other.owner !== k.owner && other.level < k.level && !g.buildings[v]) out.push(v);
    }
  }
  return out;
}

/** Where a displaced knight may go: empty vertices reachable along its owner's roads. */
export function relocationOptions(g: GameLike, owner: number, from: number): number[] {
  return [...roadReach(g, owner, from)].filter((v) => isVertexEmpty(g, v));
}

export function canKnightAct(k: Knight, turn: number): boolean {
  return k.active && k.activatedOnTurn !== turn && k.actedOnTurn !== turn;
}

// ---------- roads ----------

/** Longest simple trail of the player's roads, broken by opponent buildings and knights. */
export function longestRoadLength(g: GameLike, player: number): number {
  const myEdges = Object.entries(g.roads)
    .filter(([, o]) => o === player)
    .map(([e]) => Number(e));
  if (myEdges.length === 0) return 0;
  let best = 0;
  const used = new Set<number>();
  const dfs = (v: number, len: number) => {
    if (len > best) best = len;
    if (len > 0 && blockedFor(g, player, v)) return;
    for (const e of g.board.vertices[v].edges) {
      if (g.roads[e] !== player || used.has(e)) continue;
      used.add(e);
      const edge = g.board.edges[e];
      dfs(edge.a === v ? edge.b : edge.a, len + 1);
      used.delete(e);
    }
  };
  const starts = new Set<number>();
  for (const e of myEdges) {
    starts.add(g.board.edges[e].a);
    starts.add(g.board.edges[e].b);
  }
  for (const v of starts) dfs(v, 0);
  return best;
}

/** A road is open if one of its ends connects to nothing else of its owner's. */
export function isOpenRoad(g: GameLike, e: number): boolean {
  const owner = g.roads[e];
  if (owner === undefined) return false;
  const edge = g.board.edges[e];
  return [edge.a, edge.b].some((v) => {
    const b = g.buildings[v];
    if (b && b.owner === owner) return false;
    const k = g.knights[v];
    if (k && k.owner === owner) return false;
    return !g.board.vertices[v].edges.some((x) => x !== e && g.roads[x] === owner);
  });
}

// ---------- scoring ----------

export function victoryPoints(g: GameLike, player: number): number {
  let vp = 0;
  for (const b of Object.values(g.buildings)) {
    if (b.owner !== player) continue;
    vp += b.kind === 'city' ? 2 : 1;
    if (b.metropolis) vp += 2;
  }
  if (g.longestRoad === player) vp += 2;
  const p = g.players[player];
  vp += p.shields + p.vpCards.length;
  if (g.caravan && g.caravan.owner === player) vp += 1;
  return vp;
}

// ---------- trading ----------

export function bankRate(g: GameLike, player: number, give: CardType, monsoon: CardType | null): number {
  let rate = 4;
  for (const v of ownedVertices(g, player)) {
    const h = g.board.vertices[v].harbor;
    if (h === 'any') rate = Math.min(rate, 3);
    else if (h && h === give) rate = Math.min(rate, 2);
  }
  if (g.caravan && g.caravan.owner === player && TERRAIN_RESOURCE[g.board.hexes[g.caravan.hex].terrain] === give) rate = 2;
  if (monsoon === give) rate = 2;
  if (isCommodity(give) && g.players[player].improvements.trade >= 3) rate = 2;
  return rate;
}

/** Cities that could receive a metropolis (not already one). */
export function metropolisCandidates(g: GameLike, player: number): number[] {
  return ownedVertices(g, player, 'city').filter((v) => !g.buildings[v].metropolis);
}

// ---------- territory (cosmetic) ----------

export interface Influence {
  player: number;
  weight: number;
  /** Direction (radians, screen coords) from the tile center toward this player's pieces. */
  angle: number;
}

export const TERRITORY_WEIGHTS = { road: 1, settlement: 2, city: 3, metropolis: 4 };

/**
 * Who has spread onto a tile: every building on its corners and every road on its edges adds
 * influence. Purely visual; it never affects the rules. Sorted by angle so sectors stay contiguous.
 */
export function hexInfluence(g: GameLike, hexId: number): Influence[] {
  const hex = g.board.hexes[hexId];
  const acc = new Map<number, { w: number; x: number; y: number }>();
  const add = (player: number, w: number, x: number, y: number) => {
    const a = acc.get(player) ?? { w: 0, x: 0, y: 0 };
    a.w += w;
    a.x += w * (x - hex.x);
    a.y += w * (y - hex.y);
    acc.set(player, a);
  };
  for (const v of g.board.vertices) {
    if (!v.hexes.includes(hexId)) continue;
    const b = g.buildings[v.id];
    if (!b) continue;
    const w = b.metropolis ? TERRITORY_WEIGHTS.metropolis : b.kind === 'city' ? TERRITORY_WEIGHTS.city : TERRITORY_WEIGHTS.settlement;
    add(b.owner, w, v.x, v.y);
  }
  for (const e of g.board.edges) {
    if (!e.hexes.includes(hexId)) continue;
    const owner = g.roads[e.id];
    if (owner === undefined) continue;
    const a = g.board.vertices[e.a];
    const b = g.board.vertices[e.b];
    add(owner, TERRITORY_WEIGHTS.road, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  return [...acc.entries()]
    .map(([player, a]) => ({ player, weight: a.w, angle: Math.atan2(a.y, a.x) }))
    .sort((p, q) => p.angle - q.angle || p.player - q.player);
}
