/**
 * Seeded PRNG (mulberry32) for everything the player can feel: which flags come
 * up, which templates the setlist picks, which band plays. One seed per session
 * makes a run replayable — daily challenge, duels, and bug reports that can be
 * reproduced frame for frame.
 */
export class Rng {
  private state: number;

  constructor(readonly seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return n <= 0 ? 0 : Math.floor(this.next() * n);
  }

  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /**
   * Child generator for one subsystem. Derived from the seed alone and never
   * from the consumed state, so systems cannot desync each other by drawing a
   * different number of values or by being created in a different order.
   */
  fork(label: string): Rng {
    let h = (0x811c9dc5 ^ this.seed) >>> 0;
    for (let i = 0; i < label.length; i++) {
      h ^= label.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return new Rng(h >>> 0);
  }
}

export const randomSeed = (): number => Math.floor(Math.random() * 0x100000000) >>> 0;

/** `?seed=` — plain decimal, so a seed copied out of a bug report means one thing only. */
export function parseSeed(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10) >>> 0;
}
