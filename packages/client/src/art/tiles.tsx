import type { CardType, HarborKind, Terrain } from '@pangea/engine';

export const TERRAIN_FILL: Record<Terrain, string> = {
  forest: '#6c8a57',
  pasture: '#a6bf7c',
  fields: '#d9c06a',
  hills: '#bf7c55',
  mountains: '#8d9095',
  desert: '#ddcda2',
};

export const TERRAIN_NAME: Record<Terrain, string> = {
  forest: 'Forest',
  pasture: 'Pasture',
  fields: 'Fields',
  hills: 'Hills',
  mountains: 'Mountains',
  desert: 'Desert',
};

export const SPOTS: [number, number][] = [
  [-0.44, -0.4],
  [0.44, -0.4],
  [-0.58, 0.18],
  [0.58, 0.18],
  [-0.26, 0.6],
  [0.26, 0.6],
];

function Tree({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.16)`}>
      <rect x={-0.12} y={0.5} width={0.24} height={0.45} fill="#4b3a26" />
      <path d="M0 -1 L0.62 0.1 H0.28 L0.8 0.65 H-0.8 L-0.28 0.1 H-0.62 Z" fill="#3f5f39" />
    </g>
  );
}

function Sheep({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.13)`}>
      <ellipse cx={0} cy={0} rx={0.85} ry={0.58} fill="#f6f2e6" stroke="#6d6a5f" strokeWidth={0.12} />
      <ellipse cx={0.82} cy={-0.15} rx={0.3} ry={0.24} fill="#3a3732" />
      <path d="M-0.4 0.5 V0.9 M0.35 0.5 V0.9" stroke="#3a3732" strokeWidth={0.16} />
    </g>
  );
}

function Wheat({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.15)`} stroke="#9c7d25" strokeWidth={0.14} fill="#b8952f">
      {[-0.45, 0, 0.45].map((dx) => (
        <g key={dx}>
          <path d={`M${dx} 0.9 V-0.3`} />
          <ellipse cx={dx} cy={-0.5} rx={0.14} ry={0.32} />
        </g>
      ))}
    </g>
  );
}

function Bricks({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.14)`} fill="#934b2d" stroke="#6b3420" strokeWidth={0.08}>
      <rect x={-0.9} y={0} width={0.85} height={0.42} />
      <rect x={0.05} y={0} width={0.85} height={0.42} />
      <rect x={-0.45} y={-0.5} width={0.85} height={0.42} />
    </g>
  );
}

function Peak({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.2)`}>
      <path d="M-0.9 0.6 L-0.1 -0.8 L0.7 0.6 Z" fill="#62666b" />
      <path d="M-0.1 -0.8 L-0.38 -0.3 L-0.18 -0.4 L-0.02 -0.26 L0.16 -0.42 Z" fill="#f2f2f0" />
      <path d="M0.2 0.6 L0.6 -0.1 L1.0 0.6 Z" fill="#74787d" />
    </g>
  );
}

function Dune({ x, y }: { x: number; y: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(0.2)`}
      d="M-0.9 0.3 Q-0.4 -0.3 0.1 0.3 Q0.5 -0.1 0.9 0.3"
      fill="none"
      stroke="#bea775"
      strokeWidth={0.14}
      strokeLinecap="round"
    />
  );
}

export const GLYPH: Record<Terrain, (p: { x: number; y: number }) => JSX.Element> = {
  forest: Tree,
  pasture: Sheep,
  fields: Wheat,
  hills: Bricks,
  mountains: Peak,
  desert: Dune,
};

export function TileArt({ terrain, x, y }: { terrain: Terrain; x: number; y: number }) {
  const G = GLYPH[terrain];
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      {SPOTS.map(([dx, dy], i) => (
        <G key={i} x={dx} y={dy} />
      ))}
    </g>
  );
}

export function NumberToken({ n, x, y, highlight }: { n: number; x: number; y: number; highlight?: boolean }) {
  const hot = n === 6 || n === 8;
  const pips = 6 - Math.abs(7 - n);
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r={0.3} fill={highlight ? '#fff3c4' : '#f4ead2'} stroke={highlight ? '#c98d12' : '#6b5a3a'} strokeWidth={highlight ? 0.06 : 0.03} />
      <text y={0.06} textAnchor="middle" fontSize={0.27} fontWeight={700} fill={hot ? '#b3202a' : '#2d2416'} fontFamily="Cinzel, serif">
        {n}
      </text>
      {Array.from({ length: pips }, (_, i) => (
        <circle key={i} cx={(i - (pips - 1) / 2) * 0.055} cy={0.18} r={0.02} fill={hot ? '#b3202a' : '#2d2416'} />
      ))}
    </g>
  );
}

export const CARD_COLOR: Record<CardType, string> = {
  brick: '#b5603a',
  lumber: '#4f7a45',
  wool: '#9cc07a',
  grain: '#d9b440',
  ore: '#7d8288',
  paper: '#e9dfc2',
  cloth: '#c98fb6',
  coin: '#e0b84a',
};

export function CardIcon({ type, size = 22 }: { type: CardType | 'any'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-1 -1 2 2" aria-hidden>
      {type === 'any' ? (
        <text y={0.35} textAnchor="middle" fontSize={1} fontWeight={700} fill="#2d2416">?</text>
      ) : (
        <CardGlyph type={type} />
      )}
    </svg>
  );
}

function CardGlyph({ type }: { type: CardType }) {
  switch (type) {
    case 'brick':
      return (
        <g fill="#b5603a" stroke="#6b3420" strokeWidth={0.08}>
          <rect x={-0.85} y={0.05} width={0.8} height={0.45} />
          <rect x={0.05} y={0.05} width={0.8} height={0.45} />
          <rect x={-0.4} y={-0.5} width={0.8} height={0.45} />
        </g>
      );
    case 'lumber':
      return (
        <g>
          <rect x={-0.8} y={-0.32} width={1.5} height={0.64} rx={0.1} fill="#8a5d34" stroke="#4b3220" strokeWidth={0.08} />
          <ellipse cx={0.7} cy={0} rx={0.18} ry={0.32} fill="#d4a86e" stroke="#4b3220" strokeWidth={0.08} />
          <path d="M0.2 -0.32 L0.5 -0.75 L0.6 -0.32" fill="#4f7a45" />
        </g>
      );
    case 'wool':
      return (
        <g>
          <ellipse cx={-0.1} cy={0.05} rx={0.75} ry={0.52} fill="#f6f2e6" stroke="#6d6a5f" strokeWidth={0.08} />
          <ellipse cx={0.62} cy={-0.15} rx={0.28} ry={0.22} fill="#3a3732" />
        </g>
      );
    case 'grain':
      return (
        <g stroke="#9c7d25" strokeWidth={0.1} fill="#d9b440">
          <path d="M0 0.9 V-0.2" />
          <ellipse cx={0} cy={-0.45} rx={0.16} ry={0.38} />
          <ellipse cx={-0.3} cy={-0.1} rx={0.13} ry={0.3} transform="rotate(-30 -0.3 -0.1)" />
          <ellipse cx={0.3} cy={-0.1} rx={0.13} ry={0.3} transform="rotate(30 0.3 -0.1)" />
        </g>
      );
    case 'ore':
      return <path d="M-0.8 0.55 L-0.45 -0.35 L0.1 -0.6 L0.7 -0.2 L0.8 0.55 Z" fill="#7d8288" stroke="#3f4246" strokeWidth={0.09} strokeLinejoin="round" />;
    case 'paper':
      return (
        <g>
          <rect x={-0.55} y={-0.7} width={1.1} height={1.4} rx={0.08} fill="#f3ead2" stroke="#7a6a48" strokeWidth={0.08} />
          <path d="M-0.35 -0.35 H0.35 M-0.35 -0.05 H0.35 M-0.35 0.25 H0.2" stroke="#7a6a48" strokeWidth={0.08} />
        </g>
      );
    case 'cloth':
      return (
        <g>
          <rect x={-0.7} y={-0.5} width={1.4} height={1} rx={0.12} fill="#c98fb6" stroke="#6e3e5e" strokeWidth={0.08} />
          <path d="M-0.7 -0.15 H0.7 M-0.7 0.2 H0.7" stroke="#f2d9ea" strokeWidth={0.09} />
        </g>
      );
    case 'coin':
      return (
        <g>
          <circle r={0.72} fill="#e0b84a" stroke="#7a5a14" strokeWidth={0.1} />
          <circle r={0.45} fill="none" stroke="#7a5a14" strokeWidth={0.07} />
        </g>
      );
  }
}

export function HarborMarker({ kind, x, y, ax, ay, bx, by }: { kind: HarborKind; x: number; y: number; ax: number; ay: number; bx: number; by: number }) {
  return (
    <g pointerEvents="none">
      <path d={`M${ax} ${ay} L${x} ${y} L${bx} ${by}`} fill="none" stroke="#efe3c6" strokeWidth={0.06} strokeDasharray="0.08 0.07" />
      <circle cx={x} cy={y} r={0.27} fill="#f4ead2" stroke="#6b5a3a" strokeWidth={0.03} />
      {kind === 'any' ? (
        <text x={x} y={y + 0.08} textAnchor="middle" fontSize={0.2} fontWeight={700} fill="#2d2416">
          3:1
        </text>
      ) : (
        <>
          <g transform={`translate(${x} ${y - 0.07}) scale(0.13)`}>
            <CardGlyph type={kind} />
          </g>
          <text x={x} y={y + 0.19} textAnchor="middle" fontSize={0.13} fontWeight={700} fill="#2d2416">
            2:1
          </text>
        </>
      )}
    </g>
  );
}

/** Neutral raider longship: dark hull, oxblood/charcoal sail — deliberately unlike any civ's colors. */
export function Longship({ width = 90 }: { width?: number }) {
  return (
    <svg width={width} height={width * 0.6} viewBox="0 0 100 60" aria-label="Barbarian longship" role="img">
      <path d="M49 6 h2.4 v36 h-2.4z" fill="#3a302a" />
      <path d="M28 9 H72 V35 H28 Z" fill="#5d1e1e" stroke="#211b18" strokeWidth={1.5} />
      <path d="M28 15 H72 M28 23 H72 M28 31 H72" stroke="#2c2c31" strokeWidth={3.2} />
      <path d="M4 37 Q20 53 50 53 Q80 53 96 37 L90 33 Q74 44 50 44 Q26 44 10 33 Z" fill="#2b2522" stroke="#151110" strokeWidth={1.2} />
      <path d="M90 35 Q99 22 92 11 Q87 7 83 12 Q90 16 87 25 Z" fill="#2b2522" stroke="#151110" strokeWidth={1.2} />
      <path d="M10 35 Q1 22 8 11 Q13 7 17 12 Q10 16 13 25 Z" fill="#2b2522" stroke="#151110" strokeWidth={1.2} />
      {[24, 34, 44, 56, 66, 76].map((cx) => (
        <circle key={cx} cx={cx} cy={45} r={3.6} fill="#4a4440" stroke="#151110" strokeWidth={0.9} />
      ))}
    </svg>
  );
}
