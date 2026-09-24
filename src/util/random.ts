import type { Rng } from './rng';

export const randRange = (a: number, b: number, rng: Rng): number => rng.range(a, b);

export const shuffle = <T>(arr: readonly T[], rng: Rng): T[] => rng.shuffle(arr);

export function weightedIndex(weights: number[], rng: Rng): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return rng.int(weights.length);
  let r = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
