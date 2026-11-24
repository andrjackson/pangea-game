import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import { viewFor, type Action, type CivId, type GameOptions } from '@pangea/engine';
import { RoomStore, errorMessage, type Room } from './rooms';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.PANGEA_DATA ?? join(root, 'data', 'games');
const REPORTS_DIR = process.env.PANGEA_REPORTS ?? join(DATA_DIR, '..', 'reports');
const CLIENT_DIST = join(root, 'packages', 'client', 'dist');

const store = new RoomStore(DATA_DIR);
const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: true } });

app.get('/health', (_req, res) => res.json({ ok: true, rooms: store.count }));

// Test hook, off unless PANGEA_DEBUG=1: POST {"path.to.field": value, ...} to overwrite parts of a game.
if (process.env.PANGEA_DEBUG === '1') {
  console.log('PANGEA_DEBUG is on: /debug/:code can rewrite games. Never enable this for real play.');
  app.get('/debug/:code', (req, res) => {
    const room = store.get(req.params.code);
    if (!room?.game) return res.status(404).json({ ok: false });
    res.json(room.game);
  });
  app.post('/debug/:code', express.json(), (req, res) => {
    const room = store.get(req.params.code);
    if (!room?.game) return res.status(404).json({ ok: false });
    for (const [path, value] of Object.entries(req.body as Record<string, unknown>)) {
      const keys = path.split('.');
      let obj = room.game as unknown as Record<string, unknown>;
      for (const k of keys.slice(0, -1)) obj = obj[k] as Record<string, unknown>;
      obj[keys[keys.length - 1]] = value;
    }
    broadcast(room);
    res.json({ ok: true });
  });
}
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res.send('Pangea server is running, but the client is not built yet. Run "npm run build" in the project folder.'),
  );
}

interface Session {
  code: string;
  token: string;
}

const sessions = new Map<string, Session>(); // socket.id → session

type Ack = (res: { ok: true; [k: string]: unknown } | { ok: false; error: string }) => void;

function safeAck(ack: unknown): Ack {
  return typeof ack === 'function' ? (ack as Ack) : () => undefined;
}

function roomPayload(room: Room, token: string) {
  const me = room.game ? room.order.indexOf(token) : -1;
  return {
    code: room.code,
    started: !!room.game,
    isHost: room.host === token,
    options: room.options,
    seats: room.seats.map((s) => ({
      name: s.name,
      civ: s.civ,
      isHost: s.token === room.host,
      isYou: s.token === token,
      connected: [...sessions.values()].some((x) => x.code === room.code && x.token === s.token),
    })),
    view: room.game && me >= 0 ? viewFor(room.game, me) : null,
  };
}

function broadcast(room: Room): void {
  for (const [id, session] of sessions) {
    if (session.code !== room.code) continue;
    io.to(id).emit('room', roomPayload(room, session.token));
  }
}

function attach(socket: Socket, room: Room, token: string): void {
  sessions.set(socket.id, { code: room.code, token });
  broadcast(room);
}

io.on('connection', (socket) => {
  socket.on('create', (msg: { name?: string }, ack) => {
    const reply = safeAck(ack);
    try {
      const { room, token } = store.create(msg?.name ?? '');
      reply({ ok: true, code: room.code, token });
      attach(socket, room, token);
    } catch (err) {
      reply({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('join', (msg: { code?: string; name?: string }, ack) => {
    const reply = safeAck(ack);
    try {
      const { room, token } = store.join(String(msg?.code ?? ''), msg?.name ?? '');
      reply({ ok: true, code: room.code, token });
      attach(socket, room, token);
    } catch (err) {
      reply({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('resume', (msg: { code?: string; token?: string }, ack) => {
    const reply = safeAck(ack);
    const room = store.get(String(msg?.code ?? ''));
    if (!room || !msg?.token || !store.isSeated(room, msg.token)) {
      reply({ ok: false, error: 'That seat is no longer available.' });
      return;
    }
    reply({ ok: true, code: room.code });
    attach(socket, room, msg.token);
  });

  const withSession = (fn: (s: Session) => Room) => (msg: unknown, ack: unknown) => {
    const reply = safeAck(ack);
    const session = sessions.get(socket.id);
    if (!session) {
      reply({ ok: false, error: 'Join a game first.' });
      return;
    }
    try {
      const room = fn(session);
      reply({ ok: true });
      broadcast(room);
    } catch (err) {
      reply({ ok: false, error: errorMessage(err) });
    }
  };

  socket.on('pickCiv', (msg: { civ: CivId }, ack) =>
    withSession((s) => store.pickCiv(s.code, s.token, msg?.civ))(msg, ack),
  );
  socket.on('start', (msg: unknown, ack) => withSession((s) => store.start(s.code, s.token))(msg, ack));
  socket.on('setOptions', (msg: Partial<GameOptions>, ack) =>
    withSession((s) => {
      const opts: Partial<GameOptions> = {};
      if (msg?.winVp !== undefined) opts.winVp = Number(msg.winVp);
      if (msg?.tokens !== undefined) opts.tokens = msg.tokens;
      return store.setOptions(s.code, s.token, opts);
    })(msg, ack),
  );
  socket.on('rematch', (msg: unknown, ack) => withSession((s) => store.rematch(s.code, s.token))(msg, ack));
  socket.on('action', (msg: { action: Action }, ack) =>
    withSession((s) => store.act(s.code, s.token, msg?.action))(msg, ack),
  );
  // "Report a problem": saves the full game (including hidden cards) plus the player's note on the host PC.
  socket.on('report', (msg: { note?: string }, ack) => {
    const reply = safeAck(ack);
    const session = sessions.get(socket.id);
    const room = session && store.get(session.code);
    if (!session || !room) {
      reply({ ok: false, error: 'Join a game first.' });
      return;
    }
    try {
      const seat = room.seats.find((s) => s.token === session.token);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reporter = (seat?.name ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
      mkdirSync(REPORTS_DIR, { recursive: true });
      const file = join(REPORTS_DIR, `${room.code}-${stamp}-${reporter}.json`);
      const report = {
        note: String(msg?.note ?? '').slice(0, 4000),
        reporter: seat?.name ?? null,
        reporterPlayer: room.game ? room.order.indexOf(session.token) : null,
        code: room.code,
        savedAt: new Date().toISOString(),
        seats: room.seats.map((s) => ({ name: s.name, civ: s.civ })),
        game: room.game,
      };
      writeFileSync(file, JSON.stringify(report, null, 2));
      console.log(`Problem report saved: ${file}`);
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('leave', (msg: unknown, ack) => {
    withSession((s) => {
      const room = store.leave(s.code, s.token);
      sessions.delete(socket.id);
      return room;
    })(msg, ack);
  });

  socket.on('disconnect', () => {
    const session = sessions.get(socket.id);
    sessions.delete(socket.id);
    if (session) {
      const room = store.get(session.code);
      if (room) broadcast(room);
    }
  });
});

http.listen(PORT, () => {
  console.log(`Pangea server listening on http://localhost:${PORT}`);
  console.log(`Saved games: ${DATA_DIR} (${store.count} loaded)`);
  if (!existsSync(CLIENT_DIST)) console.log('Client not built yet: run "npm run build" first.');
});
