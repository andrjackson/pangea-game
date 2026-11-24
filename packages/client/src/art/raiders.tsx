import { RAIDERS, type RaiderTheme } from '@pangea/engine';
import { Longship } from './tiles';

/** Raider art for the barbarian track, in a 100×60 box. Neutral, dark palettes unlike any civ. */
export function RaiderArt({ theme, width = 54 }: { theme: RaiderTheme; width?: number }) {
  if (theme === 'vikings') return <Longship width={width} />;
  return (
    <svg width={width} height={width * 0.6} viewBox="0 0 100 60" role="img" aria-label={RAIDERS[theme].name}>
      {theme === 'pirates' && <Pirates />}
      {theme === 'conquistadors' && <Galleon />}
      {theme === 'huns' && <Horde />}
      {theme === 'seaPeoples' && <SeaPeoples />}
    </svg>
  );
}

function Pirates() {
  return (
    <g strokeLinejoin="round">
      <path d="M39 6 h2.4 v34 h-2.4z M63 9 h2.2 v31 h-2.2z" fill="#3a302a" />
      <path d="M27 9 H53 V34 H27 Z" fill="#1c1c20" stroke="#0b0b0d" strokeWidth={1.2} />
      <path d="M55 13 H75 V34 H55 Z" fill="#1c1c20" stroke="#0b0b0d" strokeWidth={1.2} />
      <path d="M33 15 L47 29 M47 15 L33 29" stroke="#e9e4d8" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M41.4 6 L50 3 L41.4 1 Z" fill="#8c1d1d" />
      <path d="M6 38 H94 L86 53 H16 Z" fill="#3b2a1e" stroke="#151110" strokeWidth={1.2} />
      <path d="M6 38 V29 H22 V38" fill="#3b2a1e" stroke="#151110" strokeWidth={1.2} />
      <path d="M12 44 H88" stroke="#6b4b2e" strokeWidth={1.6} />
      {[30, 44, 58, 72].map((x) => (
        <rect key={x} x={x} y={41} width={4} height={3.4} fill="#0b0b0d" />
      ))}
    </g>
  );
}

function Galleon() {
  return (
    <g strokeLinejoin="round">
      <path d="M41 4 h2.4 v32 h-2.4z M61 8 h2.2 v28 h-2.2z M77 12 h2 v24 h-2z" fill="#3a2a1e" />
      <path d="M31 7 H53 V30 H31 Z" fill="#efe6d1" stroke="#3a2a1e" strokeWidth={1.2} />
      <path d="M34 10 L50 27 M50 10 L34 27" stroke="#a8231f" strokeWidth={2.6} strokeLinecap="round" />
      <path d="M55 11 H70 V30 H55 Z" fill="#efe6d1" stroke="#3a2a1e" strokeWidth={1.2} />
      <path d="M79 12 L90 30 H79 Z" fill="#efe6d1" stroke="#3a2a1e" strokeWidth={1.2} />
      <path d="M5 34 H95 L86 52 H17 Z" fill="#5b3a22" stroke="#1f140c" strokeWidth={1.2} />
      <path d="M5 34 V19 H24 V34" fill="#5b3a22" stroke="#1f140c" strokeWidth={1.2} />
      <path d="M9 41 H90" stroke="#b08a3a" strokeWidth={1.8} />
      <path d="M8 24 H21" stroke="#b08a3a" strokeWidth={1.4} />
    </g>
  );
}

function Rider({ x, s }: { x: number; s: number }) {
  return (
    <g transform={`translate(${x} 0) scale(${s})`} fill="#33251c" stroke="#120c08" strokeWidth={1} strokeLinejoin="round">
      <ellipse cx={0} cy={36} rx={17} ry={8} />
      <path d="M13 32 L22 20 L28 22 L26 27 L18 34 Z" />
      <path d="M-12 40 L-16 54 M-6 42 L-4 54 M8 42 L6 54 M13 40 L18 53" stroke="#33251c" strokeWidth={3.4} strokeLinecap="round" fill="none" />
      <path d="M-17 34 Q-26 36 -24 46" stroke="#33251c" strokeWidth={3} fill="none" />
      <path d="M-4 30 L-1 16 L5 16 L6 30 Z" />
      <circle cx={2} cy={12} r={4} />
      <path d="M-3 8 L2 3 L7 8 Z" fill="#6b4a2a" />
      <path d="M10 6 Q18 17 10 28" stroke="#7a5a32" strokeWidth={1.8} fill="none" />
      <path d="M10 6 L10 28" stroke="#d8cdb6" strokeWidth={0.6} />
    </g>
  );
}

function Horde() {
  return (
    <g>
      <Rider x={66} s={0.8} />
      <Rider x={36} s={1} />
      <path d="M2 56 H98" stroke="#4a3a2a" strokeWidth={1.2} strokeDasharray="3 3" />
    </g>
  );
}

function SeaPeoples() {
  return (
    <g strokeLinejoin="round">
      <path d="M49 6 h2.4 v32 h-2.4z" fill="#3a302a" />
      <path d="M31 9 H69 V31 H31 Z" fill="#d9cdb0" stroke="#3a2a1e" strokeWidth={1.2} />
      {[37, 44, 51, 58, 65].map((x) => (
        <path key={x} d={`M${x} 9 V31`} stroke="#8a7a5a" strokeWidth={0.9} />
      ))}
      <path d="M10 38 Q50 52 90 38 L86 33 Q50 44 14 33 Z" fill="#6a4a2c" stroke="#1f140c" strokeWidth={1.2} />
      <path d="M86 34 Q95 25 90 15 Q96 11 100 16 L95 19 Q97 28 89 37 Z" fill="#6a4a2c" stroke="#1f140c" strokeWidth={1.2} />
      <path d="M14 34 Q5 25 10 15 Q4 11 0 16 L5 19 Q3 28 11 37 Z" fill="#6a4a2c" stroke="#1f140c" strokeWidth={1.2} />
      <circle cx={95} cy={15} r={1.2} fill="#120c08" />
      <circle cx={5} cy={15} r={1.2} fill="#120c08" />
      {[28, 40, 60, 72].map((x) => (
        <path key={x} d={`M${x} 37 l-2 -6 l2 2 l2 -2 z`} fill="#c9b27a" stroke="#3a2a1e" strokeWidth={0.6} />
      ))}
    </g>
  );
}
