import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CARD_NAMES,
  CARD_TYPES,
  CITY_COMMODITY,
  CIVS,
  KNIGHT_NAMES,
  TERRAIN_RESOURCE,
  TRACK_INFO,
  canKnightAct,
  hexCorners,
  hexInfluence,
  type PlayerView,
  type ProductionRecord,
} from '@pangea/engine';
import { CityPiece, KnightPiece, RoadPiece, SettlementPiece } from '../art/civ';
import { TerritoryPatterns, TerritoryTile } from '../art/territory';
import { HarborMarker, NumberToken, TERRAIN_FILL, TERRAIN_NAME, TileArt } from '../art/tiles';

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

/** Pieces placed or changed since the last update, highlighted for a few seconds. */
function useRecentChanges(view: PlayerView): { vertices: Set<number>; edges: Set<number> } {
  const prev = useRef<{ v: Map<number, string>; e: Map<number, number> } | null>(null);
  const [recent, setRecent] = useState<{ vertices: Set<number>; edges: Set<number> }>({ vertices: new Set(), edges: new Set() });
  useEffect(() => {
    const v = new Map<number, string>();
    for (const [id, b] of Object.entries(view.buildings)) v.set(Number(id), `b${b.owner}${b.kind}${b.wall}${b.metropolis}`);
    for (const [id, k] of Object.entries(view.knights)) v.set(Number(id), `k${k.owner}${k.level}`);
    const e = new Map<number, number>(Object.entries(view.roads).map(([id, o]) => [Number(id), o]));
    const before = prev.current;
    prev.current = { v, e };
    if (!before) return;
    const vertices = new Set([...v].filter(([id, sig]) => before.v.get(id) !== sig).map(([id]) => id));
    const edges = new Set([...e].filter(([id, o]) => before.e.get(id) !== o).map(([id]) => id));
    if (!vertices.size && !edges.size) return;
    setRecent({ vertices, edges });
    const t = setTimeout(() => setRecent({ vertices: new Set(), edges: new Set() }), 3500);
    return () => clearTimeout(t);
  }, [view.buildings, view.knights, view.roads]);
  return recent;
}

/** The latest production, shown only when it changes (not on page load). */
function useFreshProduction(record: ProductionRecord | null): ProductionRecord | null {
  const seen = useRef<number | null>(record?.seq ?? null);
  const [shown, setShown] = useState<ProductionRecord | null>(null);
  useEffect(() => {
    if (!record || record.seq === seen.current) return;
    seen.current = record.seq;
    setShown(record);
    const t = setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(t);
  }, [record]);
  return shown;
}

function isLight(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
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

  const influence = useMemo(
    () => board.hexes.map((h) => hexInfluence(view, h.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, view.buildings, view.roads],
  );

  const lastSum = view.dice && view.rolled ? view.dice.red + view.dice.yellow : null;
  const civOf = (p: number) => view.players[p].civ;
  const nameOf = (p: number) => view.players[p].name;
  const recent = useRecentChanges(view);
  const production = useFreshProduction(view.production);

  const tileTitle = (hid: number) => {
    const h = board.hexes[hid];
    const res = TERRAIN_RESOURCE[h.terrain];
    const com = CITY_COMMODITY[h.terrain];
    const parts = [`${TERRAIN_NAME[h.terrain]}${h.token ? ` · ${h.token}` : ''}`];
    if (res) parts.push(`Produces ${CARD_NAMES[res]}${com ? ` (cities also get ${CARD_NAMES[com]})` : ` (cities get 2)`}`);
    if (view.robber === hid) parts.push(view.robberActive ? 'The robber blocks this tile' : 'The robber sleeps here');
    if (influence[hid].length) parts.push(`Territory: ${influence[hid].map((i) => nameOf(i.player)).join(', ')}`);
    return parts.join('\n');
  };

  return (
    <svg className="board" viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`} role="img" aria-label="Game board">
      <defs>
        <TerritoryPatterns />
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
          <title>{tileTitle(h.id)}</title>
          {influence[h.id].length ? (
            <TerritoryTile hex={h} influence={influence[h.id]} civOf={civOf} />
          ) : (
            <>
              <polygon points={poly(hexCorners(h.x, h.y, 0.985))} fill={TERRAIN_FILL[h.terrain]} stroke="#5b4a2e" strokeWidth={0.025} />
              <TileArt terrain={h.terrain} x={h.x} y={h.y} />
            </>
          )}
          {h.token !== null && <NumberToken n={h.token} x={h.x} y={h.y} highlight={lastSum === h.token} />}
        </g>
      ))}

      {board.harbors.map((hb, i) => {
        const e = board.edges[hb.edge];
        const a = board.vertices[e.a];
        const b = board.vertices[e.b];
        return (
          <g key={i}>
            <HarborMarker kind={hb.kind} x={hb.x} y={hb.y} ax={a.x} ay={a.y} bx={b.x} by={b.y} />
            <circle cx={hb.x} cy={hb.y} r={0.27} fill="transparent">
              <title>{hb.kind === 'any' ? '3:1 harbor: trade 3 of any one card for 1' : `2:1 harbor: trade 2 ${CARD_NAMES[hb.kind]} for 1 of anything`}</title>
            </circle>
          </g>
        );
      })}

      {Object.entries(view.roads).map(([e, owner]) => {
        const edge = board.edges[Number(e)];
        const a = board.vertices[edge.a];
        const b = board.vertices[edge.b];
        return (
          <g key={e}>
            <title>{`${nameOf(owner)}'s road`}</title>
            {recent.edges.has(Number(e)) && <line className="recent-edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />}
            <RoadPiece civ={civOf(owner)} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          </g>
        );
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
            <title>{`${nameOf(b.owner)}'s ${b.kind}${b.wall ? ' with a wall' : ''}${b.metropolis ? ` · ${TRACK_INFO[b.metropolis].metropolis}` : ''}`}</title>
            {recent.vertices.has(Number(v)) && <circle className="recent-ring" cx={vx.x} cy={vx.y} r={0.42} />}
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
            <title>{`${nameOf(k.owner)}'s ${KNIGHT_NAMES[k.level]} (strength ${k.level}) · ${
              !k.active ? 'inactive' : canKnightAct(k, view.turn) ? 'active, ready to act' : 'active, already used or just activated this turn'
            }`}</title>
            {recent.vertices.has(Number(v)) && <circle className="recent-ring" cx={vx.x} cy={vx.y} r={0.36} />}
            <KnightPiece civ={civOf(k.owner)} x={vx.x} y={vx.y} level={k.level} active={k.active} />
          </g>
        );
      })}

      {production && (
        <g key={production.seq} pointerEvents="none">
          {production.items.map((item, i) => {
            const h = board.hexes[item.hex];
            const stack = production.items.filter((x, j) => x.hex === item.hex && j < i).length;
            const label = CARD_TYPES.filter((t) => item.cards[t]).map((t) => `+${item.cards[t]} ${CARD_NAMES[t]}`).join('  ');
            const c = CIVS[civOf(item.player)];
            const w = 0.11 * label.length + 0.2;
            return (
              <g key={i} className="float-label" style={{ animationDelay: `${stack * 0.25}s` }} transform={`translate(${h.x} ${h.y - 0.42 - stack * 0.3})`}>
                <rect x={-w / 2} y={-0.14} width={w} height={0.28} rx={0.14} fill={c.main} stroke={c.ink} strokeWidth={0.025} />
                <text y={0.065} textAnchor="middle" fontSize={0.18} fontWeight={700} fill={isLight(c.main) ? c.ink : '#fff'}>
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      )}

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
