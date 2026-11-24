export type Resource = 'brick' | 'lumber' | 'wool' | 'grain' | 'ore';
export type Commodity = 'paper' | 'cloth' | 'coin';
export type CardType = Resource | Commodity;
export type Hand = Record<CardType, number>;
export type Track = 'science' | 'trade' | 'politics';
export type Terrain = 'hills' | 'forest' | 'pasture' | 'fields' | 'mountains' | 'desert';
export type HarborKind = 'any' | Resource;
export type EventFace = 'ship' | Track;

export type RaiderTheme = 'vikings' | 'pirates' | 'conquistadors' | 'huns' | 'seaPeoples';

export interface GameOptions {
  /** Victory points needed to win on your own turn. */
  winVp: number;
  /** 'spiral': rulebook spiral. 'balanced': random tokens with no 6s or 8s next to each other. */
  tokens: 'spiral' | 'balanced';
}

export interface Stats {
  produced: number[];
  robbed: number[];
  lostToRobber: number[];
  progressPlayed: number[];
  trades: number[];
  discarded: number[];
}

/** What the most recent production roll paid out, per tile and player (public, like at the table). */
export interface ProductionRecord {
  seq: number;
  sum: number;
  items: { hex: number; player: number; cards: Partial<Hand> }[];
}

export type CivId = 'rome' | 'egypt' | 'han' | 'maya' | 'mali' | 'norse' | 'japan' | 'persia';

export type ProgressId =
  // science
  | 'augury' | 'scaffolding' | 'masterMason' | 'surveyor' | 'canals'
  | 'physician' | 'deepShafts' | 'writing' | 'roadCorps' | 'armory'
  // trade
  | 'caravan' | 'harborLevy' | 'monsoonWinds' | 'tribute' | 'marketCorner' | 'guildCharter'
  // politics
  | 'highPriest' | 'lawCode' | 'turncoat' | 'envoy' | 'plot' | 'unrest'
  | 'informant' | 'warHorn' | 'dynasticMarriage';

export interface HexTile {
  id: number;
  q: number;
  r: number;
  x: number;
  y: number;
  terrain: Terrain;
  token: number | null;
}

export interface Vertex {
  id: number;
  x: number;
  y: number;
  hexes: number[];
  edges: number[];
  adj: number[];
  harbor: HarborKind | null;
}

export interface Edge {
  id: number;
  a: number;
  b: number;
  hexes: number[];
}

export interface Harbor {
  kind: HarborKind;
  edge: number;
  /** Marker position (board units), out to sea from the edge. */
  x: number;
  y: number;
}

export interface Board {
  hexes: HexTile[];
  vertices: Vertex[];
  edges: Edge[];
  harbors: Harbor[];
}

export interface Building {
  owner: number;
  kind: 'settlement' | 'city';
  wall: boolean;
  metropolis: Track | null;
}

export interface Knight {
  owner: number;
  level: 1 | 2 | 3;
  active: boolean;
  activatedOnTurn: number;
  actedOnTurn: number;
  promotedOnTurn: number;
}

export interface Player {
  id: number;
  name: string;
  civ: CivId;
  hand: Hand;
  progress: ProgressId[];
  improvements: Record<Track, number>;
  /** Barbarian defense victory points. */
  shields: number;
  /** Revealed VP progress cards (writing, lawCode). */
  vpCards: ProgressId[];
}

export interface TradeOffer {
  id: number;
  from: number;
  /** null = open to every other player (only the current player posts these). */
  to: number | null;
  give: Partial<Hand>;
  get: Partial<Hand>;
  accepted: number[];
  declined: number[];
}

export interface LogEntry {
  turn: number;
  player: number | null;
  text: string;
  /** When set, only these players see the entry. */
  only?: number[];
}

/** Decisions the game is waiting on. Consecutive entries sharing a `group` are answered in any order. */
export type Decision =
  | { kind: 'discard'; group: number; player: number; count: number; reason: 'seven' | 'unrest' }
  | { kind: 'moveRobber'; group: number; player: number; source: 'seven' | 'knight' }
  | { kind: 'steal'; group: number; player: number; candidates: number[] }
  | { kind: 'pickResource'; group: number; player: number }
  | { kind: 'loseCity'; group: number; player: number }
  | { kind: 'pickTrack'; group: number; player: number }
  | { kind: 'discardProgress'; group: number; player: number }
  | { kind: 'relocateKnight'; group: number; player: number; from: number; knight: Knight; options: number[] }
  | { kind: 'giveCards'; group: number; player: number; to: number; count: number }
  | { kind: 'harborLevyOffer'; group: number; player: number; target: number }
  | { kind: 'harborLevyReturn'; group: number; player: number; to: number }
  | { kind: 'tributeTake'; group: number; player: number; target: number; count: number }
  | { kind: 'informantTake'; group: number; player: number; target: number }
  | { kind: 'turncoatRemove'; group: number; player: number; to: number }
  | { kind: 'turncoatPlace'; group: number; player: number; level: 1 | 2 | 3; active: boolean }
  | { kind: 'envoyRebuild'; group: number; player: number };

export type AutoStep =
  | { kind: 'auto:eventDie' }
  | { kind: 'auto:barbarianAttack' }
  | { kind: 'auto:gateDraw'; track: Track }
  | { kind: 'auto:production' }
  | { kind: 'auto:sevenRobber' };

export type QueueItem = Decision | AutoStep;

export interface Dice {
  red: number;
  yellow: number;
  event: EventFace;
}

export interface TurnFlags {
  augury: { red: number; yellow: number } | null;
  scaffolding: boolean;
  freeRoads: number;
  monsoon: CardType | null;
}

export interface GameState {
  version: 1;
  options: GameOptions;
  stats: Stats;
  raiders: RaiderTheme;
  production: ProductionRecord | null;
  rng: number;
  board: Board;
  players: Player[];
  buildings: Record<number, Building>;
  roads: Record<number, number>;
  knights: Record<number, Knight>;
  robber: number;
  robberActive: boolean;
  caravan: { hex: number; owner: number } | null;
  barbarian: { position: number; attacks: number };
  metropolis: Record<Track, number | null>;
  decks: Record<Track, ProgressId[]>;
  longestRoad: number | null;
  phase: 'setup' | 'play' | 'ended';
  setup: { index: number; awaiting: 'building' | 'road'; lastVertex: number | null };
  current: number;
  turn: number;
  rolled: boolean;
  dice: Dice | null;
  flags: TurnFlags;
  queue: QueueItem[];
  trades: TradeOffer[];
  log: LogEntry[];
  winner: number | null;
  undo: string[];
  nextId: number;
}

export type Action =
  // setup
  | { type: 'setupBuilding'; vertex: number }
  | { type: 'setupRoad'; edge: number }
  // turn
  | { type: 'roll' }
  | { type: 'endTurn' }
  | { type: 'undo' }
  | { type: 'buildRoad'; edge: number }
  | { type: 'buildSettlement'; vertex: number }
  | { type: 'buildCity'; vertex: number }
  | { type: 'buildWall'; vertex: number }
  | { type: 'buildKnight'; vertex: number }
  | { type: 'activateKnight'; vertex: number }
  | { type: 'promoteKnight'; vertex: number }
  | { type: 'moveKnight'; from: number; to: number }
  | { type: 'chaseRobber'; vertex: number }
  | { type: 'improve'; track: Track; vertex?: number }
  | { type: 'bankTrade'; give: CardType; get: CardType }
  | { type: 'offerTrade'; give: Partial<Hand>; get: Partial<Hand> }
  | { type: 'respondTrade'; offer: number; accept: boolean }
  | { type: 'confirmTrade'; offer: number; with: number }
  | { type: 'cancelTrade'; offer: number }
  | { type: 'playProgress'; card: ProgressId; params?: ProgressParams }
  | { type: 'discardProgress'; card: ProgressId }
  // decisions
  | { type: 'discard'; cards: Partial<Hand> }
  | { type: 'moveRobber'; hex: number }
  | { type: 'steal'; victim: number }
  | { type: 'pickResource'; resource: Resource }
  | { type: 'loseCity'; vertex: number }
  | { type: 'pickTrack'; track: Track }
  | { type: 'relocateKnight'; vertex: number }
  | { type: 'giveCards'; cards: Partial<Hand> }
  | { type: 'harborLevyOffer'; resource: Resource | null }
  | { type: 'harborLevyReturn'; commodity: Commodity }
  | { type: 'tributeTake'; cards: Partial<Hand> }
  | { type: 'informantTake'; card: ProgressId }
  | { type: 'turncoatRemove'; vertex: number }
  | { type: 'turncoatPlace'; vertex: number | null }
  | { type: 'envoyRebuild'; edge: number | null };

export interface ProgressParams {
  red?: number;
  yellow?: number;
  vertex?: number;
  hexA?: number;
  hexB?: number;
  hex?: number;
  knights?: number[];
  card?: CardType;
  resource?: Resource;
  commodity?: Commodity;
  target?: number;
  edge?: number;
}

export interface SetupPlayer {
  name: string;
  civ: CivId;
}
