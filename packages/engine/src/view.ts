import { TRACKS } from './data';
import { activeDecisions } from './engine';
import { handSize, longestRoadLength, victoryPoints } from './helpers';
import type { Decision, GameState, Hand, Player, ProgressId, Track } from './types';

export interface ViewPlayer extends Omit<Player, 'hand' | 'progress'> {
  /** Your own hand; null for opponents. */
  hand: Hand | null;
  handCount: number;
  progress: ProgressId[] | null;
  progressCount: number;
  vp: number;
  roadLength: number;
}

export interface PlayerView extends Omit<GameState, 'rng' | 'undo' | 'decks' | 'players'> {
  me: number;
  players: ViewPlayer[];
  decks: Record<Track, number>;
  canUndo: boolean;
  /** Decisions currently being waited on (everyone sees who; details only matter to the decider). */
  waitingOn: Decision[];
  /** Extra hidden information this player is entitled to see right now. */
  reveal: { hand?: { player: number; hand: Hand }; progress?: { player: number; cards: ProgressId[] } };
}

export function viewFor(s: GameState, me: number): PlayerView {
  const { rng: _rng, undo, decks, players, log, ...rest } = s;
  const waitingOn = activeDecisions(s);
  const reveal: PlayerView['reveal'] = {};
  for (const d of waitingOn) {
    if (d.player !== me) continue;
    if (d.kind === 'tributeTake') reveal.hand = { player: d.target, hand: { ...s.players[d.target].hand } };
    if (d.kind === 'informantTake') reveal.progress = { player: d.target, cards: [...s.players[d.target].progress] };
  }
  const deckCounts = {} as Record<Track, number>;
  for (const t of TRACKS) deckCounts[t] = decks[t].length;
  return structuredClone({
    ...rest,
    me,
    players: players.map((p) => ({
      ...p,
      hand: p.id === me ? p.hand : null,
      handCount: handSize(p.hand),
      progress: p.id === me ? p.progress : null,
      progressCount: p.progress.length,
      vp: victoryPoints(s, p.id),
      roadLength: longestRoadLength(s, p.id),
    })),
    decks: deckCounts,
    canUndo: undo.length > 0 && s.current === me,
    log: log.filter((e) => !e.only || e.only.includes(me)),
    waitingOn,
    reveal,
  });
}
