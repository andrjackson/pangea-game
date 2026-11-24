import { randomBytes, randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CIVS,
  DEFAULT_OPTIONS,
  RuleError,
  applyAction,
  createGame,
  upgradeState,
  validateOptions,
  type Action,
  type CivId,
  type GameOptions,
  type GameState,
} from '@pangea/engine';

export interface Seat {
  token: string;
  name: string;
  civ: CivId | null;
}

export interface Room {
  code: string;
  host: string;
  seats: Seat[];
  game: GameState | null;
  options: GameOptions;
  /** game player index → seat token (set at start). */
  order: string[];
  createdAt: number;
  updatedAt: number;
}

export class LobbyError extends Error {}

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_NAME = 20;

export class RoomStore {
  private rooms = new Map<string, Room>();

  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const room = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Room;
        room.options ??= { ...DEFAULT_OPTIONS };
        if (room.game) upgradeState(room.game);
        this.rooms.set(room.code, room);
      } catch (err) {
        console.warn(`Skipping unreadable save ${f}:`, err);
      }
    }
  }

  get count(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  private save(room: Room): void {
    room.updatedAt = Date.now();
    const path = join(this.dir, `${room.code}.json`);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(room));
    renameSync(tmp, path);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  create(name: string): { room: Room; token: string } {
    const token = randomBytes(16).toString('hex');
    const room: Room = {
      code: this.newCode(),
      host: token,
      seats: [{ token, name: cleanName(name), civ: null }],
      game: null,
      options: { ...DEFAULT_OPTIONS },
      order: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.rooms.set(room.code, room);
    this.save(room);
    return { room, token };
  }

  join(code: string, name: string): { room: Room; token: string } {
    const room = this.require(code);
    if (room.game) throw new LobbyError('That game has already started.');
    if (room.seats.length >= 4) throw new LobbyError('That game is full (4 players).');
    const clean = cleanName(name);
    if (room.seats.some((s) => s.name.toLowerCase() === clean.toLowerCase())) throw new LobbyError('Someone at the table already has that name.');
    const token = randomBytes(16).toString('hex');
    room.seats.push({ token, name: clean, civ: null });
    this.save(room);
    return { room, token };
  }

  leave(code: string, token: string): Room {
    const room = this.require(code);
    if (room.game) throw new LobbyError('You cannot leave a game in progress.');
    room.seats = room.seats.filter((s) => s.token !== token);
    if (room.host === token && room.seats.length) room.host = room.seats[0].token;
    this.save(room);
    return room;
  }

  pickCiv(code: string, token: string, civ: CivId): Room {
    const room = this.require(code);
    if (room.game) throw new LobbyError('Civilizations are locked once the game starts.');
    if (!CIVS[civ]) throw new LobbyError('Unknown civilization.');
    const seat = this.seat(room, token);
    if (room.seats.some((s) => s !== seat && s.civ === civ)) throw new LobbyError(`${CIVS[civ].name} is already taken.`);
    seat.civ = civ;
    this.save(room);
    return room;
  }

  setOptions(code: string, token: string, opts: Partial<GameOptions>): Room {
    const room = this.require(code);
    if (room.game) throw new LobbyError('Options are locked once the game starts.');
    if (room.host !== token) throw new LobbyError('Only the host can change the options.');
    try {
      room.options = validateOptions({ ...room.options, ...opts });
    } catch (err) {
      throw new LobbyError((err as Error).message);
    }
    this.save(room);
    return room;
  }

  /** Starts a fresh game with the same seats, civs and options once the current one has ended. */
  rematch(code: string, token: string): Room {
    const room = this.require(code);
    if (!room.game || room.game.phase !== 'ended') throw new LobbyError('The current game has not ended.');
    this.seat(room, token);
    this.begin(room);
    this.save(room);
    return room;
  }

  private begin(room: Room): void {
    const game = createGame(
      room.seats.map((s) => ({ name: s.name, civ: s.civ! })),
      randomInt(1, 2 ** 31 - 1),
      room.options,
    );
    room.game = game;
    room.order = game.players.map((p) => room.seats.find((s) => s.civ === p.civ)!.token);
  }

  start(code: string, token: string): Room {
    const room = this.require(code);
    if (room.game) throw new LobbyError('Already started.');
    if (room.host !== token) throw new LobbyError('Only the host can start the game.');
    if (room.seats.length < 3) throw new LobbyError('Pangea needs at least 3 players.');
    if (room.seats.some((s) => !s.civ)) throw new LobbyError('Everyone needs to pick a civilization.');
    this.begin(room);
    this.save(room);
    return room;
  }

  act(code: string, token: string, action: Action): Room {
    const room = this.require(code);
    if (!room.game) throw new LobbyError('The game has not started.');
    const player = room.order.indexOf(token);
    if (player < 0) throw new LobbyError('You are not seated in this game.');
    room.game = applyAction(room.game, player, action);
    this.save(room);
    return room;
  }

  playerIndex(room: Room, token: string): number {
    return room.order.indexOf(token);
  }

  isSeated(room: Room, token: string): boolean {
    return room.seats.some((s) => s.token === token);
  }

  private require(code: string): Room {
    const room = this.get(String(code ?? ''));
    if (!room) throw new LobbyError('No game with that code.');
    return room;
  }

  private seat(room: Room, token: string): Seat {
    const seat = room.seats.find((s) => s.token === token);
    if (!seat) throw new LobbyError('You are not seated in this game.');
    return seat;
  }
}

function cleanName(name: unknown): string {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  if (!clean) throw new LobbyError('Enter a name.');
  return clean;
}

export function errorMessage(err: unknown): string {
  if (err instanceof RuleError || err instanceof LobbyError) return err.message;
  console.error(err);
  return 'Something went wrong on the server.';
}
