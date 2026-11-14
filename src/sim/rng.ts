// Seeded RNG. Same seed -> same sequence. No Math.random anywhere in the sim.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive an independent stream (e.g. flavor text/animation) from a seed. */
export function deriveSeed(seed: number, salt: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 15)) >>> 0;
}

export const range = (r: Rng, lo: number, hi: number) => lo + (hi - lo) * r();
export const chance = (r: Rng, p: number) => r() < p;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function weighted<T extends string>(r: Rng, w: Partial<Record<T, number>>): T | null {
  let total = 0;
  for (const k in w) total += Math.max(0, w[k] ?? 0);
  if (total <= 0) return null;
  let x = r() * total;
  let last: T | null = null;
  for (const k in w) {
    const v = Math.max(0, w[k] ?? 0);
    if (v <= 0) continue;
    last = k as T;
    x -= v;
    if (x <= 0) return last;
  }
  return last;
}
