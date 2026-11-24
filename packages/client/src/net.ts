import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Action, CivId, PlayerView } from '@pangea/engine';

export interface SeatInfo {
  name: string;
  civ: CivId | null;
  isHost: boolean;
  isYou: boolean;
  connected: boolean;
}

export interface RoomState {
  code: string;
  started: boolean;
  isHost: boolean;
  seats: SeatInfo[];
  view: PlayerView | null;
}

const SESSION_KEY = 'pangea:session';

export const socket = io({ autoConnect: true, transports: ['websocket', 'polling'] });

interface Saved {
  code: string;
  token: string;
}

function loadSession(): Saved | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Saved | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: sessions just won't survive a reload */
  }
}

type Reply = { ok: true; code?: string; token?: string } | { ok: false; error: string };

function emit(event: string, payload: unknown): Promise<Reply> {
  return new Promise((resolve) => {
    socket.timeout(10000).emit(event, payload, (err: Error | null, res: Reply) => {
      if (err) resolve({ ok: false, error: 'The server did not answer. Is it still running?' });
      else resolve(res);
    });
  });
}

async function must(event: string, payload: unknown): Promise<Reply & { ok: true }> {
  const res = await emit(event, payload);
  if (!res.ok) throw new Error(res.error);
  return res;
}

export const api = {
  async create(name: string) {
    const res = await must('create', { name });
    saveSession({ code: res.code!, token: res.token! });
  },
  async join(code: string, name: string) {
    const res = await must('join', { code: code.trim().toUpperCase(), name });
    saveSession({ code: res.code!, token: res.token! });
  },
  pickCiv: (civ: CivId) => must('pickCiv', { civ }),
  start: () => must('start', {}),
  act: (action: Action) => must('action', { action }),
  report: (note: string) => must('report', { note }),
  async leave() {
    await emit('leave', {});
    saveSession(null);
    window.location.reload();
  },
  forget() {
    saveSession(null);
    window.location.reload();
  },
};

export function useConnection(): { room: RoomState | null; connected: boolean; resuming: boolean } {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [resuming, setResuming] = useState(() => loadSession() !== null);

  useEffect(() => {
    const onRoom = (r: RoomState) => setRoom(r);
    const onConnect = async () => {
      setConnected(true);
      const saved = loadSession();
      if (!saved) {
        setResuming(false);
        return;
      }
      const res = await emit('resume', saved);
      if (!res.ok) {
        saveSession(null);
        setRoom(null);
      }
      setResuming(false);
    };
    const onDisconnect = () => setConnected(false);
    socket.on('room', onRoom);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) void onConnect();
    return () => {
      socket.off('room', onRoom);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return { room, connected, resuming };
}
