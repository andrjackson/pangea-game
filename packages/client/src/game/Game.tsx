import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Action } from '@pangea/engine';
import { api, type RoomState } from '../net';
import { Board } from './Board';
import { useAttention, useMuted } from './attention';
import { computeInteraction, myDecision, type Mode } from './interaction';
import {
  ActionBar,
  DecisionPanel,
  HandBar,
  Improvements,
  LogPanel,
  PlayerList,
  ProgressHand,
  TopBar,
  TradePanel,
  TurnBanner,
  WaitingOn,
} from './Panels';

export function Game({ room }: { room: RoomState }) {
  const view = room.view!;
  const [mode, setMode] = useState<Mode | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, toggleMute] = useMuted();
  useAttention(view, muted);

  // Drop stale modes when the turn or situation changes.
  useEffect(() => {
    if (view.current !== view.me || view.queue.length > 0) setMode(null);
  }, [view.current, view.me, view.queue.length]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const send = useCallback(async (action: Action) => {
    try {
      await api.act(action);
      setMode(null);
      return true;
    } catch (err) {
      setToast((err as Error).message);
      return false;
    }
  }, []);

  const interaction = useMemo(() => computeInteraction(view, mode), [view, mode]);
  const decision = myDecision(view);

  const pick = (kind: 'vertex' | 'edge' | 'hex', id: number) => {
    const res = interaction.pick?.(kind, id);
    if (!res) return;
    if (res.mode !== undefined) setMode(res.mode);
    if (res.send) void send(res.send);
  };

  const armoryPicks = mode?.t === 'card' && mode.card === 'armory' ? mode.picks : [];

  return (
    <div className="game">
      <TopBar view={view} muted={muted} onToggleMute={toggleMute} />
      <main className="table">
        <div className="board-wrap">
          <Board
            view={view}
            targets={interaction.targets}
            selected={interaction.selected}
            onVertex={(id) => pick('vertex', id)}
            onEdge={(id) => pick('edge', id)}
            onHex={(id) => pick('hex', id)}
          />
          {toast && (
            <div className="toast" role="alert" onClick={() => setToast(null)}>
              {toast}
            </div>
          )}
        </div>
        <aside className="sidebar">
          <TurnBanner view={view} hint={interaction.hint} />
          <WaitingOn view={view} />
          {decision && <DecisionPanel view={view} decision={decision} send={send} />}
          <PlayerList view={view} />
          <TradePanel view={view} send={send} />
          <LogPanel view={view} />
        </aside>
      </main>
      <footer className="dock">
        <div className="dock-left">
          <HandBar view={view} />
          <ProgressHand view={view} send={send} setMode={setMode} />
        </div>
        <Improvements view={view} send={send} setMode={setMode} />
        <ActionBar view={view} send={send} mode={mode} setMode={setMode} armoryPicks={armoryPicks} />
      </footer>
    </div>
  );
}
