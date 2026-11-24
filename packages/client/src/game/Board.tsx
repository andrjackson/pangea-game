import { useMemo } from 'react';
import { CIVS, hexCorners, type PlayerView } from '@pangea/engine';
import { CityPiece, KnightPiece, RoadPiece, SettlementPiece } from '../art/civ';
import { HarborMarker, NumberToken, TERRAIN_FILL, TileArt } from '../art/tiles';

export interface Targets {
  vertices?: Set<number>;
  edges?: Set<number>;
  hexes?: Set<number>;
}

interface Props {
  view: PlayerView;
  targets: Targets;
  selected?: Set<number>;
  onVertex?: (v: number) => void;
  onEdge?: (e: number) => void;
  onHex?: (h: number) => void;
}

const poly = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');

export function Board({ view, targets, selected, onVertex, onEdge, onHex }: Props) {
  const { board } = view;
  const box = useMemo(() => {
    const xs = board.hexes.map((h) => h.x);
    const ys = board.hexes.map((h) => h.y);
    const m = 1.95;
    const minX = Math.min(...xs) - m;
    const minY = Math.min(...ys) - m;
    return { minX, minY, w: Math.max(...xs) + m - minX, h: Math.max(...ys) + m - minY };
  }, [board]);

  const lastSum = view.dice && view.rolled ? view.dice.red + view.dice.yellow : null;
  const civOf = (p: number) => view.players[p].civ;

  return (
    <svg className="board" viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`} role="img" aria-label="Game board">
      <defs>
        <pattern id="waves" width="0.8" height="0.5" patternUnits="userSpaceOnUse">
          <path d="M0 0.25 Q0.2 0.12 0.4 0.25 T0.8 0.25" fill="none" stroke="#5f8fae" strokeWidth="0.025" opacity="0.6" />
        </pattern>
        <filter id="lift" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0.04" stdDeviation="0.03" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>
      <rect x={box.minX} y={box.minY} width={box.w} height={box.h} fill="#3c6b8a" />
      <rect x={box.minX} y={box.minY} width={box.w} height={box.h} fill="url(#waves)" />

      {/* coastline */}
      {board.hexes.map((h) => (
        <polygon key={`c${h.id}`} points={poly(hexCorners(h.x, h.y, 1.16))} fill="#d9c79a" />
      ))}

      {board.hexes.map((h) => (
        <g key={h.id}>
          <polygon points={poly(hexCorners(h.x, h.y, 0.985))} fill={TERRAIN_FILL[h.terrain]} stroke="#5b4a2e" strokeWidth={0.025} />
          <TileArt terrain={h.terrain} x={h.x} y={h.y} />
          {h.token !== null && <NumberToken n={h.token} x={h.x} y={h.y} highlight={lastSum === h.token} />}
        </g>
      ))}

      {board.harbors.map((hb, i) => {
        const e = board.edges[hb.edge];
        const a = board.vertices[e.a];
        const b = board.vertices[e.b];
        return <HarborMarker key={i} kind={hb.kind} x={hb.x} y={hb.y} ax={a.x} ay={a.y} bx={b.x} by={b.y} />;
      })}

      {Object.entries(view.roads).map(([e, owner]) => {
        const edge = board.edges[Number(e)];
        const a = board.vertices[edge.a];
        const b = board.vertices[edge.b];
        return <RoadPiece key={e} civ={civOf(owner)} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
      })}

      {/* robber and caravan */}
      {(() => {
        const h = board.hexes[view.robber];
        return <Robber x={h.x - 0.5} y={h.y + 0.05} asleep={!view.robberActive} />;
      })()}
      {view.caravan && (() => {
        const h = board.hexes[view.caravan.hex];
        const c = CIVS[civOf(view.caravan.owner)];
        return <Caravan x={h.x + 0.52} y={h.y + 0.05} main={c.main} accent={c.accent} ink={c.ink} />;
      })()}

      {targets.edges &&
        [...targets.edges].map((id) => {
          const e = board.edges[id];
          const a = board.vertices[e.a];
          const b = board.vertices[e.b];
          return (
            <g key={`te${id}`} className="target" data-edge={id} onClick={() => onEdge?.(id)}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={0.3} />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="target-edge" strokeWidth={0.1} strokeLinecap="round" />
            </g>
          );
        })}

      {Object.entries(view.buildings).map(([v, b]) => {
        const vx = board.vertices[Number(v)];
        const civ = civOf(b.owner);
        return (
          <g key={`b${v}`} filter="url(#lift)">
            {b.kind === 'settlement' ? (
              <SettlementPiece civ={civ} x={vx.x} y={vx.y} />
            ) : (
              <CityPiece civ={civ} x={vx.x} y={vx.y} wall={b.wall} metropolis={b.metropolis} />
            )}
          </g>
        );
      })}

      {Object.entries(view.knights).map(([v, k]) => {
        const vx = board.vertices[Number(v)];
        return (
          <g key={`k${v}`} filter="url(#lift)">
            <KnightPiece civ={civOf(k.owner)} x={vx.x} y={vx.y} level={k.level} active={k.active} />
          </g>
        );
      })}

      {targets.hexes &&
        [...targets.hexes].map((id) => {
          const h = board.hexes[id];
          return <polygon key={`th${id}`} data-hex={id} className="target target-hex" points={poly(hexCorners(h.x, h.y, 0.9))} onClick={() => onHex?.(id)} />;
        })}

      {targets.vertices &&
        [...targets.vertices].map((id) => {
          const v = board.vertices[id];
          return (
            <g key={`tv${id}`} className="target" data-vertex={id} onClick={() => onVertex?.(id)}>
              <circle cx={v.x} cy={v.y} r={0.24} fill="transparent" />
              <circle cx={v.x} cy={v.y} r={0.15} className={`target-vertex ${selected?.has(id) ? 'selected' : ''}`} />
            </g>
          );
        })}
    </svg>
  );
}

function Robber({ x, y, asleep }: { x: number; y: number; asleep: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.0062)`} opacity={asleep ? 0.55 : 1} pointerEvents="none">
      <path d="M-26 50 Q-30 0 -14 -18 Q0 -26 14 -18 Q30 0 26 50 Z" fill="#2a2624" stroke="#0e0c0b" strokeWidth={5} />
      <circle cx={0} cy={-30} r={17} fill="#2a2624" stroke="#0e0c0b" strokeWidth={5} />
      <path d="M-8 -32 h16" stroke="#d9c79a" strokeWidth={5} strokeLinecap="round" />
      {asleep && (
        <text x={22} y={-44} fontSize={30} fill="#f4ead2" fontWeight={700}>
          z
        </text>
      )}
    </g>
  );
}

function Caravan({ x, y, main, accent, ink }: { x: number; y: number; main: string; accent: string; ink: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.0055)`} pointerEvents="none">
      <path d="M-40 10 Q-40 -20 -10 -22 Q0 -40 14 -22 Q30 -22 34 -6 L48 -30 L56 -26 L44 6 Q40 14 32 14 H-32 Q-40 14 -40 10Z" fill={main} stroke={ink} strokeWidth={5} strokeLinejoin="round" />
      <path d="M-30 14 V40 M-12 14 V40 M14 14 V40 M30 14 V40" stroke={ink} strokeWidth={7} strokeLinecap="round" />
      <path d="M-24 -18 H22 V-6 H-24Z" fill={accent} stroke={ink} strokeWidth={3} />
    </g>
  );
}
