import { useState } from 'react';
import { RAIDERS, vpBreakdown, type PlayerView } from '@pangea/engine';
import { CivEmblem } from '../art/civ';
import { api } from '../net';

const VP_PARTS: [keyof ReturnType<typeof vpBreakdown>, string][] = [
  ['settlements', 'Settlements'],
  ['cities', 'Cities'],
  ['metropolises', 'Metropolis'],
  ['longestRoad', 'Longest road'],
  ['shields', 'Shields'],
  ['progress', 'Writing / Law Code'],
  ['caravan', 'Caravan'],
];

const STAT_ROWS: [keyof PlayerView['stats'], string][] = [
  ['produced', 'Cards produced'],
  ['trades', 'Trades with players'],
  ['progressPlayed', 'Progress cards played'],
  ['robbed', 'Cards stolen'],
  ['lostToRobber', 'Cards lost to thieves'],
  ['discarded', 'Cards discarded'],
];

export function EndScreen({ view, onClose }: { view: PlayerView; onClose: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ranked = view.players.map((p) => ({ p, b: vpBreakdown(view, p.id) })).sort((a, b) => b.b.total - a.b.total || (a.p.id === view.winner ? -1 : 1));
  const winner = view.players[view.winner!];
  return (
    <div className="modal-backdrop">
      <div className="panel modal end-screen" role="dialog" aria-label="Game over">
        <h2 className="end-title">{winner.id === view.me ? 'You win!' : `${winner.name} wins!`}</h2>
        <p className="muted small">
          {view.turn} turn{view.turn === 1 ? '' : 's'} · {view.barbarian.attacks} raid{view.barbarian.attacks === 1 ? '' : 's'} by {RAIDERS[view.raiders].name.toLowerCase()} · target {view.options.winVp} VP
        </p>
        <ol className="standings">
          {ranked.map(({ p, b }, i) => (
            <li key={p.id} className={p.id === view.winner ? 'winner' : ''}>
              <span className="rank">{i + 1}</span>
              <CivEmblem civ={p.civ} size={36} />
              <div className="standing-main">
                <strong>{p.name}</strong>
                <div className="vp-parts">
                  {VP_PARTS.filter(([k]) => b[k] > 0).map(([k, label]) => (
                    <span key={k} className="badge">
                      {label} +{b[k]}
                    </span>
                  ))}
                </div>
              </div>
              <span className="vp">{b.total}</span>
            </li>
          ))}
        </ol>
        <table className="stats">
          <thead>
            <tr>
              <th />
              {view.players.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAT_ROWS.map(([k, label]) => {
              const row = view.stats[k];
              const best = Math.max(...row);
              return (
                <tr key={k}>
                  <th>{label}</th>
                  {row.map((n, i) => (
                    <td key={i} className={n === best && best > 0 ? 'best' : ''}>
                      {n}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {error && <div className="error-text">{error}</div>}
        <div className="btn-row end">
          <button className="btn ghost" onClick={onClose}>
            Look at the board
          </button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.rematch();
              } catch (err) {
                setError((err as Error).message);
                setBusy(false);
              }
            }}
          >
            Play again with the same table
          </button>
        </div>
      </div>
    </div>
  );
}
