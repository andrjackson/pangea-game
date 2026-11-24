import { CIVS, TRACK_INFO, type CivId, type Track } from '@pangea/engine';

/** Paths in a 100×100 box; ground line at y≈90, centered on x=50. */
interface Shape {
  body: string;
  accent: string;
  dark?: string;
}

interface CivArt {
  settlement: Shape;
  city: Shape;
  shield: string;
  /** Round shields get a central boss. */
  boss?: boolean;
}

export const CIV_ART: Record<CivId, CivArt> = {
  rome: {
    settlement: {
      body: 'M14 58 L50 34 L86 58 Z M20 58 H80 V90 H20 Z',
      accent: 'M26 62 h6 v26 h-6z M40 62 h6 v26 h-6z M54 62 h6 v26 h-6z M68 62 h6 v26 h-6z M44 44 h12 v6 h-12z',
    },
    city: {
      body: 'M38 52 A30 27 0 0 1 96 52 Z M36 52 H96 V90 H36 Z M4 56 L24 38 L44 56 Z M6 56 H42 V90 H6 Z',
      accent: 'M11 60 h5 v28 h-5z M21 60 h5 v28 h-5z M31 60 h5 v28 h-5z M60 25 h14 v6 h-14z M40 52 H94 V57 H40Z',
      dark: 'M58 68 h16 v22 h-16z',
    },
    shield: 'M28 8 H72 Q81 8 81 17 V83 Q81 92 72 92 H28 Q19 92 19 83 V17 Q19 8 28 8Z',
  },
  egypt: {
    settlement: {
      body: 'M10 90 L18 38 H44 L47 90 Z M53 90 L56 38 H82 L90 90 Z M44 54 H56 V90 H44 Z',
      accent: 'M17.5 44 H44.3 V50 H16.6 Z M55.7 44 H82.5 L83.4 50 H55.6 Z M44 54 H56 V60 H44Z',
      dark: 'M46 68 h8 v22 h-8z',
    },
    city: {
      body: 'M2 90 L42 38 L82 90 Z M80 90 V28 L86 14 L92 28 V90 Z',
      accent: 'M42 38 L33.5 49 H50.5 Z M20 66.5 H64 L67 70.5 H17 Z M80 38 H92 V43 H80Z M80 60 H92 V64 H80Z',
    },
    shield: 'M24 32 Q24 8 50 8 Q76 8 76 32 V90 H24 Z',
  },
  han: {
    settlement: {
      body: 'M24 62 H76 V90 H24 Z M3 62 Q28 60 50 38 Q72 60 97 62 L91 69 Q70 65 50 50 Q30 65 9 69 Z',
      accent: 'M28 69 h6 v21 h-6z M66 69 h6 v21 h-6z M46 30 h8 v8 h-8z',
      dark: 'M44 72 h12 v18 h-12z',
    },
    city: {
      body: 'M18 70 H82 V90 H18Z M2 72 Q26 70 50 54 Q74 70 98 72 L92 78 Q72 74 50 62 Q28 74 8 78Z M32 42 H68 V60 H32Z M12 46 Q32 44 50 26 Q68 44 88 46 L82 52 Q66 49 50 36 Q34 49 18 52Z',
      accent: 'M22 78 h5 v12 h-5z M73 78 h5 v12 h-5z M36 50 h4 v10 h-4z M60 50 h4 v10 h-4z M47 14 h6 v13 h-6z',
      dark: 'M43 78 h14 v12 h-14z',
    },
    shield: 'M22 10 H78 V68 L50 92 L22 68 Z',
  },
  maya: {
    settlement: {
      body: 'M12 90 V80 H88 V90 Z M20 80 V70 H80 V80 Z M30 70 V56 H70 V70 Z M24 58 L50 36 L76 58 Z',
      accent: 'M44 70 h12 v20 h-12z M33 52 H67 L63 47 H37Z',
      dark: 'M45 60 h10 v10 h-10z',
    },
    city: {
      body: 'M4 90 V80 H96 V90 Z M12 80 V68 H88 V80 Z M20 68 V56 H80 V68 Z M28 56 V44 H72 V56 Z M36 44 V30 H64 V44 Z M34 30 V24 H66 V30Z',
      accent: 'M43 44 h14 v46 h-14z M38 16 h24 v8 h-24z',
      dark: 'M46 32 h8 v10 h-8z',
    },
    shield: 'M50 6 A44 44 0 1 1 49.9 6 Z',
    boss: true,
  },
  mali: {
    settlement: {
      body: 'M22 90 V56 Q22 48 30 48 H70 Q78 48 78 56 V90 Z M43 48 V36 Q50 28 57 36 V48 Z',
      accent: 'M14 60 h14 v4 h-14z M72 60 h14 v4 h-14z M14 75 h14 v4 h-14z M72 75 h14 v4 h-14z M40 42 h20 v3 h-20z',
      dark: 'M42 70 h16 v20 h-16z',
    },
    city: {
      body: 'M8 90 V44 Q8 34 16 34 Q24 34 24 44 V56 H40 V30 Q40 16 50 16 Q60 16 60 30 V56 H76 V44 Q76 34 84 34 Q92 34 92 44 V90 Z',
      accent: 'M2 52 h12 v3 h-12z M86 52 h12 v3 h-12z M34 40 h12 v3 h-12z M54 40 h12 v3 h-12z M2 70 h12 v3 h-12z M86 70 h12 v3 h-12z M46 6 h8 v12 h-8z',
      dark: 'M42 68 h16 v22 h-16z',
    },
    shield: 'M50 4 C80 6 84 52 50 96 C16 52 20 6 50 4Z',
  },
  norse: {
    settlement: {
      body: 'M8 90 V68 Q50 42 92 68 V90 Z',
      accent: 'M9 68 L1 54 L6 52 L14 64 Z M91 68 L99 54 L94 52 L86 64Z M14 66 Q50 48 86 66 L86 71 Q50 54 14 71Z',
      dark: 'M44 76 h12 v14 h-12z',
    },
    city: {
      body: 'M20 90 V66 H80 V90 Z M8 68 L50 42 L92 68 Z M32 46 V36 H68 V46 Z M22 46 L50 24 L78 46 Z M42 28 V20 H58 V28Z M37 22 L50 6 L63 22 Z',
      accent: 'M9 68 L2 59 L6 56 L14 64Z M91 68 L98 59 L94 56 L86 64Z M23 46 L17 39 L21 36 L28 43Z M77 46 L83 39 L79 36 L72 43Z',
      dark: 'M44 74 h12 v16 h-12z',
    },
    shield: 'M50 6 A44 44 0 1 1 49.9 6 Z',
    boss: true,
  },
  japan: {
    settlement: {
      body: 'M24 64 H76 V90 H24Z M4 70 Q18 66 28 56 L50 32 L72 56 Q82 66 96 70 Z',
      accent: 'M38 40 H62 L57 46 H43Z M28 70 h5 v20 h-5z M67 70 h5 v20 h-5z',
      dark: 'M44 74 h12 v16 h-12z',
    },
    city: {
      body: 'M30 80 H70 V90 H30Z M4 82 Q30 78 50 71 Q70 78 96 82 L89 74 Q70 69 50 63 Q30 69 11 74Z M34 61 H66 V72 H34Z M10 63 Q32 59 50 53 Q68 59 90 63 L83 55 Q68 51 50 45 Q32 51 17 55Z M38 43 H62 V54 H38Z M16 45 Q34 41 50 35 Q66 41 84 45 L77 37 Q64 33 50 27 Q36 33 23 37Z',
      accent: 'M48 4 h4 v24 h-4z M44 12 h12 v3 h-12z M44 19 h12 v3 h-12z',
      dark: 'M45 82 h10 v8 h-10z',
    },
    shield: 'M20 8 H80 V92 H20Z',
  },
  persia: {
    settlement: {
      body: 'M16 56 H84 V90 H16Z M13 49 H87 V56 H13Z M13 49 V42 H22 V49 Z M30 49 V42 H39 V49Z M46 49 V42 H54 V49Z M61 49 V42 H70 V49Z M78 49 V42 H87 V49Z',
      accent: 'M23 58 h6 v32 h-6z M47 58 h6 v32 h-6z M71 58 h6 v32 h-6z',
    },
    city: {
      body: 'M2 90 V80 H98 V90Z M8 80 V44 H92 V80Z M6 37 H94 V44 H6Z M6 37 V30 H15 V37Z M22 37 V30 H31 V37Z M38 37 V30 H47 V37Z M53 37 V30 H62 V37Z M69 37 V30 H78 V37Z M85 37 V30 H94 V37Z',
      accent: 'M14 46 h5 v34 h-5z M28 46 h5 v34 h-5z M42 46 h5 v34 h-5z M56 46 h5 v34 h-5z M70 46 h5 v34 h-5z M82 46 h5 v34 h-5z M36 80 L28 90 H72 L64 80Z',
    },
    shield: 'M8 18 Q50 40 92 18 Q88 72 50 94 Q12 72 8 18Z',
  },
};

const STONE = '#9b9184';
const WALL_PATH =
  'M-4 94 V78 H4 V71 H13 V78 H22 V71 H31 V78 H40 V71 H49 V78 H58 V71 H67 V78 H76 V71 H85 V78 H94 V71 H104 V94 Z';

interface PieceProps {
  civ: CivId;
  x: number;
  y: number;
  /** Rendered width in board units. */
  size?: number;
  dim?: boolean;
}

function frame(x: number, y: number, size: number) {
  const k = size / 100;
  return `translate(${x} ${y}) scale(${k}) translate(-50 -66)`;
}

export function SettlementPiece({ civ, x, y, size = 0.56, dim }: PieceProps) {
  const art = CIV_ART[civ].settlement;
  const c = CIVS[civ];
  return (
    <g transform={frame(x, y, size)} opacity={dim ? 0.5 : 1}>
      <path d={art.body} fill={c.main} stroke={c.ink} strokeWidth={5} strokeLinejoin="round" />
      <path d={art.accent} fill={c.accent} stroke={c.ink} strokeWidth={1.5} strokeLinejoin="round" />
      {art.dark && <path d={art.dark} fill={c.ink} />}
    </g>
  );
}

export function CityPiece({
  civ,
  x,
  y,
  size = 0.74,
  wall,
  metropolis,
  dim,
}: PieceProps & { wall?: boolean; metropolis?: Track | null }) {
  const art = CIV_ART[civ].city;
  const c = CIVS[civ];
  const s = metropolis ? size * 1.12 : size;
  return (
    <g transform={frame(x, y, s)} opacity={dim ? 0.5 : 1}>
      {metropolis && (
        <g>
          <path d="M92 -6 V40" stroke={c.ink} strokeWidth={4} />
          <path d="M92 -6 L118 4 L92 14 Z" fill={TRACK_INFO[metropolis].color} stroke={c.ink} strokeWidth={3} strokeLinejoin="round" />
          <path d="M8 -6 V40" stroke={c.ink} strokeWidth={4} />
          <path d="M8 -6 L-18 4 L8 14 Z" fill={TRACK_INFO[metropolis].color} stroke={c.ink} strokeWidth={3} strokeLinejoin="round" />
        </g>
      )}
      <path d={art.body} fill={c.main} stroke={c.ink} strokeWidth={4.5} strokeLinejoin="round" />
      <path d={art.accent} fill={c.accent} stroke={c.ink} strokeWidth={1.5} strokeLinejoin="round" />
      {art.dark && <path d={art.dark} fill={c.ink} />}
      {wall && (
        <g>
          <path d={WALL_PATH} fill={STONE} stroke={c.ink} strokeWidth={4} strokeLinejoin="round" />
          <path d="M-4 84 H104" stroke={c.accent} strokeWidth={3} />
        </g>
      )}
    </g>
  );
}

export function KnightPiece({ civ, x, y, size = 0.46, level, active }: PieceProps & { level: 1 | 2 | 3; active: boolean }) {
  const art = CIV_ART[civ];
  const c = CIVS[civ];
  const bars = [40, 54, 68].slice(0, level);
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 100}) translate(-50 -50)`}>
      {active && <circle cx={50} cy={50} r={60} fill="none" stroke="#ffd768" strokeWidth={9} opacity={0.95} />}
      <path d={art.shield} fill={active ? c.main : '#d8d2c4'} stroke={c.ink} strokeWidth={6} strokeLinejoin="round" />
      {!active && <path d={art.shield} fill={c.main} opacity={0.35} />}
      {art.boss && <circle cx={50} cy={50} r={9} fill={c.accent} stroke={c.ink} strokeWidth={3} />}
      {bars.map((by) => (
        <path key={by} d={`M30 ${by} L50 ${by - 10} L70 ${by}`} fill="none" stroke={c.accent} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {bars.map((by) => (
        <path key={`o${by}`} d={`M30 ${by} L50 ${by - 10} L70 ${by}`} fill="none" stroke={c.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
      ))}
    </g>
  );
}

export function RoadPiece({ civ, x1, y1, x2, y2 }: { civ: CivId; x1: number; y1: number; x2: number; y2: number }) {
  const c = CIVS[civ];
  // shorten so roads don't overlap intersections
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = 0.18;
  const a = { x: x1 + dx * t, y: y1 + dy * t };
  const b = { x: x2 - dx * t, y: y2 - dy * t };
  return (
    <g strokeLinecap="round">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.ink} strokeWidth={0.2} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.main} strokeWidth={0.13} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.accent} strokeWidth={0.035} strokeDasharray="0.08 0.06" />
    </g>
  );
}

/** A standalone emblem (city on a swatch) for lobby and panels. */
export function CivEmblem({ civ, size = 56 }: { civ: CivId; size?: number }) {
  const c = CIVS[civ];
  return (
    <svg width={size} height={size} viewBox="-1 -1 2 2" aria-label={c.name} role="img">
      <rect x={-1} y={-1} width={2} height={2} rx={0.28} fill={c.accent} opacity={0.22} />
      <CityPiece civ={civ} x={0} y={0.22} size={1.5} />
    </svg>
  );
}

export function PieceSwatch({ civ, kind, size = 34 }: { civ: CivId; kind: 'settlement' | 'city' | 'knight'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-0.6 -0.6 1.2 1.2" aria-hidden>
      {kind === 'settlement' && <SettlementPiece civ={civ} x={0} y={0.1} size={1} />}
      {kind === 'city' && <CityPiece civ={civ} x={0} y={0.12} size={1.05} />}
      {kind === 'knight' && <KnightPiece civ={civ} x={0} y={0} size={0.9} level={2} active />}
    </svg>
  );
}
