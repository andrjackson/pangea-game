import { useState } from 'react';
import { CIVS, CIV_IDS, type CivId, type GameOptions } from '@pangea/engine';
import { CivEmblem, PieceSwatch } from './art/civ';
import { Longship } from './art/tiles';
import { Game } from './game/Game';
import { api, useConnection, type RoomState } from './net';

export function App() {
  const { room, connected, resuming } = useConnection();
  let body;
  if (resuming && !room) body = <div className="center-card">Reconnecting…</div>;
  else if (!room) body = <Home />;
  else if (!room.started || !room.view) body = <Lobby room={room} />;
  else body = <Game room={room} />;
  return (
    <>
      {!connected && <div className="offline-banner">Connection lost. Trying to reconnect…</div>}
      {body}
    </>
  );
}

function Home() {
  const params = new URLSearchParams(window.location.search);
  const [name, setName] = useState('');
  const [code, setCode] = useState(params.get('join') ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home">
      <div className="home-hero">
        <h1 className="title">Pangea</h1>
        <p className="tagline">Eight civilizations. One island. The raiders are coming.</p>
        <div className="hero-ship">
          <Longship width={120} />
        </div>
      </div>
      <div className="panel home-card">
        <label className="field">
          <span>Your name</span>
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="e.g. Andrew" autoFocus />
        </label>
        <div className="home-actions">
          <button className="btn primary" disabled={busy || !name.trim()} onClick={() => run(() => api.create(name))}>
            Create a new game
          </button>
          <div className="or">or join one</div>
          <div className="join-row">
            <input
              className="code-input"
              value={code}
              maxLength={4}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              aria-label="Game code"
            />
            <button className="btn" disabled={busy || !name.trim() || code.length !== 4} onClick={() => run(() => api.join(code, name))}>
              Join
            </button>
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>
    </div>
  );
}

function Lobby({ room }: { room: RoomState }) {
  const [error, setError] = useState('');
  const me = room.seats.find((s) => s.isYou);
  const taken = new Map(room.seats.filter((s) => s.civ).map((s) => [s.civ!, s.name]));
  const link = `${window.location.origin}/?join=${room.code}`;
  const canStart = room.isHost && room.seats.length >= 3 && room.seats.every((s) => s.civ);

  const pick = async (civ: CivId) => {
    setError('');
    try {
      await api.pickCiv(civ);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="lobby">
      <header className="lobby-head">
        <h1 className="title small">Pangea</h1>
        <div className="code-box">
          <span>Game code</span>
          <strong>{room.code}</strong>
          <button className="btn tiny" onClick={() => navigator.clipboard?.writeText(link)}>
            Copy invite link
          </button>
        </div>
      </header>

      <section className="panel">
        <h2>At the table ({room.seats.length}/4)</h2>
        <ul className="seat-list">
          {room.seats.map((s) => (
            <li key={s.name} className={s.connected ? '' : 'away'}>
              {s.civ ? <CivEmblem civ={s.civ} size={40} /> : <div className="emblem-empty" />}
              <div>
                <strong>{s.name}</strong>
                {s.isYou && <span className="tag">you</span>}
                {s.isHost && <span className="tag">host</span>}
                <div className="muted">{s.civ ? CIVS[s.civ].name : 'choosing…'}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Choose your civilization</h2>
        <div className="civ-grid">
          {CIV_IDS.map((civ) => {
            const c = CIVS[civ];
            const owner = taken.get(civ);
            const mine = me?.civ === civ;
            return (
              <button
                key={civ}
                className={`civ-card ${mine ? 'mine' : ''}`}
                disabled={!!owner && !mine}
                onClick={() => pick(civ)}
                style={{ ['--civ-main' as string]: c.main, ['--civ-accent' as string]: c.accent }}
              >
                <div className="civ-swatches">
                  <span style={{ background: c.main }} />
                  <span style={{ background: c.accent }} />
                </div>
                <div className="civ-pieces">
                  <PieceSwatch civ={civ} kind="settlement" size={40} />
                  <PieceSwatch civ={civ} kind="city" size={48} />
                  <PieceSwatch civ={civ} kind="knight" size={34} />
                </div>
                <strong>{c.name}</strong>
                <span className="muted">{owner && !mine ? `taken by ${owner}` : c.motif}</span>
              </button>
            );
          })}
        </div>
        {error && <div className="error-text">{error}</div>}
      </section>

      <LobbyOptions room={room} onError={setError} />

      <div className="lobby-actions">
        {room.isHost ? (
          <button className="btn primary" disabled={!canStart} onClick={() => api.start().catch((e) => setError(e.message))}>
            {room.seats.length < 3 ? 'Waiting for at least 3 players' : canStart ? 'Start the game' : 'Waiting for civ picks'}
          </button>
        ) : (
          <span className="muted">Waiting for the host to start…</span>
        )}
        <button className="btn ghost" onClick={() => api.leave()}>
          Leave
        </button>
      </div>
    </div>
  );
}

function LobbyOptions({ room, onError }: { room: RoomState; onError: (msg: string) => void }) {
  const set = (opts: Partial<GameOptions>) => api.setOptions(opts).catch((e) => onError((e as Error).message));
  const { winVp, tokens } = room.options;
  return (
    <section className="panel options">
      <h2>Game options</h2>
      {room.isHost ? (
        <div className="option-grid">
          <label className="field">
            <span>Victory points to win</span>
            <select value={winVp} onChange={(e) => set({ winVp: Number(e.target.value) })}>
              {[10, 11, 12, 13, 14, 15].map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === 13 ? ' (standard)' : n < 13 ? ' (shorter game)' : ' (longer game)'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Number tokens</span>
            <select value={tokens} onChange={(e) => set({ tokens: e.target.value as GameOptions['tokens'] })}>
              <option value="spiral">Rulebook spiral (standard)</option>
              <option value="balanced">Random, no 6s or 8s side by side</option>
            </select>
          </label>
        </div>
      ) : (
        <p className="muted">
          First to <b>{winVp}</b> victory points · {tokens === 'spiral' ? 'rulebook spiral numbers' : 'random numbers, no 6s or 8s side by side'}. The host can change these.
        </p>
      )}
    </section>
  );
}
