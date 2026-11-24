import type { CardType, CivId, Commodity, GameOptions, Hand, ProgressId, RaiderTheme, Resource, Terrain, Track } from './types';

export const RESOURCES: Resource[] = ['brick', 'lumber', 'wool', 'grain', 'ore'];
export const COMMODITIES: Commodity[] = ['paper', 'cloth', 'coin'];
export const CARD_TYPES: CardType[] = [...RESOURCES, ...COMMODITIES];
export const TRACKS: Track[] = ['science', 'trade', 'politics'];

export const TRACK_COMMODITY: Record<Track, Commodity> = {
  science: 'paper',
  trade: 'cloth',
  politics: 'coin',
};

export const TERRAIN_RESOURCE: Record<Terrain, Resource | null> = {
  hills: 'brick',
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  mountains: 'ore',
  desert: null,
};

/** What a city adds on top of its 1 resource. Hills and fields give a second resource instead. */
export const CITY_COMMODITY: Partial<Record<Terrain, Commodity>> = {
  forest: 'paper',
  pasture: 'cloth',
  mountains: 'coin',
};

export const WIN_VP = 13;
export const DEFAULT_OPTIONS: GameOptions = { winVp: WIN_VP, tokens: 'spiral' };

export const RAIDERS: Record<RaiderTheme, { name: string; byShip: boolean; skipIf?: CivId }> = {
  vikings: { name: 'Viking raiders', byShip: true, skipIf: 'norse' },
  pirates: { name: 'Pirates', byShip: true },
  conquistadors: { name: 'Conquistadors', byShip: true },
  huns: { name: 'The Hunnic horde', byShip: false },
  seaPeoples: { name: 'The Sea Peoples', byShip: true },
};
export const PROGRESS_HAND_LIMIT = 4;
export const BARBARIAN_STEPS = 7;

export const LIMITS = {
  roads: 15,
  settlements: 5,
  cities: 4,
  walls: 3,
  knightsPerLevel: 2,
};

export const COSTS: Record<'road' | 'settlement' | 'city' | 'wall' | 'knight' | 'activate' | 'promote', Partial<Hand>> = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  wall: { brick: 2 },
  knight: { wool: 1, ore: 1 },
  activate: { grain: 1 },
  promote: { wool: 1, ore: 1 },
};

export const PHYSICIAN_COST: Partial<Hand> = { ore: 2, grain: 1 };

export interface CivDef {
  id: CivId;
  name: string;
  main: string;
  accent: string;
  /** Outline/ink color that reads on the main color. */
  ink: string;
  motif: string;
}

export const CIVS: Record<CivId, CivDef> = {
  rome: { id: 'rome', name: 'Rome', main: '#B3202A', accent: '#E3B23C', ink: '#3a0a0d', motif: 'Columned temple' },
  egypt: { id: 'egypt', name: 'Egypt', main: '#D99A1E', accent: '#1F5FAD', ink: '#3d2a05', motif: 'Obelisk and pylon' },
  han: { id: 'han', name: 'Han China', main: '#2E8B57', accent: '#C4361C', ink: '#0d2b1a', motif: 'Tiered curved roofs' },
  maya: { id: 'maya', name: 'Maya', main: '#3AA0B5', accent: '#6FB35A', ink: '#0c2c33', motif: 'Stepped pyramid' },
  mali: { id: 'mali', name: 'Mali', main: '#C8612C', accent: '#E8C15A', ink: '#3a1a08', motif: 'Mud tower with beams' },
  norse: { id: 'norse', name: 'Norse', main: '#EDE6D6', accent: '#4E555E', ink: '#2a2d31', motif: 'Longhouse' },
  japan: { id: 'japan', name: 'Japan', main: '#26326B', accent: '#E0482F', ink: '#0b0f24', motif: 'Pagoda' },
  persia: { id: 'persia', name: 'Persia', main: '#6B2D8C', accent: '#D9B44A', ink: '#1f0b29', motif: 'Columned audience hall' },
};

export const CIV_IDS = Object.keys(CIVS) as CivId[];

export interface ProgressDef {
  id: ProgressId;
  name: string;
  track: Track;
  count: number;
  text: string;
  /** Revealed and scored immediately on draw. */
  vp?: boolean;
  /** Playable before the roll (only Augury). */
  beforeRoll?: boolean;
}

export const PROGRESS: Record<ProgressId, ProgressDef> = {
  augury: { id: 'augury', name: 'Augury', track: 'science', count: 2, beforeRoll: true, text: 'Before rolling, choose the results of both number dice. The event die is still rolled.' },
  scaffolding: { id: 'scaffolding', name: 'Scaffolding', track: 'science', count: 2, text: 'Your next city improvement this turn costs 1 commodity less.' },
  masterMason: { id: 'masterMason', name: 'Master Mason', track: 'science', count: 1, text: 'Build a city wall for free.' },
  surveyor: { id: 'surveyor', name: 'Surveyor', track: 'science', count: 2, text: 'Swap two number tokens. Tokens 2, 6, 8 and 12 cannot be moved.' },
  canals: { id: 'canals', name: 'Canals', track: 'science', count: 2, text: 'Take 2 grain for each fields tile touching your settlements or cities.' },
  physician: { id: 'physician', name: 'Physician', track: 'science', count: 2, text: 'Upgrade one settlement to a city for just 2 ore and 1 grain.' },
  deepShafts: { id: 'deepShafts', name: 'Deep Shafts', track: 'science', count: 2, text: 'Take 2 ore for each mountains tile touching your settlements or cities.' },
  writing: { id: 'writing', name: 'Writing', track: 'science', count: 1, vp: true, text: '1 victory point. Revealed as soon as it is drawn.' },
  roadCorps: { id: 'roadCorps', name: 'Road Corps', track: 'science', count: 2, text: 'Build 2 roads for free.' },
  armory: { id: 'armory', name: 'Armory', track: 'science', count: 2, text: 'Promote up to 2 of your knights one level each for free (level 3 still needs a Citadel).' },

  caravan: { id: 'caravan', name: 'Caravan', track: 'trade', count: 6, text: 'Place the caravan on a tile next to one of your buildings. While you hold it, trade that tile\'s resource 2:1 with the bank, and it is worth 1 VP.' },
  harborLevy: { id: 'harborLevy', name: 'Harbor Levy', track: 'trade', count: 2, text: 'Offer each opponent 1 resource from your hand. Each must give you a commodity of their choice in return, if they have one.' },
  monsoonWinds: { id: 'monsoonWinds', name: 'Monsoon Winds', track: 'trade', count: 2, text: 'Choose one resource or commodity. For the rest of this turn, trade it 2:1 with the bank.' },
  tribute: { id: 'tribute', name: 'Tribute', track: 'trade', count: 2, text: 'Choose a player with more victory points than you. Look at their hand and take 2 cards.' },
  marketCorner: { id: 'marketCorner', name: 'Market Corner', track: 'trade', count: 4, text: 'Name a resource. Each opponent gives you up to 2 of it.' },
  guildCharter: { id: 'guildCharter', name: 'Guild Charter', track: 'trade', count: 2, text: 'Name a commodity. Each opponent gives you 1 of it, if they have one.' },

  highPriest: { id: 'highPriest', name: 'High Priest', track: 'politics', count: 2, text: 'Move the robber. Take 1 random card from each player with a building on its new tile.' },
  lawCode: { id: 'lawCode', name: 'Law Code', track: 'politics', count: 1, vp: true, text: '1 victory point. Revealed as soon as it is drawn.' },
  turncoat: { id: 'turncoat', name: 'Turncoat', track: 'politics', count: 2, text: 'An opponent removes one of their knights (their choice). You may place one of your own of the same level for free.' },
  envoy: { id: 'envoy', name: 'Envoy', track: 'politics', count: 2, text: 'Remove any road with an open end. If it was yours, you may rebuild it elsewhere for free.' },
  plot: { id: 'plot', name: 'Plot', track: 'politics', count: 2, text: 'Displace an opponent\'s knight standing on an intersection that one of your roads reaches.' },
  unrest: { id: 'unrest', name: 'Unrest', track: 'politics', count: 2, text: 'Every other player with at least as many victory points as you discards half their cards.' },
  informant: { id: 'informant', name: 'Informant', track: 'politics', count: 3, text: 'Look at an opponent\'s progress cards and take one.' },
  warHorn: { id: 'warHorn', name: 'War Horn', track: 'politics', count: 2, text: 'Activate all of your knights for free.' },
  dynasticMarriage: { id: 'dynasticMarriage', name: 'Dynastic Marriage', track: 'politics', count: 2, text: 'Each player with more victory points than you gives you 2 cards of their choice.' },
};

export const TRACK_INFO: Record<Track, { name: string; color: string; commodity: Commodity; ability: string; abilityText: string; metropolis: string }> = {
  science: { name: 'Science', color: '#4c9a4a', commodity: 'paper', ability: 'Granaries', abilityText: 'When a non-7 roll gives you nothing, take any 1 resource.', metropolis: 'Metropolis of Learning' },
  trade: { name: 'Trade', color: '#d6a619', commodity: 'cloth', ability: 'Counting House', abilityText: 'Trade 2 of one commodity for any 1 card with the bank.', metropolis: 'Metropolis of Commerce' },
  politics: { name: 'Politics', color: '#3c6fb8', commodity: 'coin', ability: 'Citadel', abilityText: 'Your knights may be promoted to level 3.', metropolis: 'Metropolis of Power' },
};

export const CARD_NAMES: Record<CardType, string> = {
  brick: 'Brick',
  lumber: 'Lumber',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
  paper: 'Paper',
  cloth: 'Cloth',
  coin: 'Coin',
};

export const KNIGHT_NAMES: Record<1 | 2 | 3, string> = { 1: 'Levy', 2: 'Veteran', 3: 'Champion' };

/** Number-token sequence laid in a counterclockwise spiral, skipping the desert. */
export const TOKEN_SEQUENCE = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

export const TERRAIN_COUNTS: Record<Terrain, number> = {
  hills: 3,
  forest: 4,
  pasture: 4,
  fields: 4,
  mountains: 3,
  desert: 1,
};

export const HARBOR_KINDS = ['any', 'any', 'any', 'any', 'brick', 'lumber', 'wool', 'grain', 'ore'] as const;

export function emptyHand(): Hand {
  return { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0, paper: 0, cloth: 0, coin: 0 };
}
