/** mulberry32 step: returns [value in [0,1), next state]. */
export function step(state: number): [number, number] {
  let a = (state + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, a];
}

export interface RngHolder {
  rng: number;
}

export function random(holder: RngHolder): number {
  const [v, next] = step(holder.rng);
  holder.rng = next;
  return v;
}

export function randInt(holder: RngHolder, maxExclusive: number): number {
  return Math.floor(random(holder) * maxExclusive);
}

export function shuffle<T>(holder: RngHolder, items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(holder, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
