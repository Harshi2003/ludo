/** mulberry32 over a state object so game RNG lives inside serializable state. */
export function rand(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (s: { rng: number }, n: number) => Math.floor(rand(s) * n);

export const pick = <T>(s: { rng: number }, arr: readonly T[]): T => arr[randInt(s, arr.length)];

export function shuffle<T>(s: { rng: number }, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function weighted<T extends { weight: number }>(s: { rng: number }, arr: readonly T[]): T {
  const total = arr.reduce((a, b) => a + b.weight, 0);
  let r = rand(s) * total;
  for (const x of arr) if ((r -= x.weight) < 0) return x;
  return arr[arr.length - 1];
}
