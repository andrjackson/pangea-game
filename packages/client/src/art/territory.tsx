import { CIVS, CIV_IDS, type CivId, type HexTile, type Influence } from '@pangea/engine';
import { GLYPH, SPOTS, TERRAIN_FILL } from './tiles';

// ---------------------------------------------------------------------------
// geometry: wedges of a pointy-top hexagon
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const SIXTH = Math.PI / 3;
const FIRST_CORNER = -Math.PI / 6;

/** Point on the hexagon boundary (circumradius r) in direction theta. */
function hexPoint(cx: number, cy: number, r: number, theta: number): [number, number] {
  const rel = (((theta - FIRST_CORNER) % TAU) + TAU) % TAU;
  const k = Math.floor(rel / SIXTH);
  const normal = FIRST_CORNER + k * SIXTH + SIXTH / 2;
  const dist = (r * Math.cos(Math.PI / 6)) / Math.cos(theta - normal);
  return [cx + dist * Math.cos(theta), cy + dist * Math.sin(theta)];
}

/** Boundary points from a0 to a1 (a1 > a0), including the corners in between. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): [number, number][] {
  const pts: [number, number][] = [hexPoint(cx, cy, r, a0)];
  let n = Math.floor((a0 - FIRST_CORNER) / SIXTH) + 1;
  for (let c = FIRST_CORNER + n * SIXTH; c < a1 - 1e-9; c = FIRST_CORNER + ++n * SIXTH) {
    pts.push([cx + r * Math.cos(c), cy + r * Math.sin(c)]);
  }
  pts.push(hexPoint(cx, cy, r, a1));
  return pts;
}

const fmt = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(' L');

function wedgePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  return `M${cx} ${cy} L${fmt(arc(cx, cy, r, a0, a1))} Z`;
}

function ringPath(cx: number, cy: number, rOut: number, rIn: number, a0: number, a1: number, full: boolean): string {
  if (full) {
    const hex = (r: number) => fmt(Array.from({ length: 6 }, (_, k) => [cx + r * Math.cos(FIRST_CORNER + k * SIXTH), cy + r * Math.sin(FIRST_CORNER + k * SIXTH)] as [number, number]));
    return `M${hex(rOut)} Z M${hex(rIn)} Z`;
  }
  const outer = arc(cx, cy, rOut, a0, a1);
  const inner = arc(cx, cy, rIn, a0, a1).reverse();
  return `M${fmt([...outer, ...inner])} Z`;
}

function hexOutline(cx: number, cy: number, r: number): string {
  return `M${fmt(Array.from({ length: 6 }, (_, k) => [cx + r * Math.cos(FIRST_CORNER + k * SIXTH), cy + r * Math.sin(FIRST_CORNER + k * SIXTH)] as [number, number]))} Z`;
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------------------
// civ border patterns
// ---------------------------------------------------------------------------

const PATTERN: Record<CivId, string> = {
  rome: 'M0.01 0.16 V0.03 H0.15 V0.13 H0.06 V0.08 H0.11',
  egypt: 'M0 0.13 L0.045 0.05 L0.09 0.13 L0.135 0.05 L0.18 0.13',
  han: 'M0.03 0.13 A0.045 0.045 0 1 1 0.12 0.13 A0.026 0.026 0 1 1 0.068 0.13',
  maya: 'M0 0.16 H0.045 V0.115 H0.09 V0.07 H0.135 V0.025 H0.18',
  mali: 'M0.105 0.04 H0.165 M0.015 0.14 H0.075 M0.045 0.03 v0.02 M0.135 0.13 v0.02',
  norse: 'M0 0 L0.18 0.18 M0.18 0 L0 0.18',
  japan: 'M0 0.18 A0.09 0.09 0 0 1 0.18 0.18 M0.045 0.18 A0.045 0.045 0 0 1 0.135 0.18 M-0.09 0.09 A0.09 0.09 0 0 1 0.09 0.09 M0.09 0.09 A0.09 0.09 0 0 1 0.27 0.09',
  persia: 'M0.09 0.015 L0.165 0.09 L0.09 0.165 L0.015 0.09 Z M0.04 0.04 H0.14 V0.14 H0.04 Z',
};

export function TerritoryPatterns() {
  return (
    <>
      {CIV_IDS.map((civ) => (
        <pattern key={civ} id={`terr-${civ}`} width={0.18} height={0.18} patternUnits="userSpaceOnUse">
          <path d={PATTERN[civ]} fill="none" stroke={CIVS[civ].accent} strokeWidth={0.022} strokeLinecap="round" strokeLinejoin="round" />
        </pattern>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// civ-flavored glyphs (unit coords, ~2 units tall, drawn at scale 0.16)
// ---------------------------------------------------------------------------

type Glyph = (p: { x: number; y: number }) => JSX.Element;
const at = (x: number, y: number, k = 0.16) => `translate(${x} ${y}) scale(${k})`;
const TRUNK = '#4b3a26';

const trees: Record<CivId, Glyph> = {
  rome: ({ x, y }) => (
    <g transform={at(x, y)}>
      <rect x={-0.08} y={-0.35} width={0.16} height={1.3} fill={TRUNK} />
      <ellipse cx={0} cy={-0.5} rx={0.9} ry={0.32} fill="#3d5a36" />
    </g>
  ),
  egypt: ({ x, y }) => (
    <g transform={at(x, y)} fill="none" strokeLinecap="round">
      <path d="M0 0.95 Q0.15 0.2 0 -0.5" stroke="#7a5a32" strokeWidth={0.16} />
      <path d="M0 -0.5 Q-0.5 -0.85 -0.95 -0.3 M0 -0.5 Q0.5 -0.85 0.95 -0.3 M0 -0.5 Q-0.3 -1.05 -0.65 -0.95 M0 -0.5 Q0.3 -1.05 0.65 -0.95" stroke="#4f7a35" strokeWidth={0.16} />
    </g>
  ),
  han: ({ x, y }) => (
    <g transform={at(x, y)}>
      <path d="M0 0.95 V-0.6 M0 0.1 L0.35 -0.2" stroke={TRUNK} strokeWidth={0.14} />
      <ellipse cx={-0.15} cy={-0.1} rx={0.7} ry={0.16} fill="#335238" />
      <ellipse cx={0.2} cy={-0.45} rx={0.55} ry={0.15} fill="#335238" />
      <ellipse cx={0} cy={-0.78} rx={0.38} ry={0.13} fill="#335238" />
    </g>
  ),
  maya: ({ x, y }) => (
    <g transform={at(x, y)}>
      <path d="M-0.12 0.95 L-0.06 -0.4 H0.06 L0.12 0.95 Z" fill={TRUNK} />
      <circle cx={-0.5} cy={-0.55} r={0.34} fill="#2f6b3a" />
      <circle cx={0.5} cy={-0.55} r={0.34} fill="#2f6b3a" />
      <circle cx={0} cy={-0.78} r={0.42} fill="#3a7d45" />
    </g>
  ),
  mali: ({ x, y }) => (
    <g transform={at(x, y)}>
      <path d="M-0.34 0.95 L-0.22 -0.3 L-0.5 -0.6 M0.22 -0.3 L0.5 -0.6 M0 -0.3 V-0.7" stroke={TRUNK} strokeWidth={0.12} fill="none" />
      <path d="M-0.34 0.95 L-0.22 -0.3 H0.22 L0.34 0.95 Z" fill="#8b6a4a" />
      <circle cx={-0.5} cy={-0.62} r={0.2} fill="#6f7d3a" />
      <circle cx={0} cy={-0.75} r={0.22} fill="#6f7d3a" />
      <circle cx={0.5} cy={-0.62} r={0.2} fill="#6f7d3a" />
    </g>
  ),
  norse: ({ x, y }) => (
    <g transform={at(x, y)}>
      <rect x={-0.07} y={0.55} width={0.14} height={0.4} fill={TRUNK} />
      <path d="M0 -1.05 L0.38 -0.3 H0.18 L0.5 0.3 H0.25 L0.6 0.65 H-0.6 L-0.25 0.3 H-0.5 L-0.18 -0.3 H-0.38 Z" fill="#2c4733" />
    </g>
  ),
  japan: ({ x, y }) => (
    <g transform={at(x, y)}>
      <path d="M0 0.95 V-0.2 M0 0.1 L-0.4 -0.3 M0 -0.1 L0.35 -0.45" stroke="#5a3b2e" strokeWidth={0.13} fill="none" />
      <circle cx={-0.45} cy={-0.45} r={0.3} fill="#f0a9c2" />
      <circle cx={0.4} cy={-0.55} r={0.3} fill="#f6bfd1" />
      <circle cx={-0.02} cy={-0.72} r={0.34} fill="#eb9bb7" />
    </g>
  ),
  persia: ({ x, y }) => (
    <g transform={at(x, y)}>
      <rect x={-0.07} y={0.6} width={0.14} height={0.35} fill={TRUNK} />
      <path d="M0 -1.1 Q0.45 -0.2 0.24 0.65 H-0.24 Q-0.45 -0.2 0 -1.1 Z" fill="#284634" />
    </g>
  ),
};

const sheep = GLYPH.pasture;
const pastures: Record<CivId, Glyph> = {
  rome: sheep,
  han: sheep,
  norse: sheep,
  persia: sheep,
  egypt: ({ x, y }) => (
    // flax for linen
    <g transform={at(x, y)} strokeLinecap="round">
      <path d="M-0.4 0.9 Q-0.3 0 -0.45 -0.5 M0 0.9 V-0.7 M0.4 0.9 Q0.3 0 0.45 -0.45" stroke="#4f7a35" strokeWidth={0.1} fill="none" />
      <circle cx={-0.45} cy={-0.58} r={0.16} fill="#6f8fd6" />
      <circle cx={0} cy={-0.8} r={0.16} fill="#6f8fd6" />
      <circle cx={0.45} cy={-0.53} r={0.16} fill="#6f8fd6" />
    </g>
  ),
  mali: ({ x, y }) => (
    // zebu cattle
    <g transform={at(x, y, 0.15)}>
      <ellipse cx={0} cy={0} rx={0.8} ry={0.45} fill="#e9dcc6" stroke="#5b4a3a" strokeWidth={0.1} />
      <circle cx={-0.25} cy={-0.42} r={0.2} fill="#e9dcc6" stroke="#5b4a3a" strokeWidth={0.1} />
      <ellipse cx={0.85} cy={-0.25} rx={0.25} ry={0.2} fill="#8a6a4a" />
      <path d="M0.75 -0.42 Q0.7 -0.75 0.95 -0.7 M0.98 -0.42 Q1.1 -0.75 1.25 -0.6" stroke="#5b4a3a" strokeWidth={0.08} fill="none" />
      <path d="M-0.5 0.4 V0.85 M0.45 0.4 V0.85" stroke="#5b4a3a" strokeWidth={0.14} />
    </g>
  ),
  maya: ({ x, y }) => (
    // cotton
    <g transform={at(x, y)}>
      <path d="M0 0.95 V-0.2 M0 0.2 L-0.45 -0.25 M0 0 L0.45 -0.4" stroke="#5a4a2e" strokeWidth={0.1} fill="none" />
      {[[-0.5, -0.38], [0.5, -0.52], [0, -0.42]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={0.25} fill="#fbf8ef" stroke="#8a7a5a" strokeWidth={0.06} />
          <circle cx={cx + 0.12} cy={cy - 0.1} r={0.15} fill="#fbf8ef" />
        </g>
      ))}
    </g>
  ),
  japan: ({ x, y }) => (
    // mulberry bush for silk
    <g transform={at(x, y)}>
      <ellipse cx={0} cy={-0.1} rx={0.8} ry={0.6} fill="#4e7d3c" />
      {[[-0.35, -0.25], [0.2, -0.4], [0.4, 0.05], [-0.1, 0.15]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={0.1} fill="#4a2241" />
      ))}
    </g>
  ),
};

const wheat = GLYPH.fields;
const paddy = (terraced: boolean): Glyph =>
  function Paddy({ x, y }) {
    return (
      <g transform={at(x, y)}>
        {terraced ? (
          <path d="M-0.9 0.5 Q0 0.2 0.9 0.5 M-0.9 0 Q0 -0.3 0.9 0 M-0.9 -0.5 Q0 -0.8 0.9 -0.5" stroke="#7fb0bf" strokeWidth={0.22} fill="none" />
        ) : (
          <>
            <rect x={-0.9} y={-0.6} width={0.85} height={0.55} fill="#86b6c4" />
            <rect x={0.05} y={-0.6} width={0.85} height={0.55} fill="#86b6c4" />
            <rect x={-0.45} y={0.05} width={0.85} height={0.55} fill="#86b6c4" />
          </>
        )}
        <path d="M-0.6 -0.3 v-0.25 M-0.3 -0.3 v-0.25 M0.3 -0.3 v-0.25 M0.6 -0.3 v-0.25 M-0.15 0.35 v-0.25 M0.15 0.35 v-0.25" stroke="#4f8a3a" strokeWidth={0.1} />
      </g>
    );
  };

const crops: Record<CivId, Glyph> = {
  persia: wheat,
  norse: wheat,
  rome: ({ x, y }) => (
    // bound sheaf
    <g transform={at(x, y)} stroke="#9c7d25" strokeWidth={0.12} fill="none">
      <path d="M-0.5 0.9 L0 -0.1 L0.5 0.9 M-0.2 0.9 L0 -0.1 L0.2 0.9 M0 -0.1 L-0.45 -0.8 M0 -0.1 L0 -0.9 M0 -0.1 L0.45 -0.8" />
      <ellipse cx={-0.45} cy={-0.85} rx={0.12} ry={0.22} fill="#c9a43c" />
      <ellipse cx={0} cy={-0.95} rx={0.12} ry={0.22} fill="#c9a43c" />
      <ellipse cx={0.45} cy={-0.85} rx={0.12} ry={0.22} fill="#c9a43c" />
      <path d="M-0.28 0.2 H0.28" stroke="#7a4a20" strokeWidth={0.16} />
    </g>
  ),
  egypt: ({ x, y }) => (
    <g>
      {wheat({ x, y })}
      <path transform={at(x, y)} d="M-0.95 0.95 H0.95" stroke="#4f8fb8" strokeWidth={0.16} />
    </g>
  ),
  han: paddy(false),
  japan: paddy(true),
  maya: ({ x, y }) => (
    // maize
    <g transform={at(x, y)}>
      <path d="M0 0.95 V-0.9" stroke="#5e8a3a" strokeWidth={0.12} />
      <path d="M0 0.3 Q-0.6 0.1 -0.8 -0.3 M0 -0.1 Q0.6 -0.3 0.8 -0.7" stroke="#5e8a3a" strokeWidth={0.12} fill="none" />
      <ellipse cx={0.22} cy={0.05} rx={0.17} ry={0.38} fill="#e9c23b" stroke="#a5821a" strokeWidth={0.06} />
      <path d="M0.08 0.3 Q0.22 0.6 0.36 0.3" fill="#7aa04a" />
    </g>
  ),
  mali: ({ x, y }) => (
    // sorghum / millet
    <g transform={at(x, y)}>
      {[-0.45, 0, 0.45].map((dx) => (
        <g key={dx}>
          <path d={`M${dx} 0.95 V-0.25`} stroke="#7d8a3a" strokeWidth={0.1} />
          <ellipse cx={dx} cy={-0.5} rx={0.17} ry={0.3} fill="#a5532d" />
        </g>
      ))}
    </g>
  ),
};

function glyphFor(civ: CivId, terrain: HexTile['terrain']): Glyph {
  if (terrain === 'forest') return trees[civ];
  if (terrain === 'pasture') return pastures[civ];
  if (terrain === 'fields') return crops[civ];
  return GLYPH[terrain];
}

// ---------------------------------------------------------------------------
// the tile
// ---------------------------------------------------------------------------

interface Sector {
  civ: CivId;
  a0: number;
  a1: number;
}

export function sectorsFor(influence: Influence[], civOf: (p: number) => CivId): Sector[] {
  if (influence.length === 1) return [{ civ: civOf(influence[0].player), a0: 0, a1: TAU }];
  // Every player present gets a clearly visible share (at least ~22%), the rest by influence.
  const total = influence.reduce((n, i) => n + i.weight, 0);
  const raw = influence.map((i) => Math.max(i.weight / total, 0.22));
  const norm = raw.reduce((n, x) => n + x, 0);
  const shares = raw.map((x) => x / norm);
  let a = influence[0].angle - Math.PI * shares[0];
  return influence.map((inf, i) => {
    const span = TAU * shares[i];
    const s = { civ: civOf(inf.player), a0: a, a1: a + span };
    a += span;
    return s;
  });
}

function sectorAt(sectors: Sector[], theta: number): Sector {
  for (const s of sectors) {
    const rel = (((theta - s.a0) % TAU) + TAU) % TAU;
    if (rel < s.a1 - s.a0) return s;
  }
  return sectors[0];
}

const R_TILE = 0.985;
const R_BAND = 0.84;

export function TerritoryTile({ hex, influence, civOf }: { hex: HexTile; influence: Influence[]; civOf: (p: number) => CivId }) {
  const sectors = sectorsFor(influence, civOf);
  const full = sectors.length === 1;
  const base = TERRAIN_FILL[hex.terrain];
  const { x, y } = hex;
  return (
    <g data-territory={influence.map((i) => i.player).join(',')}>
      {sectors.map((s, i) => (
        <path key={`f${i}`} d={full ? hexOutline(x, y, R_TILE) : wedgePath(x, y, R_TILE, s.a0, s.a1)} fill={mix(base, CIVS[s.civ].main, 0.2)} />
      ))}
      {sectors.map((s, i) => (
        <g key={`b${i}`}>
          <path d={ringPath(x, y, R_TILE, R_BAND, s.a0, s.a1, full)} fill={CIVS[s.civ].main} fillRule="evenodd" opacity={0.92} />
          <path d={ringPath(x, y, R_TILE, R_BAND, s.a0, s.a1, full)} fill={`url(#terr-${s.civ})`} fillRule="evenodd" />
        </g>
      ))}
      {!full &&
        sectors.map((s, i) => {
          const [ex, ey] = hexPoint(x, y, R_TILE, s.a0);
          return (
            <g key={`l${i}`}>
              <line x1={x} y1={y} x2={ex} y2={ey} stroke="#2d2416" strokeWidth={0.05} opacity={0.7} />
              <line x1={x} y1={y} x2={ex} y2={ey} stroke="#f4ead2" strokeWidth={0.018} />
            </g>
          );
        })}
      {SPOTS.map(([dx, dy], i) => {
        const civ = sectorAt(sectors, Math.atan2(dy, dx)).civ;
        const G = glyphFor(civ, hex.terrain);
        return <G key={i} x={x + dx * 0.92} y={y + dy * 0.92} />;
      })}
      <path d={hexOutline(x, y, R_TILE)} fill="none" stroke="#5b4a2e" strokeWidth={0.025} />
    </g>
  );
}
