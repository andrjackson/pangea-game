import { HARBOR_KINDS, TERRAIN_COUNTS, TOKEN_SEQUENCE } from './data';
import { RngHolder, randInt, shuffle } from './rng';
import type { Board, Edge, HarborKind, HexTile, Terrain, Vertex } from './types';

const SQRT3 = Math.sqrt(3);

/** Axial directions for pointy-top hexes; walking 0→5 traces a ring counterclockwise on screen (y down). */
const DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export function hexCenter(q: number, r: number): { x: number; y: number } {
  return { x: SQRT3 * (q + r / 2), y: 1.5 * r };
}

export function hexCorners(x: number, y: number, size = 1): { x: number; y: number }[] {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    out.push({ x: x + size * Math.cos(angle), y: y + size * Math.sin(angle) });
  }
  return out;
}

/** Hexes of a ring of the given radius, starting at the corner for `start` and walking counterclockwise. */
export function ring(radius: number, start: number): [number, number][] {
  if (radius === 0) return [[0, 0]];
  const out: [number, number][] = [];
  const corner = DIRS[(start + 4) % 6];
  let q = corner[0] * radius;
  let r = corner[1] * radius;
  for (let i = 0; i < 6; i++) {
    const d = DIRS[(start + i) % 6];
    for (let j = 0; j < radius; j++) {
      out.push([q, r]);
      q += d[0];
      r += d[1];
    }
  }
  return out;
}

/** Spiral order for the 19-hex island: outer ring, inner ring, center. */
export function spiral(start: number): [number, number][] {
  return [...ring(2, start), ...ring(1, start), ...ring(0, start)];
}

const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;

/** Builds the static graph (vertices, edges) for the given hex layout. */
export function buildGraph(hexes: HexTile[]): { vertices: Vertex[]; edges: Edge[] } {
  const vertices: Vertex[] = [];
  const vIndex = new Map<string, number>();
  const edges: Edge[] = [];
  const eIndex = new Map<string, number>();

  const vertexAt = (x: number, y: number): number => {
    const k = key(x, y);
    let id = vIndex.get(k);
    if (id === undefined) {
      id = vertices.length;
      vertices.push({ id, x: Math.round(x * 1e6) / 1e6, y: Math.round(y * 1e6) / 1e6, hexes: [], edges: [], adj: [], harbor: null });
      vIndex.set(k, id);
    }
    return id;
  };

  for (const hex of hexes) {
    const corners = hexCorners(hex.x, hex.y).map((c) => vertexAt(c.x, c.y));
    for (let i = 0; i < 6; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      if (!vertices[a].hexes.includes(hex.id)) vertices[a].hexes.push(hex.id);
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      let eid = eIndex.get(k);
      if (eid === undefined) {
        eid = edges.length;
        edges.push({ id: eid, a: Math.min(a, b), b: Math.max(a, b), hexes: [] });
        eIndex.set(k, eid);
        vertices[a].edges.push(eid);
        vertices[b].edges.push(eid);
        vertices[a].adj.push(b);
        vertices[b].adj.push(a);
      }
      edges[eid].hexes.push(hex.id);
    }
  }
  return { vertices, edges };
}

export function generateBoard(holder: RngHolder, tokens: 'spiral' | 'balanced' = 'spiral'): Board {
  // 1. Terrain: shuffle and lay into the hexagon (positions in spiral order from corner 0).
  const terrains: Terrain[] = [];
  for (const [t, n] of Object.entries(TERRAIN_COUNTS) as [Terrain, number][]) {
    for (let i = 0; i < n; i++) terrains.push(t);
  }
  const shuffled = shuffle(holder, terrains);
  const positions = spiral(0);
  const hexes: HexTile[] = positions.map(([q, r], i) => {
    const { x, y } = hexCenter(q, r);
    return { id: i, q, r, x, y, terrain: shuffled[i], token: null };
  });

  const { vertices, edges } = buildGraph(hexes);

  // 2. Number tokens.
  if (tokens === 'balanced') placeBalancedTokens(holder, hexes);
  else {
    // Counterclockwise spiral from a random corner, skipping the desert.
    const startCorner = randInt(holder, 6);
    let t = 0;
    for (const [q, r] of spiral(startCorner)) {
      const hex = hexes.find((h) => h.q === q && h.r === r)!;
      if (hex.terrain === 'desert') continue;
      hex.token = TOKEN_SEQUENCE[t++];
    }
  }

  // 3. Harbors: 9 evenly spaced coastal edges (gaps 3,3,4 around the 30-edge coast), random rotation, shuffled kinds.
  const coast = edges
    .filter((e) => e.hexes.length === 1)
    .map((e) => {
      const a = vertices[e.a];
      const b = vertices[e.b];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      return { e, mx, my, angle: Math.atan2(my, mx) };
    })
    .sort((p, q) => p.angle - q.angle);
  const kinds = shuffle(holder, [...HARBOR_KINDS] as HarborKind[]);
  const offset = randInt(holder, coast.length);
  const gaps = [3, 3, 4];
  const harbors = [];
  let pos = offset;
  for (let i = 0; i < 9; i++) {
    const c = coast[pos % coast.length];
    const len = Math.hypot(c.mx, c.my);
    const push = 0.55;
    harbors.push({ kind: kinds[i], edge: c.e.id, x: c.mx + (c.mx / len) * push, y: c.my + (c.my / len) * push });
    vertices[c.e.a].harbor = kinds[i];
    vertices[c.e.b].harbor = kinds[i];
    pos += gaps[i % 3];
  }

  return { hexes, vertices, edges, harbors };
}

export function desertHex(board: Board): number {
  return board.hexes.find((h) => h.terrain === 'desert')!.id;
}

export function hexNeighbors(hexes: HexTile[], hex: HexTile): HexTile[] {
  return DIRS.map(([dq, dr]) => hexes.find((h) => h.q === hex.q + dq && h.r === hex.r + dr)).filter((h): h is HexTile => !!h);
}

/** The rulebook's alternative: tokens placed at random, re-dealt until no two red numbers (6, 8) touch. */
function placeBalancedTokens(holder: RngHolder, hexes: HexTile[]): void {
  const land = hexes.filter((h) => h.terrain !== 'desert');
  for (let attempt = 0; attempt < 10000; attempt++) {
    const tokens = shuffle(holder, TOKEN_SEQUENCE);
    land.forEach((h, i) => (h.token = tokens[i]));
    const red = (h: HexTile) => h.token === 6 || h.token === 8;
    if (!land.some((h) => red(h) && hexNeighbors(hexes, h).some(red))) return;
  }
  throw new Error('could not place balanced tokens');
}
