import { desertHex, generateBoard } from './board';
import {
  BARBARIAN_STEPS,
  DEFAULT_OPTIONS,
  RAIDERS,
  CARD_NAMES,
  CARD_TYPES,
  CITY_COMMODITY,
  CIVS,
  COMMODITIES,
  COSTS,
  KNIGHT_NAMES,
  LIMITS,
  PHYSICIAN_COST,
  PROGRESS,
  PROGRESS_HAND_LIMIT,
  RESOURCES,
  TERRAIN_RESOURCE,
  TRACKS,
  TRACK_COMMODITY,
  TRACK_INFO,
  emptyHand,
} from './data';
import {
  bankRate,
  canKnightAct,
  canPlaceKnight,
  canPlaceRoad,
  canPlaceSettlement,
  canPlaceSetupBuilding,
  canPlaceSetupRoad,
  gain,
  handLimit,
  handSize,
  hasCards,
  hasRoadAt,
  isOpenRoad,
  isValidCardSet,
  knightMoveTargets,
  legalKnightSpots,
  longestRoadLength,
  metropolisCandidates,
  ownedKnights,
  ownedVertices,
  pay,
  pieceCounts,
  playerHexes,
  relocationOptions,
  victoryPoints,
} from './helpers';
import { random, randInt, shuffle } from './rng';
import type {
  Action,
  AutoStep,
  CardType,
  Decision,
  EventFace,
  GameOptions,
  GameState,
  Hand,
  Knight,
  ProgressId,
  ProgressParams,
  QueueItem,
  RaiderTheme,
  Resource,
  SetupPlayer,
  Track,
} from './types';

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

function fail(message: string): never {
  throw new RuleError(message);
}

const EVENT_FACES: EventFace[] = ['ship', 'ship', 'ship', 'science', 'trade', 'politics'];
const MAX_LOG = 300;

// ---------------------------------------------------------------------------
// creation
// ---------------------------------------------------------------------------

export function createGame(setupPlayers: SetupPlayer[], seed: number, opts: Partial<GameOptions> = {}): GameState {
  if (setupPlayers.length < 3 || setupPlayers.length > 4) fail('Pangea needs 3 or 4 players.');
  const options = validateOptions(opts);
  const civs = new Set(setupPlayers.map((p) => p.civ));
  if (civs.size !== setupPlayers.length) fail('Each player needs a different civilization.');
  for (const p of setupPlayers) if (!CIVS[p.civ]) fail(`Unknown civilization ${p.civ}.`);

  const holder = { rng: seed >>> 0 || 1 };
  const board = generateBoard(holder, options.tokens);
  const seats = shuffle(holder, setupPlayers);
  const decks = {} as Record<Track, ProgressId[]>;
  for (const track of TRACKS) {
    const cards: ProgressId[] = [];
    for (const def of Object.values(PROGRESS)) if (def.track === track) for (let i = 0; i < def.count; i++) cards.push(def.id);
    decks[track] = shuffle(holder, cards);
  }
  const themes = (Object.keys(RAIDERS) as RaiderTheme[]).filter((t) => !setupPlayers.some((p) => p.civ === RAIDERS[t].skipIf));
  const raiders = themes[randInt(holder, themes.length)];

  const s: GameState = {
    version: 1,
    options,
    stats: emptyStats(setupPlayers.length),
    raiders,
    production: null,
    rng: holder.rng,
    board,
    players: seats.map((p, i) => ({
      id: i,
      name: p.name,
      civ: p.civ,
      hand: emptyHand(),
      progress: [],
      improvements: { science: 0, trade: 0, politics: 0 },
      shields: 0,
      vpCards: [],
    })),
    buildings: {},
    roads: {},
    knights: {},
    robber: desertHex(board),
    robberActive: false,
    caravan: null,
    barbarian: { position: 0, attacks: 0 },
    metropolis: { science: null, trade: null, politics: null },
    decks,
    longestRoad: null,
    phase: 'setup',
    setup: { index: 0, awaiting: 'building', lastVertex: null },
    current: 0,
    turn: 0,
    rolled: false,
    dice: null,
    flags: freshFlags(),
    queue: [],
    trades: [],
    log: [],
    winner: null,
    undo: [],
    nextId: 1,
  };
  log(s, null, `Seat order: ${s.players.map((p) => `${p.name} (${CIVS[p.civ].name})`).join(', ')}.`);
  log(s, 0, `${s.players[0].name} places first.`);
  log(s, null, `${RAIDERS[raiders].name} threaten the island. First to ${options.winVp} victory points wins.`);
  return s;
}

export function validateOptions(opts: Partial<GameOptions>): GameOptions {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  if (!Number.isInteger(o.winVp) || o.winVp < 10 || o.winVp > 15) fail('The victory target must be between 10 and 15.');
  if (o.tokens !== 'spiral' && o.tokens !== 'balanced') fail('Unknown number layout.');
  return o;
}

function emptyStats(n: number): GameState['stats'] {
  const z = () => Array.from({ length: n }, () => 0);
  return { produced: z(), robbed: z(), lostToRobber: z(), progressPlayed: z(), trades: z(), discarded: z() };
}

/** Fills in fields added after a game was saved, so older saves keep working. */
export function upgradeState(s: GameState): GameState {
  s.options ??= { ...DEFAULT_OPTIONS };
  s.stats ??= emptyStats(s.players.length);
  s.raiders ??= 'vikings';
  s.production ??= null;
  return s;
}

function freshFlags(): GameState['flags'] {
  return { augury: null, scaffolding: false, freeRoads: 0, monsoon: null };
}

// ---------------------------------------------------------------------------
// public entry point
// ---------------------------------------------------------------------------

const UNDOABLE = new Set<Action['type']>([
  'buildRoad',
  'buildSettlement',
  'buildCity',
  'buildWall',
  'buildKnight',
  'activateKnight',
  'promoteKnight',
  'moveKnight',
  'improve',
  'bankTrade',
]);

export function applyAction(state: GameState, player: number, action: Action): GameState {
  if (!Number.isInteger(player) || player < 0 || player >= state.players.length) fail('Unknown player.');
  if (!action || typeof action !== 'object' || typeof (action as Action).type !== 'string') fail('Malformed action.');
  if (state.phase === 'ended') fail('The game is over.');

  if (action.type === 'undo') return undo(state, player);

  const undoable =
    UNDOABLE.has(action.type) &&
    player === state.current &&
    !(action.type === 'moveKnight' && state.knights[action.to]);
  const snapshot = undoable ? JSON.stringify({ ...state, undo: [] }) : null;

  const s: GameState = upgradeState(structuredClone(state));
  handle(s, player, action);
  advance(s);
  s.undo = snapshot ? [...state.undo, snapshot].slice(-20) : [];
  return s;
}

function undo(state: GameState, player: number): GameState {
  if (player !== state.current) fail('Only the current player can undo.');
  if (state.undo.length === 0) fail('Nothing to undo.');
  const stack = state.undo.slice();
  const prev = JSON.parse(stack.pop()!) as GameState;
  prev.undo = stack;
  log(prev, player, `${prev.players[player].name} took back a move.`);
  return prev;
}

// ---------------------------------------------------------------------------
// queue processing
// ---------------------------------------------------------------------------

function isDecision(item: QueueItem): item is Decision {
  return !item.kind.startsWith('auto:');
}

/** The decisions currently being waited on (the leading group). */
export function activeDecisions(s: Pick<GameState, 'queue'>): Decision[] {
  const head = s.queue[0];
  if (!head || !isDecision(head)) return [];
  const out: Decision[] = [];
  for (const item of s.queue) {
    if (!isDecision(item) || item.group !== head.group) break;
    out.push(item);
  }
  return out;
}

function newGroup(s: GameState): number {
  return s.nextId++;
}

function pushFront(s: GameState, items: QueueItem[]): void {
  s.queue.unshift(...items);
}

function advance(s: GameState): void {
  for (let guard = 0; guard < 500; guard++) {
    enforceProgressLimits(s);
    const head = s.queue[0];
    if (!head || isDecision(head)) break;
    s.queue.shift();
    runAuto(s, head);
  }
  updateLongestRoad(s);
  checkWin(s);
}

function enforceProgressLimits(s: GameState): void {
  if (s.phase !== 'play') return;
  for (const p of s.players) {
    if (p.id === s.current || p.progress.length <= PROGRESS_HAND_LIMIT) continue;
    if (s.queue.some((q) => q.kind === 'discardProgress' && (q as Decision).player === p.id)) continue;
    pushFront(s, [{ kind: 'discardProgress', group: newGroup(s), player: p.id }]);
  }
}

function takeDecision<K extends Decision['kind']>(s: GameState, player: number, kind: K): Extract<Decision, { kind: K }> {
  const active = activeDecisions(s);
  const d = active.find((x) => x.player === player && x.kind === kind);
  if (!d) {
    if (active.length === 0) fail('There is nothing to decide right now.');
    fail('That is not what the game is waiting for.');
  }
  s.queue.splice(s.queue.indexOf(d), 1);
  return d as Extract<Decision, { kind: K }>;
}

// ---------------------------------------------------------------------------
// automatic steps
// ---------------------------------------------------------------------------

function runAuto(s: GameState, step: AutoStep): void {
  switch (step.kind) {
    case 'auto:eventDie':
      return eventDie(s);
    case 'auto:barbarianAttack':
      return barbarianAttack(s);
    case 'auto:gateDraw':
      return gateDraw(s, step.track);
    case 'auto:production':
      return production(s);
    case 'auto:sevenRobber':
      if (s.robberActive) pushFront(s, [{ kind: 'moveRobber', group: newGroup(s), player: s.current, source: 'seven' }]);
      else log(s, null, 'The robber stays put until the barbarians first land.');
      return;
  }
}

function eventDie(s: GameState): void {
  const face = s.dice!.event;
  if (face === 'ship') {
    s.barbarian.position++;
    if (s.barbarian.position >= BARBARIAN_STEPS) {
      log(s, null, `${RAIDERS[s.raiders].name} reach the shore!`);
      pushFront(s, [{ kind: 'auto:barbarianAttack' }]);
    } else {
      log(s, null, `${RAIDERS[s.raiders].name} draw closer (${s.barbarian.position}/${BARBARIAN_STEPS}).`);
    }
  } else {
    pushFront(s, [{ kind: 'auto:gateDraw', track: face }]);
  }
}

function barbarianAttack(s: GameState): void {
  const strength = Object.values(s.buildings).filter((b) => b.kind === 'city').length;
  const contrib = s.players.map(() => 0);
  for (const k of Object.values(s.knights)) if (k.active) contrib[k.owner] += k.level;
  const defense = contrib.reduce((a, b) => a + b, 0);
  log(s, null, `Barbarian strength ${strength} vs. defense ${defense}.`);
  const decisions: Decision[] = [];

  if (defense >= strength) {
    const max = Math.max(...contrib);
    if (max > 0) {
      const top = s.players.filter((p) => contrib[p.id] === max);
      if (top.length === 1) {
        top[0].shields++;
        log(s, top[0].id, `The island holds! ${top[0].name} earns a Shield of Pangea (+1 VP).`);
      } else {
        log(s, null, `The island holds! ${top.map((p) => p.name).join(' and ')} tie as top defenders and each take a progress card.`);
        const group = newGroup(s);
        if (TRACKS.some((t) => s.decks[t].length > 0)) for (const p of top) decisions.push({ kind: 'pickTrack', group, player: p.id });
      }
    } else {
      log(s, null, 'The barbarians find nothing worth raiding and sail away.');
    }
  } else {
    const candidates = s.players.filter((p) => metropolisCandidates(s, p.id).length > 0);
    if (candidates.length === 0) {
      log(s, null, 'The barbarians win, but there are no cities to sack.');
    } else {
      const min = Math.min(...candidates.map((p) => contrib[p.id]));
      const losers = candidates.filter((p) => contrib[p.id] === min);
      const group = newGroup(s);
      for (const p of losers) {
        const cities = metropolisCandidates(s, p.id);
        if (cities.length === 1) reduceCity(s, cities[0]);
        else decisions.push({ kind: 'loseCity', group, player: p.id });
      }
      log(s, null, `The barbarians sack the island! ${losers.map((p) => p.name).join(' and ')} each lose a city.`);
    }
  }

  for (const k of Object.values(s.knights)) k.active = false;
  s.barbarian.position = 0;
  s.barbarian.attacks++;
  if (!s.robberActive) {
    s.robberActive = true;
    log(s, null, 'The robber awakens.');
  }
  pushFront(s, decisions);
}

function reduceCity(s: GameState, v: number): void {
  const b = s.buildings[v];
  b.kind = 'settlement';
  b.wall = false;
  log(s, b.owner, `${s.players[b.owner].name}'s city is reduced to a settlement.`);
}

function gateDraw(s: GameState, track: Track): void {
  const red = s.dice!.red;
  log(s, null, `The ${TRACK_INFO[track].name} gate opens (red die ${red}).`);
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[(s.current + i) % s.players.length];
    const lvl = p.improvements[track];
    if (lvl >= 1 && red <= lvl + 1) drawProgress(s, p.id, track);
  }
}

function drawProgress(s: GameState, player: number, track: Track): void {
  const card = s.decks[track].shift();
  const p = s.players[player];
  if (!card) {
    log(s, player, `The ${TRACK_INFO[track].name} deck is empty.`);
    return;
  }
  if (PROGRESS[card].vp) {
    p.vpCards.push(card);
    log(s, player, `${p.name} draws ${PROGRESS[card].name} and reveals it (+1 VP).`);
  } else {
    p.progress.push(card);
    log(s, player, `${p.name} draws a ${TRACK_INFO[track].name} progress card.`);
    log(s, player, `You drew ${PROGRESS[card].name}.`, [player]);
  }
}

function production(s: GameState): void {
  const { red, yellow } = s.dice!;
  const sum = red + yellow;
  if (sum === 7) {
    const group = newGroup(s);
    const discards: Decision[] = [];
    for (const p of s.players) {
      const size = handSize(p.hand);
      if (size > handLimit(s, p.id)) discards.push({ kind: 'discard', group, player: p.id, count: Math.floor(size / 2), reason: 'seven' });
    }
    if (discards.length) log(s, null, `${discards.map((d) => s.players[d.player].name).join(', ')} must discard.`);
    pushFront(s, [...discards, { kind: 'auto:sevenRobber' }]);
    return;
  }

  const gains: Hand[] = s.players.map(() => emptyHand());
  const items: NonNullable<GameState['production']>['items'] = [];
  for (const hex of s.board.hexes) {
    if (hex.token !== sum || hex.id === s.robber) continue;
    const res = TERRAIN_RESOURCE[hex.terrain];
    if (!res) continue;
    for (const v of s.board.vertices) {
      if (!v.hexes.includes(hex.id)) continue;
      const b = s.buildings[v.id];
      if (!b) continue;
      let item = items.find((x) => x.hex === hex.id && x.player === b.owner);
      if (!item) items.push((item = { hex: hex.id, player: b.owner, cards: {} }));
      const add = (t: CardType) => {
        gains[b.owner][t] += 1;
        item!.cards[t] = (item!.cards[t] ?? 0) + 1;
      };
      add(res);
      if (b.kind === 'city') add(CITY_COMMODITY[hex.terrain] ?? res);
    }
  }
  s.production = { seq: s.nextId++, sum, items };
  const granaries: Decision[] = [];
  const group = newGroup(s);
  for (const p of s.players) {
    const g = gains[p.id];
    if (handSize(g) > 0) {
      gain(p.hand, g);
      s.stats.produced[p.id] += handSize(g);
      log(s, p.id, `${p.name} collects ${describeCards(g)}.`);
    } else if (p.improvements.science >= 3) {
      granaries.push({ kind: 'pickResource', group, player: p.id });
    }
  }
  pushFront(s, granaries);
}

// ---------------------------------------------------------------------------
// bookkeeping
// ---------------------------------------------------------------------------

export function describeCards(cards: Partial<Hand>): string {
  const parts: string[] = [];
  for (const t of CARD_TYPES) {
    const n = cards[t] ?? 0;
    if (n > 0) parts.push(`${n} ${CARD_NAMES[t]}`);
  }
  return parts.length ? parts.join(', ') : 'nothing';
}

function log(s: GameState, player: number | null, text: string, only?: number[]): void {
  s.log.push(only ? { turn: s.turn, player, text, only } : { turn: s.turn, player, text });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

function updateLongestRoad(s: GameState): void {
  const lengths = s.players.map((p) => longestRoadLength(s, p.id));
  let holder = s.longestRoad;
  if (holder !== null) {
    const others = Math.max(...lengths.filter((_, i) => i !== holder));
    if (lengths[holder] < 5 || lengths[holder] < others) holder = null;
  }
  if (holder === null) {
    const max = Math.max(...lengths);
    const top = lengths.filter((l) => l === max).length;
    if (max >= 5 && top === 1) holder = lengths.indexOf(max);
  }
  if (holder !== s.longestRoad) {
    if (holder !== null) log(s, holder, `${s.players[holder].name} now has the longest road (+2 VP).`);
    else log(s, null, 'Nobody holds the longest road.');
    s.longestRoad = holder;
  }
}

function checkWin(s: GameState): void {
  if (s.phase !== 'play') return;
  const vp = victoryPoints(s, s.current);
  if (vp >= s.options.winVp) {
    s.phase = 'ended';
    s.winner = s.current;
    s.queue = [];
    log(s, s.current, `${s.players[s.current].name} reaches ${vp} victory points and wins!`);
  }
}

function stealRandom(s: GameState, thief: number, victim: number): void {
  const hand = s.players[victim].hand;
  const total = handSize(hand);
  if (total === 0) return;
  let pick = randInt(s, total);
  for (const t of CARD_TYPES) {
    if (pick < hand[t]) {
      hand[t]--;
      s.players[thief].hand[t]++;
      s.stats.robbed[thief]++;
      s.stats.lostToRobber[victim]++;
      log(s, thief, `${s.players[thief].name} steals a card from ${s.players[victim].name}.`);
      log(s, thief, `${s.players[thief].name} stole 1 ${CARD_NAMES[t]} from ${s.players[victim].name}.`, [thief, victim]);
      return;
    }
    pick -= hand[t];
  }
}

function transfer(s: GameState, from: number, to: number, cards: Partial<Hand>): void {
  pay(s.players[from].hand, cards);
  gain(s.players[to].hand, cards);
}

function opponentsInOrder(s: GameState, player: number): number[] {
  const out = [];
  for (let i = 1; i < s.players.length; i++) out.push((player + i) % s.players.length);
  return out;
}

function vp(s: GameState, player: number): number {
  return victoryPoints(s, player);
}

// ---------------------------------------------------------------------------
// guards
// ---------------------------------------------------------------------------

function requireTurn(s: GameState, player: number): void {
  if (s.phase !== 'play') fail('The game has not started yet.');
  if (s.current !== player) fail('It is not your turn.');
  if (s.queue.length) fail('The game is waiting on a decision first.');
}

function requireRolled(s: GameState): void {
  if (!s.rolled) fail('Roll the dice first.');
}

function requireVertex(s: GameState, v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= s.board.vertices.length) fail('Pick an intersection.');
  return v;
}

function requireEdge(s: GameState, e: unknown): number {
  if (typeof e !== 'number' || !Number.isInteger(e) || e < 0 || e >= s.board.edges.length) fail('Pick a path.');
  return e;
}

function requireHex(s: GameState, h: unknown): number {
  if (typeof h !== 'number' || !Number.isInteger(h) || h < 0 || h >= s.board.hexes.length) fail('Pick a tile.');
  return h;
}

function requireCards(s: GameState, player: number, cost: Partial<Hand>, what: string): void {
  if (!hasCards(s.players[player].hand, cost)) fail(`You need ${describeCards(cost)} to ${what}.`);
}

function requireTrack(t: unknown): Track {
  if (!TRACKS.includes(t as Track)) fail('Pick science, trade or politics.');
  return t as Track;
}

function requireResource(r: unknown): Resource {
  if (!RESOURCES.includes(r as Resource)) fail('Pick a resource.');
  return r as Resource;
}

function requireCardType(t: unknown): CardType {
  if (!CARD_TYPES.includes(t as CardType)) fail('Pick a resource or commodity.');
  return t as CardType;
}

function ownKnight(s: GameState, player: number, v: number): Knight {
  const k = s.knights[v];
  if (!k || k.owner !== player) fail('That is not your knight.');
  return k;
}

function checkPromotion(s: GameState, player: number, k: Knight): void {
  if (k.level >= 3) fail('That knight is already a Champion.');
  if (k.promotedOnTurn === s.turn) fail('A knight can only be promoted once per turn.');
  const next = (k.level + 1) as 2 | 3;
  if (next === 3 && s.players[player].improvements.politics < 3) fail('Champions need a Citadel (Politics level 3).');
  if (pieceCounts(s, player).knights[next] >= LIMITS.knightsPerLevel) fail(`You already have ${LIMITS.knightsPerLevel} ${KNIGHT_NAMES[next]} knights.`);
}

function exactCards(s: GameState, player: number, cards: unknown, count: number): Partial<Hand> {
  if (!isValidCardSet(cards as Partial<Hand>)) fail('Pick some cards.');
  const set = cards as Partial<Hand>;
  if (handSize(set) !== count) fail(`Pick exactly ${count} card${count === 1 ? '' : 's'}.`);
  if (!hasCards(s.players[player].hand, set)) fail('You do not have those cards.');
  return set;
}

// ---------------------------------------------------------------------------
// action dispatch
// ---------------------------------------------------------------------------

function handle(s: GameState, p: number, a: Action): void {
  switch (a.type) {
    case 'setupBuilding':
      return setupBuilding(s, p, a.vertex);
    case 'setupRoad':
      return setupRoad(s, p, a.edge);
    case 'roll':
      return roll(s, p);
    case 'endTurn':
      return endTurn(s, p);
    case 'buildRoad':
      return buildRoad(s, p, a.edge);
    case 'buildSettlement':
      return buildSettlement(s, p, a.vertex);
    case 'buildCity':
      return buildCity(s, p, a.vertex);
    case 'buildWall':
      return buildWall(s, p, a.vertex);
    case 'buildKnight':
      return buildKnight(s, p, a.vertex);
    case 'activateKnight':
      return activateKnight(s, p, a.vertex);
    case 'promoteKnight':
      return promoteKnight(s, p, a.vertex);
    case 'moveKnight':
      return moveKnight(s, p, a.from, a.to);
    case 'chaseRobber':
      return chaseRobber(s, p, a.vertex);
    case 'improve':
      return improve(s, p, a.track, a.vertex);
    case 'bankTrade':
      return bankTrade(s, p, a.give, a.get);
    case 'offerTrade':
      return offerTrade(s, p, a.give, a.get);
    case 'respondTrade':
      return respondTrade(s, p, a.offer, a.accept);
    case 'confirmTrade':
      return confirmTrade(s, p, a.offer, a.with);
    case 'cancelTrade':
      return cancelTrade(s, p, a.offer);
    case 'playProgress':
      return playProgress(s, p, a.card, a.params ?? {});
    case 'discardProgress':
      return discardProgress(s, p, a.card);
    // decisions
    case 'discard': {
      const d = takeDecision(s, p, 'discard');
      const cards = exactCards(s, p, a.cards, d.count);
      pay(s.players[p].hand, cards);
      s.stats.discarded[p] += d.count;
      log(s, p, `${s.players[p].name} discards ${d.count} cards.`);
      return;
    }
    case 'moveRobber': {
      const hex = requireHex(s, a.hex);
      if (hex === s.robber) fail('The robber must move to a different tile.');
      takeDecision(s, p, 'moveRobber');
      return moveRobberTo(s, p, hex);
    }
    case 'steal': {
      const d = takeDecision(s, p, 'steal');
      if (!d.candidates.includes(a.victim)) fail('You cannot steal from that player.');
      stealRandom(s, p, a.victim);
      return;
    }
    case 'pickResource': {
      takeDecision(s, p, 'pickResource');
      const r = requireResource(a.resource);
      s.players[p].hand[r]++;
      log(s, p, `${s.players[p].name}'s granaries provide 1 ${CARD_NAMES[r]}.`);
      return;
    }
    case 'loseCity': {
      const v = requireVertex(s, a.vertex);
      const b = s.buildings[v];
      if (!b || b.owner !== p || b.kind !== 'city' || b.metropolis) fail('Pick one of your cities (not a metropolis).');
      takeDecision(s, p, 'loseCity');
      reduceCity(s, v);
      return;
    }
    case 'pickTrack': {
      const t = requireTrack(a.track);
      if (s.decks[t].length === 0 && TRACKS.some((x) => s.decks[x].length > 0)) fail('That deck is empty; pick another.');
      takeDecision(s, p, 'pickTrack');
      drawProgress(s, p, t);
      return;
    }
    case 'relocateKnight': {
      const v = requireVertex(s, a.vertex);
      const d = activeDecisions(s).find((x) => x.kind === 'relocateKnight' && x.player === p) as Extract<Decision, { kind: 'relocateKnight' }> | undefined;
      if (!d) fail('There is no knight to relocate.');
      if (!d.options.includes(v) || s.knights[v] || s.buildings[v]) fail('Your knight cannot go there.');
      takeDecision(s, p, 'relocateKnight');
      s.knights[v] = d.knight;
      log(s, p, `${s.players[p].name} relocates their displaced knight.`);
      return;
    }
    case 'giveCards': {
      const d = activeDecisions(s).find((x) => x.kind === 'giveCards' && x.player === p) as Extract<Decision, { kind: 'giveCards' }> | undefined;
      if (!d) fail('You do not owe anyone cards.');
      const cards = exactCards(s, p, a.cards, d.count);
      takeDecision(s, p, 'giveCards');
      transfer(s, p, d.to, cards);
      log(s, p, `${s.players[p].name} gives ${d.count} cards to ${s.players[d.to].name}.`);
      log(s, p, `${s.players[p].name} gave ${describeCards(cards)} to ${s.players[d.to].name}.`, [p, d.to]);
      return;
    }
    case 'harborLevyOffer':
      return harborLevyOffer(s, p, a.resource);
    case 'harborLevyReturn': {
      const d = activeDecisions(s).find((x) => x.kind === 'harborLevyReturn' && x.player === p) as Extract<Decision, { kind: 'harborLevyReturn' }> | undefined;
      if (!d) fail('Nothing to return.');
      if (!COMMODITIES.includes(a.commodity)) fail('Pick a commodity.');
      if (s.players[p].hand[a.commodity] < 1) fail('You do not have that commodity.');
      takeDecision(s, p, 'harborLevyReturn');
      transfer(s, p, d.to, { [a.commodity]: 1 });
      log(s, p, `${s.players[p].name} returns 1 ${CARD_NAMES[a.commodity]}.`);
      return;
    }
    case 'tributeTake': {
      const d = activeDecisions(s).find((x) => x.kind === 'tributeTake' && x.player === p) as Extract<Decision, { kind: 'tributeTake' }> | undefined;
      if (!d) fail('Nothing to take.');
      const cards = exactCards(s, d.target, a.cards, d.count);
      takeDecision(s, p, 'tributeTake');
      transfer(s, d.target, p, cards);
      log(s, p, `${s.players[p].name} takes ${describeCards(cards)} from ${s.players[d.target].name}.`);
      return;
    }
    case 'informantTake': {
      const d = activeDecisions(s).find((x) => x.kind === 'informantTake' && x.player === p) as Extract<Decision, { kind: 'informantTake' }> | undefined;
      if (!d) fail('Nothing to take.');
      const idx = s.players[d.target].progress.indexOf(a.card);
      if (idx < 0) fail('They do not hold that card.');
      takeDecision(s, p, 'informantTake');
      s.players[d.target].progress.splice(idx, 1);
      s.players[p].progress.push(a.card);
      log(s, p, `${s.players[p].name}'s informant takes a progress card from ${s.players[d.target].name}.`);
      log(s, p, `The card was ${PROGRESS[a.card].name}.`, [p, d.target]);
      return;
    }
    case 'turncoatRemove': {
      const v = requireVertex(s, a.vertex);
      const k = ownKnight(s, p, v);
      const d = takeDecision(s, p, 'turncoatRemove');
      delete s.knights[v];
      log(s, p, `${s.players[p].name}'s ${KNIGHT_NAMES[k.level]} deserts.`);
      const thief = d.to;
      if (pieceCounts(s, thief).knights[k.level] < LIMITS.knightsPerLevel && legalKnightSpots(s, thief).length > 0) {
        pushFront(s, [{ kind: 'turncoatPlace', group: newGroup(s), player: thief, level: k.level, active: k.active }]);
      } else {
        log(s, thief, `${s.players[thief].name} has nowhere to place the turncoat.`);
      }
      return;
    }
    case 'turncoatPlace': {
      const d = takeDecision(s, p, 'turncoatPlace');
      if (a.vertex === null) return;
      const v = requireVertex(s, a.vertex);
      if (!canPlaceKnight(s, p, v)) fail('Place the knight on an empty intersection touching your road.');
      s.knights[v] = { owner: p, level: d.level, active: d.active, activatedOnTurn: s.turn, actedOnTurn: -1, promotedOnTurn: -1 };
      log(s, p, `${s.players[p].name} welcomes a ${KNIGHT_NAMES[d.level]} turncoat.`);
      return;
    }
    case 'envoyRebuild': {
      takeDecision(s, p, 'envoyRebuild');
      if (a.edge === null) return;
      const e = requireEdge(s, a.edge);
      if (!canPlaceRoad(s, p, e)) fail('You cannot build a road there.');
      s.roads[e] = p;
      log(s, p, `${s.players[p].name} rebuilds the road elsewhere.`);
      return;
    }
    default:
      fail(`Unknown action ${(a as { type: string }).type}.`);
  }
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

export function setupSeat(s: { players: unknown[]; setup: GameState['setup'] }): number {
  const n = s.players.length;
  const i = s.setup.index;
  return i < n ? i : 2 * n - 1 - i;
}

function setupBuilding(s: GameState, p: number, vertex: number): void {
  if (s.phase !== 'setup') fail('Setup is over.');
  if (setupSeat(s) !== p) fail('It is not your turn to place.');
  if (s.setup.awaiting !== 'building') fail('Place your road first.');
  const v = requireVertex(s, vertex);
  if (!canPlaceSetupBuilding(s, v)) fail('Too close to another building.');
  const secondRound = s.setup.index >= s.players.length;
  s.buildings[v] = { owner: p, kind: secondRound ? 'city' : 'settlement', wall: false, metropolis: null };
  if (secondRound) {
    const got = emptyHand();
    for (const h of s.board.vertices[v].hexes) {
      const r = TERRAIN_RESOURCE[s.board.hexes[h].terrain];
      if (r) got[r]++;
    }
    gain(s.players[p].hand, got);
    log(s, p, `${s.players[p].name} founds a city and collects ${describeCards(got)}.`);
  } else {
    log(s, p, `${s.players[p].name} founds a settlement.`);
  }
  s.setup.awaiting = 'road';
  s.setup.lastVertex = v;
}

function setupRoad(s: GameState, p: number, edge: number): void {
  if (s.phase !== 'setup') fail('Setup is over.');
  if (setupSeat(s) !== p) fail('It is not your turn to place.');
  if (s.setup.awaiting !== 'road') fail('Place your building first.');
  const e = requireEdge(s, edge);
  if (!canPlaceSetupRoad(s, e, s.setup.lastVertex!)) fail('The road must touch the building you just placed.');
  s.roads[e] = p;
  s.setup.index++;
  s.setup.awaiting = 'building';
  s.setup.lastVertex = null;
  if (s.setup.index >= s.players.length * 2) {
    s.phase = 'play';
    s.current = 0;
    s.turn = 1;
    log(s, 0, `Setup complete. ${s.players[0].name} rolls first.`);
  }
}

// ---------------------------------------------------------------------------
// turn flow
// ---------------------------------------------------------------------------

function roll(s: GameState, p: number): void {
  requireTurn(s, p);
  if (s.rolled) fail('You already rolled this turn.');
  const forced = s.flags.augury;
  const red = forced ? forced.red : randInt(s, 6) + 1;
  const yellow = forced ? forced.yellow : randInt(s, 6) + 1;
  const event = EVENT_FACES[randInt(s, 6)];
  s.flags.augury = null;
  s.dice = { red, yellow, event };
  s.rolled = true;
  log(s, p, `${s.players[p].name} rolls ${red + yellow} (red ${red}, yellow ${yellow}).`);
  s.queue.push({ kind: 'auto:eventDie' }, { kind: 'auto:production' });
}

function endTurn(s: GameState, p: number): void {
  requireTurn(s, p);
  requireRolled(s);
  if (s.players[p].progress.length > PROGRESS_HAND_LIMIT) fail(`You hold more than ${PROGRESS_HAND_LIMIT} progress cards. Play or discard one first.`);
  s.trades = [];
  s.flags = freshFlags();
  s.current = (s.current + 1) % s.players.length;
  s.turn++;
  s.rolled = false;
  log(s, s.current, `${s.players[s.current].name}'s turn.`);
}

// ---------------------------------------------------------------------------
// building
// ---------------------------------------------------------------------------

function buildRoad(s: GameState, p: number, edge: number): void {
  requireTurn(s, p);
  requireRolled(s);
  const e = requireEdge(s, edge);
  if (!canPlaceRoad(s, p, e)) fail('You cannot build a road there.');
  if (pieceCounts(s, p).roads >= LIMITS.roads) fail('You have no roads left.');
  if (s.flags.freeRoads > 0) s.flags.freeRoads--;
  else {
    requireCards(s, p, COSTS.road, 'build a road');
    pay(s.players[p].hand, COSTS.road);
  }
  s.roads[e] = p;
  log(s, p, `${s.players[p].name} builds a road.`);
}

function buildSettlement(s: GameState, p: number, vertex: number): void {
  requireTurn(s, p);
  requireRolled(s);
  const v = requireVertex(s, vertex);
  if (!canPlaceSettlement(s, p, v)) fail('You cannot build a settlement there.');
  if (pieceCounts(s, p).settlements >= LIMITS.settlements) fail('You have no settlements left. Upgrade one to a city first.');
  requireCards(s, p, COSTS.settlement, 'build a settlement');
  pay(s.players[p].hand, COSTS.settlement);
  s.buildings[v] = { owner: p, kind: 'settlement', wall: false, metropolis: null };
  log(s, p, `${s.players[p].name} builds a settlement.`);
}

function upgradeToCity(s: GameState, p: number, v: number, cost: Partial<Hand>): void {
  const b = s.buildings[v];
  if (!b || b.owner !== p || b.kind !== 'settlement') fail('Pick one of your settlements.');
  if (pieceCounts(s, p).cities >= LIMITS.cities) fail('You have no cities left.');
  requireCards(s, p, cost, 'build a city');
  pay(s.players[p].hand, cost);
  b.kind = 'city';
  log(s, p, `${s.players[p].name} builds a city.`);
}

function buildCity(s: GameState, p: number, vertex: number): void {
  requireTurn(s, p);
  requireRolled(s);
  upgradeToCity(s, p, requireVertex(s, vertex), COSTS.city);
}

function placeWall(s: GameState, p: number, v: number, cost: Partial<Hand>): void {
  const b = s.buildings[v];
  if (!b || b.owner !== p || b.kind !== 'city') fail('Walls go around your cities.');
  if (b.wall) fail('That city already has a wall.');
  if (pieceCounts(s, p).walls >= LIMITS.walls) fail('You have no walls left.');
  requireCards(s, p, cost, 'build a wall');
  pay(s.players[p].hand, cost);
  b.wall = true;
  log(s, p, `${s.players[p].name} builds a city wall.`);
}

function buildWall(s: GameState, p: number, vertex: number): void {
  requireTurn(s, p);
  requireRolled(s);
  placeWall(s, p, requireVertex(s, vertex), COSTS.wall);
}

function buildKnight(s: GameState, p: number, vertex: number): void {
  requireTurn(s, p);
  requireRolled(s);
  const v = requireVertex(s, vertex);
  if (!canPlaceKnight(s, p, v)) fail('Knights go on an empty intersection touching your road.');
  if (pieceCounts(s, p).knights[1] >= LIMITS.knightsPerLevel) fail('You have no Levy knights left. Promote one first.');
  requireCards(s, p, COSTS.knight, 'raise a knight');
  pay(s.players[p].hand, COSTS.knight);
  s.knights[v] = { owner: p, level: 1, active: false, activatedOnTurn: -1, actedOnTurn: -1, promotedOnTurn: -1 };
  log(s, p, `${s.players[p].name} raises a knight.`);
}

function activateKnight(s: GameState, p: number, vertex: number): void {
  requireTurn(s, p);
  requireRolled(s);
  const k = ownKnight(s, p, requireVertex(s, vertex));
  if (k.active) fail('That knight is already active.');
  requireCards(s, p, COSTS.activate, 'activate a knight');
  pay(s.players[p].hand, COSTS.activate);
  k.active = true;
  k.activatedOnTurn = s.turn;
  log(s, p, `${s.players[p].name} activates a knight.`);
}

function promoteKnight(s: GameState, p: number, vertex: number): void {
  requireTurn(s, p);
  requireRolled(s);
  const k = ownKnight(s, p, requireVertex(s, vertex));
  checkPromotion(s, p, k);
  requireCards(s, p, COSTS.promote, 'promote a knight');
  pay(s.players[p].hand, COSTS.promote);
  k.level = (k.level + 1) as 2 | 3;
  k.promotedOnTurn = s.turn;
  log(s, p, `${s.players[p].name} promotes a knight to ${KNIGHT_NAMES[k.level]}.`);
}

function moveKnight(s: GameState, p: number, fromV: number, toV: number): void {
  requireTurn(s, p);
  requireRolled(s);
  const from = requireVertex(s, fromV);
  const to = requireVertex(s, toV);
  const k = ownKnight(s, p, from);
  if (!canKnightAct(k, s.turn)) fail('That knight cannot act this turn (it must be active, and not activated or used this turn).');
  if (!knightMoveTargets(s, from).includes(to)) fail('The knight cannot reach that intersection.');
  const displaced = s.knights[to];
  delete s.knights[from];
  s.knights[to] = { ...k, active: false, actedOnTurn: s.turn };
  if (!displaced) {
    log(s, p, `${s.players[p].name} moves a knight.`);
    return;
  }
  log(s, p, `${s.players[p].name}'s knight displaces ${s.players[displaced.owner].name}'s ${KNIGHT_NAMES[displaced.level]}.`);
  displace(s, displaced, to);
}

function displace(s: GameState, knight: Knight, from: number): void {
  const options = relocationOptions(s, knight.owner, from);
  if (options.length === 0) {
    log(s, knight.owner, `${s.players[knight.owner].name}'s knight has nowhere to go and leaves the board.`);
    return;
  }
  pushFront(s, [{ kind: 'relocateKnight', group: newGroup(s), player: knight.owner, from, knight, options }]);
}

function chaseRobber(s: GameState, p: number, vertex: number): void {
  requireTurn(s, p);
  requireRolled(s);
  if (!s.robberActive) fail('The robber sleeps until the barbarians first land.');
  const v = requireVertex(s, vertex);
  const k = ownKnight(s, p, v);
  if (!canKnightAct(k, s.turn)) fail('That knight cannot act this turn.');
  if (!s.board.vertices[v].hexes.includes(s.robber)) fail('The knight must stand next to the robber.');
  k.active = false;
  k.actedOnTurn = s.turn;
  log(s, p, `${s.players[p].name}'s knight chases off the robber.`);
  pushFront(s, [{ kind: 'moveRobber', group: newGroup(s), player: p, source: 'knight' }]);
}

function moveRobberTo(s: GameState, p: number, hex: number): void {
  s.robber = hex;
  log(s, p, `${s.players[p].name} moves the robber.`);
  const candidates = robberVictims(s, p, hex);
  if (candidates.length === 1) stealRandom(s, p, candidates[0]);
  else if (candidates.length > 1) pushFront(s, [{ kind: 'steal', group: newGroup(s), player: p, candidates }]);
}

function robberVictims(s: GameState, thief: number, hex: number): number[] {
  const set = new Set<number>();
  for (const v of s.board.vertices) {
    if (!v.hexes.includes(hex)) continue;
    const b = s.buildings[v.id];
    if (b && b.owner !== thief && handSize(s.players[b.owner].hand) > 0) set.add(b.owner);
  }
  return [...set].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// improvements
// ---------------------------------------------------------------------------

function improve(s: GameState, p: number, trackIn: Track, vertex: number | undefined): void {
  requireTurn(s, p);
  requireRolled(s);
  const track = requireTrack(trackIn);
  const player = s.players[p];
  const level = player.improvements[track];
  if (level >= 5) fail('That track is complete.');
  if (ownedVertices(s, p, 'city').length === 0) fail('You need a city to make improvements.');
  const commodity = TRACK_COMMODITY[track];
  const discount = s.flags.scaffolding ? 1 : 0;
  const cost = Math.max(0, level + 1 - discount);
  if (player.hand[commodity] < cost) fail(`You need ${cost} ${CARD_NAMES[commodity]}.`);
  const newLevel = level + 1;

  if (newLevel >= 4 && s.metropolis[track] !== p) {
    const candidates = metropolisCandidates(s, p);
    if (candidates.length === 0) fail('Going past level 3 needs a city that is not already a metropolis.');
    const holder = s.metropolis[track];
    const takes = holder === null || (newLevel === 5 && s.players[holder].improvements[track] < 5);
    if (takes) {
      const v = vertex ?? (candidates.length === 1 ? candidates[0] : fail('Choose which city becomes the metropolis.'));
      if (!candidates.includes(v)) fail('That city cannot become a metropolis.');
      if (holder !== null) {
        for (const b of Object.values(s.buildings)) if (b.metropolis === track) b.metropolis = null;
        log(s, p, `${player.name} takes the ${TRACK_INFO[track].metropolis} from ${s.players[holder].name}.`);
      }
      s.buildings[v].metropolis = track;
      s.metropolis[track] = p;
      log(s, p, `${player.name} raises the ${TRACK_INFO[track].metropolis} (+2 VP).`);
    }
  }

  player.hand[commodity] -= cost;
  player.improvements[track] = newLevel;
  if (discount) s.flags.scaffolding = false;
  log(s, p, `${player.name} improves ${TRACK_INFO[track].name} to level ${newLevel}.`);
  if (newLevel === 3) log(s, p, `${player.name} gains the ${TRACK_INFO[track].ability}.`);
}

// ---------------------------------------------------------------------------
// trading
// ---------------------------------------------------------------------------

function bankTrade(s: GameState, p: number, giveIn: CardType, getIn: CardType): void {
  requireTurn(s, p);
  requireRolled(s);
  const give = requireCardType(giveIn);
  const get = requireCardType(getIn);
  if (give === get) fail('Pick two different cards.');
  const rate = bankRate(s, p, give, s.flags.monsoon);
  if (s.players[p].hand[give] < rate) fail(`You need ${rate} ${CARD_NAMES[give]}.`);
  s.players[p].hand[give] -= rate;
  s.players[p].hand[get] += 1;
  log(s, p, `${s.players[p].name} trades ${rate} ${CARD_NAMES[give]} to the bank for 1 ${CARD_NAMES[get]}.`);
}

function validateOfferSides(give: unknown, get: unknown): { give: Partial<Hand>; get: Partial<Hand> } {
  if (!isValidCardSet(give as Partial<Hand>) || !isValidCardSet(get as Partial<Hand>)) fail('Malformed offer.');
  const g = give as Partial<Hand>;
  const w = get as Partial<Hand>;
  if (handSize(g) === 0 || handSize(w) === 0) fail('Both sides of a trade must include cards.');
  for (const t of CARD_TYPES) if ((g[t] ?? 0) > 0 && (w[t] ?? 0) > 0) fail('You cannot trade a card type for itself.');
  return { give: g, get: w };
}

function offerTrade(s: GameState, p: number, giveIn: Partial<Hand>, getIn: Partial<Hand>): void {
  if (s.phase !== 'play') fail('Trading starts after setup.');
  if (s.queue.length) fail('The game is waiting on a decision first.');
  if (!s.rolled) fail(`${s.players[s.current].name} has not rolled yet.`);
  const { give, get } = validateOfferSides(giveIn, getIn);
  if (!hasCards(s.players[p].hand, give)) fail('You do not have those cards.');
  const to = p === s.current ? null : s.current;
  if (p !== s.current) s.trades = s.trades.filter((o) => o.from !== p);
  s.trades.push({ id: s.nextId++, from: p, to, give, get, accepted: [], declined: [] });
  log(s, p, `${s.players[p].name} offers ${describeCards(give)} for ${describeCards(get)}${to === null ? '' : ` to ${s.players[to].name}`}.`);
}

function findOffer(s: GameState, id: number) {
  const o = s.trades.find((t) => t.id === id);
  if (!o) fail('That offer is gone.');
  return o;
}

function executeTrade(s: GameState, a: number, b: number, aGives: Partial<Hand>, bGives: Partial<Hand>): void {
  if (!hasCards(s.players[a].hand, aGives)) fail(`${s.players[a].name} no longer has the cards for this trade.`);
  if (!hasCards(s.players[b].hand, bGives)) fail(`${s.players[b].name} no longer has the cards for this trade.`);
  transfer(s, a, b, aGives);
  transfer(s, b, a, bGives);
  s.stats.trades[a]++;
  s.stats.trades[b]++;
  log(s, a, `${s.players[a].name} and ${s.players[b].name} trade ${describeCards(aGives)} for ${describeCards(bGives)}.`);
}

function respondTrade(s: GameState, p: number, id: number, accept: boolean): void {
  if (s.queue.length) fail('The game is waiting on a decision first.');
  const o = findOffer(s, id);
  if (o.from === p) fail('That is your own offer.');
  if (o.to === null) {
    if (accept) {
      if (!hasCards(s.players[p].hand, o.get)) fail('You do not have the cards they want.');
      o.accepted = [...o.accepted.filter((x) => x !== p), p];
      o.declined = o.declined.filter((x) => x !== p);
    } else {
      o.declined = [...o.declined.filter((x) => x !== p), p];
      o.accepted = o.accepted.filter((x) => x !== p);
    }
    return;
  }
  if (o.to !== p) fail('That offer is not for you.');
  s.trades = s.trades.filter((t) => t.id !== id);
  if (accept) executeTrade(s, o.from, p, o.give, o.get);
  else log(s, p, `${s.players[p].name} declines ${s.players[o.from].name}'s offer.`);
}

function confirmTrade(s: GameState, p: number, id: number, partner: number): void {
  requireTurn(s, p);
  const o = findOffer(s, id);
  if (o.from !== p) fail('You can only confirm your own offer.');
  if (!o.accepted.includes(partner)) fail('That player has not accepted.');
  s.trades = s.trades.filter((t) => t.id !== id);
  executeTrade(s, p, partner, o.give, o.get);
}

function cancelTrade(s: GameState, p: number, id: number): void {
  const o = findOffer(s, id);
  if (o.from !== p) fail('You can only withdraw your own offer.');
  s.trades = s.trades.filter((t) => t.id !== id);
}

// ---------------------------------------------------------------------------
// progress cards
// ---------------------------------------------------------------------------

function discardProgress(s: GameState, p: number, card: ProgressId): void {
  const player = s.players[p];
  const idx = player.progress.indexOf(card);
  if (idx < 0) fail('You do not hold that card.');
  const pending = activeDecisions(s).some((d) => d.kind === 'discardProgress' && d.player === p);
  if (pending) takeDecision(s, p, 'discardProgress');
  else {
    requireTurn(s, p);
    if (player.progress.length <= PROGRESS_HAND_LIMIT) fail('You are within the progress card limit.');
  }
  player.progress.splice(idx, 1);
  s.decks[PROGRESS[card].track].push(card);
  log(s, p, `${player.name} discards a progress card.`);
}

function playProgress(s: GameState, p: number, card: ProgressId, params: ProgressParams): void {
  requireTurn(s, p);
  const def = PROGRESS[card];
  if (!def) fail('Unknown card.');
  const player = s.players[p];
  const idx = player.progress.indexOf(card);
  if (idx < 0) fail('You do not hold that card.');
  if (def.beforeRoll) {
    if (s.rolled) fail(`${def.name} must be played before rolling.`);
  } else requireRolled(s);

  player.progress.splice(idx, 1);
  s.decks[def.track].push(card);
  log(s, p, `${player.name} plays ${def.name}.`);
  s.stats.progressPlayed[p]++;
  const others = opponentsInOrder(s, p);

  switch (card) {
    case 'augury': {
      const { red, yellow } = params;
      if (![red, yellow].every((d) => Number.isInteger(d) && d! >= 1 && d! <= 6)) fail('Choose two dice values from 1 to 6.');
      s.flags.augury = { red: red!, yellow: yellow! };
      return;
    }
    case 'scaffolding':
      if (s.flags.scaffolding) fail('Scaffolding is already in place this turn.');
      s.flags.scaffolding = true;
      return;
    case 'masterMason':
      placeWall(s, p, requireVertex(s, params.vertex), {});
      return;
    case 'surveyor': {
      const a = requireHex(s, params.hexA);
      const b = requireHex(s, params.hexB);
      const ha = s.board.hexes[a];
      const hb = s.board.hexes[b];
      const fixed = [2, 6, 8, 12];
      if (a === b || ha.token === null || hb.token === null) fail('Pick two different numbered tiles.');
      if (fixed.includes(ha.token) || fixed.includes(hb.token)) fail('Tokens 2, 6, 8 and 12 cannot be moved.');
      [ha.token, hb.token] = [hb.token, ha.token];
      log(s, p, `${player.name} swaps the ${hb.token} and ${ha.token} tokens.`);
      return;
    }
    case 'canals':
    case 'deepShafts': {
      const terrain = card === 'canals' ? 'fields' : 'mountains';
      const res: Resource = card === 'canals' ? 'grain' : 'ore';
      const n = playerHexes(s, p).filter((h) => s.board.hexes[h].terrain === terrain).length;
      player.hand[res] += 2 * n;
      log(s, p, `${player.name} gains ${2 * n} ${CARD_NAMES[res]}.`);
      return;
    }
    case 'physician':
      upgradeToCity(s, p, requireVertex(s, params.vertex), PHYSICIAN_COST);
      return;
    case 'roadCorps':
      s.flags.freeRoads += 2;
      return;
    case 'armory': {
      const ks = params.knights;
      if (!Array.isArray(ks) || ks.length < 1 || ks.length > 2 || new Set(ks).size !== ks.length) fail('Pick one or two of your knights.');
      for (const v of ks) {
        const k = ownKnight(s, p, requireVertex(s, v));
        checkPromotion(s, p, k);
        k.level = (k.level + 1) as 2 | 3;
        k.promotedOnTurn = s.turn;
      }
      log(s, p, `${player.name} promotes ${ks.length} knight${ks.length > 1 ? 's' : ''}.`);
      return;
    }
    case 'caravan': {
      const h = requireHex(s, params.hex);
      if (s.board.hexes[h].terrain === 'desert') fail('The caravan needs a producing tile.');
      if (!playerHexes(s, p).includes(h)) fail('The caravan must go next to one of your buildings.');
      const prev = s.caravan?.owner;
      s.caravan = { hex: h, owner: p };
      log(s, p, `${player.name} ${prev !== undefined && prev !== p ? `takes the caravan from ${s.players[prev].name}` : 'places the caravan'} (+1 VP).`);
      return;
    }
    case 'harborLevy': {
      const items: Decision[] = [];
      for (const o of others) {
        if (COMMODITIES.every((c) => s.players[o].hand[c] === 0)) continue;
        items.push({ kind: 'harborLevyOffer', group: newGroup(s), player: p, target: o });
        items.push({ kind: 'harborLevyReturn', group: newGroup(s), player: o, to: p });
      }
      if (!items.length) log(s, p, 'Nobody has any commodities.');
      pushFront(s, items);
      return;
    }
    case 'monsoonWinds':
      s.flags.monsoon = requireCardType(params.card);
      log(s, p, `${player.name} may trade ${CARD_NAMES[s.flags.monsoon]} 2:1 this turn.`);
      return;
    case 'tribute': {
      const t = params.target;
      if (typeof t !== 'number' || !others.includes(t)) fail('Pick an opponent.');
      if (vp(s, t) <= vp(s, p)) fail('Tribute only works on a player with more victory points.');
      const size = handSize(s.players[t].hand);
      if (size === 0) fail('They have no cards.');
      pushFront(s, [{ kind: 'tributeTake', group: newGroup(s), player: p, target: t, count: Math.min(2, size) }]);
      return;
    }
    case 'marketCorner': {
      const r = requireResource(params.resource);
      let total = 0;
      for (const o of others) {
        const n = Math.min(2, s.players[o].hand[r]);
        if (n) transfer(s, o, p, { [r]: n });
        total += n;
      }
      log(s, p, `${player.name} corners the market and collects ${total} ${CARD_NAMES[r]}.`);
      return;
    }
    case 'guildCharter': {
      const c = params.commodity;
      if (!c || !COMMODITIES.includes(c)) fail('Name a commodity.');
      let total = 0;
      for (const o of others) {
        if (s.players[o].hand[c] > 0) {
          transfer(s, o, p, { [c]: 1 });
          total++;
        }
      }
      log(s, p, `${player.name} collects ${total} ${CARD_NAMES[c]}.`);
      return;
    }
    case 'highPriest': {
      if (!s.robberActive) fail('The robber sleeps until the barbarians first land.');
      const h = requireHex(s, params.hex);
      if (h === s.robber) fail('The robber must move to a different tile.');
      s.robber = h;
      for (const v of robberVictims(s, p, h)) stealRandom(s, p, v);
      return;
    }
    case 'turncoat': {
      const t = params.target;
      if (typeof t !== 'number' || !others.includes(t)) fail('Pick an opponent.');
      if (ownedKnights(s, t).length === 0) fail('They have no knights.');
      pushFront(s, [{ kind: 'turncoatRemove', group: newGroup(s), player: t, to: p }]);
      return;
    }
    case 'envoy': {
      const e = requireEdge(s, params.edge);
      if (s.roads[e] === undefined) fail('Pick a road.');
      if (!isOpenRoad(s, e)) fail('Only a road with an open end can be removed.');
      const owner = s.roads[e];
      delete s.roads[e];
      log(s, p, `${player.name}'s envoy removes ${owner === p ? 'one of their own roads' : `a road of ${s.players[owner].name}`}.`);
      if (owner === p) pushFront(s, [{ kind: 'envoyRebuild', group: newGroup(s), player: p }]);
      return;
    }
    case 'plot': {
      const v = requireVertex(s, params.vertex);
      const k = s.knights[v];
      if (!k || k.owner === p) fail('Pick an opponent\'s knight.');
      if (!hasRoadAt(s, p, v)) fail('One of your roads must reach that knight.');
      delete s.knights[v];
      log(s, p, `${player.name}'s plot displaces ${s.players[k.owner].name}'s knight.`);
      displace(s, k, v);
      return;
    }
    case 'unrest': {
      const mine = vp(s, p);
      const group = newGroup(s);
      const items: Decision[] = [];
      for (const o of others) {
        const count = Math.floor(handSize(s.players[o].hand) / 2);
        if (vp(s, o) >= mine && count > 0) items.push({ kind: 'discard', group, player: o, count, reason: 'unrest' });
      }
      pushFront(s, items);
      return;
    }
    case 'informant': {
      const t = params.target;
      if (typeof t !== 'number' || !others.includes(t)) fail('Pick an opponent.');
      if (s.players[t].progress.length === 0) fail('They hold no progress cards.');
      pushFront(s, [{ kind: 'informantTake', group: newGroup(s), player: p, target: t }]);
      return;
    }
    case 'warHorn':
      for (const k of Object.values(s.knights)) {
        if (k.owner === p && !k.active) {
          k.active = true;
          k.activatedOnTurn = s.turn;
        }
      }
      return;
    case 'dynasticMarriage': {
      const mine = vp(s, p);
      const group = newGroup(s);
      const items: Decision[] = [];
      for (const o of others) {
        const size = handSize(s.players[o].hand);
        if (vp(s, o) > mine && size > 0) items.push({ kind: 'giveCards', group, player: o, to: p, count: Math.min(2, size) });
      }
      pushFront(s, items);
      return;
    }
    case 'writing':
    case 'lawCode':
      fail('Victory point cards are revealed when drawn.');
  }
}

function harborLevyOffer(s: GameState, p: number, resource: Resource | null): void {
  const d = activeDecisions(s).find((x) => x.kind === 'harborLevyOffer' && x.player === p) as Extract<Decision, { kind: 'harborLevyOffer' }> | undefined;
  if (!d) fail('Nothing to offer right now.');
  const hasAny = RESOURCES.some((r) => s.players[p].hand[r] > 0);
  if (resource === null) {
    if (hasAny) fail('Offer one of your resources.');
    takeDecision(s, p, 'harborLevyOffer');
    // drop the matching return
    const ret = s.queue.findIndex((q) => q.kind === 'harborLevyReturn' && (q as Decision).player === d.target);
    if (ret >= 0) s.queue.splice(ret, 1);
    return;
  }
  const r = requireResource(resource);
  if (s.players[p].hand[r] < 1) fail('You do not have that resource.');
  takeDecision(s, p, 'harborLevyOffer');
  transfer(s, p, d.target, { [r]: 1 });
  log(s, p, `${s.players[p].name} gives 1 ${CARD_NAMES[r]} to ${s.players[d.target].name}.`);
  if (COMMODITIES.every((c) => s.players[d.target].hand[c] === 0)) {
    const ret = s.queue.findIndex((q) => q.kind === 'harborLevyReturn' && (q as Decision).player === d.target);
    if (ret >= 0) s.queue.splice(ret, 1);
  }
}

// Re-exported for tests.
export const _internal = { random };
