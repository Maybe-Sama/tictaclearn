import type { AudioEngine } from './AudioEngine';
import type { GrooveId, ScheduledPhrase } from '../rhythm/types';
import type { Rng } from '../util/rng';

interface Chord {
  root: number;
  notes: number[];
}

/**
 * Live mix state, read when each note is created (~120 ms ahead):
 * - level: band layers unlocked by your combo (0 drums+bass ... 3 FEVER).
 * - band / progression / transpose: the song rolled for this session, so two
 *   runs of the same concert don't sound the same.
 */
export interface MusicMix {
  level: number;
  band: number;
  progression: number;
  transpose: number;
}

/** 16-step bar patterns. 'x' = hit. Bass: 'x' root, 'o' octave, '5' fifth. */
interface Pattern {
  kick: string;
  back: string;
  hat: string;
  ohat?: string;
  shaker?: string;
  bass?: string;
  stab?: string;
  lead?: string;
  leadLevel?: number;
  swing: number;
  hatLevel: number;
}

interface Band {
  name: string;
  /** Backbeat voice: clap (pop/latin) or snare (rock/funk). */
  snare?: boolean;
  bassWave: OscillatorType;
  stabWave: OscillatorType;
  leadWave: OscillatorType;
  /** Chord loops that suit this band. */
  progs: number[];
  low: Pattern;
  mid: Pattern;
  high: Pattern;
}

const ch = (root: number, ...notes: number[]): Chord => ({ root, notes });
const C = ch(36, 60, 64, 67);
const G = ch(43, 59, 62, 67);
const Am = ch(45, 60, 64, 69);
const F = ch(41, 60, 65, 69);
const Dm = ch(38, 57, 62, 65);
const Em = ch(40, 59, 64, 67);
const Bb = ch(34, 58, 62, 65);
const Ab = ch(32, 56, 60, 63);
const Eb = ch(39, 58, 63, 67);

/** Chord loops, four bars each. */
const PROGRESSIONS: Chord[][] = [
  [C, G, Am, F],
  [Am, F, C, G],
  [C, Am, F, G],
  [Am, G, F, G],
  [Dm, Bb, F, C],
  [C, Em, F, G],
  [Am, C, G, Em],
  [C, Ab, Eb, Bb],
];

/** Six bands; each plays three intensities that map onto the song sections. */
const BANDS: Band[] = [
  {
    name: 'POP',
    bassWave: 'sawtooth',
    stabWave: 'square',
    leadWave: 'triangle',
    progs: [0, 2, 5],
    low: { kick: 'x.......x.......', back: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.......x.....x.', swing: 0.12, hatLevel: 0.17 },
    mid: { kick: 'x.....x.x.......', back: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x..x....x..x..o.', stab: '..x...x...x...x.', lead: 'x.......x...x...', leadLevel: 0.07, swing: 0.12, hatLevel: 0.19 },
    high: { kick: 'x...x...x...x...', back: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', ohat: '..x...x...x...x.', bass: 'x.o.x.o.x.o.x.o.', stab: 'x..x..x...x..x..', lead: 'xxxxxxxxxxxxxxxx', leadLevel: 0.045, swing: 0.06, hatLevel: 0.2 },
  },
  {
    name: 'FUNK',
    snare: true,
    bassWave: 'square',
    stabWave: 'square',
    leadWave: 'square',
    progs: [3, 6, 0],
    low: { kick: 'x.....x.......x.', back: '....x.......x...', hat: 'x.xxx.x.x.xxx.x.', bass: 'x..x.x..x..x.x..', swing: 0.18, hatLevel: 0.15 },
    mid: { kick: 'x..x..x.....x.x.', back: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', bass: 'x.5..x.ox..x.5.x', stab: '..x..x....x..x..', lead: '....x.......x..x', leadLevel: 0.06, swing: 0.18, hatLevel: 0.15 },
    high: { kick: 'x..x..x.x..x..x.', back: '....x..x....x..x', hat: 'xxxxxxxxxxxxxxxx', ohat: '..x...x...x...x.', bass: 'xo.xo.x.xo.x.o.x', stab: 'x..x..x..x..x..x', lead: 'x.x.x.x.x.x.x.x.', leadLevel: 0.045, swing: 0.16, hatLevel: 0.17 },
  },
  {
    name: 'ROCK',
    snare: true,
    bassWave: 'sawtooth',
    stabWave: 'sawtooth',
    leadWave: 'sawtooth',
    progs: [1, 4, 3],
    low: { kick: 'x.......x.......', back: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.', swing: 0, hatLevel: 0.18 },
    mid: { kick: 'x...x..xx...x...', back: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', bass: 'x.x.x.x.x.x.x.x.', stab: 'x.......x.......', lead: 'x.......x.x.....', leadLevel: 0.06, swing: 0, hatLevel: 0.17 },
    high: { kick: 'x..x.x.xx..x.x.x', back: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', ohat: '....x.......x...', bass: 'x.o.x.o.x.o.x.o.', stab: 'x...x...x...x...', lead: 'x.x.x.x.x.x.x.x.', leadLevel: 0.05, swing: 0, hatLevel: 0.2 },
  },
  {
    name: 'LATINO',
    bassWave: 'sawtooth',
    stabWave: 'square',
    leadWave: 'triangle',
    progs: [1, 3, 6],
    low: { kick: 'x...x...x...x...', back: '...x..x....x..x.', hat: 'x.x.x.x.x.x.x.x.', shaker: '.x.x.x.x.x.x.x.x', bass: 'x.....x...x.....', swing: 0.04, hatLevel: 0.16 },
    mid: { kick: 'x...x...x...x...', back: '...x..x....x..x.', hat: 'x.x.x.x.x.x.x.x.', shaker: 'xxxxxxxxxxxxxxxx', bass: 'x..x..x.x..x..o.', stab: '..x...x...x...x.', lead: 'x..x..x...x.x...', leadLevel: 0.06, swing: 0.04, hatLevel: 0.17 },
    high: { kick: 'x...x..xx...x...', back: '...x..x....x..x.', hat: 'xxxxxxxxxxxxxxxx', ohat: '..x...x...x...x.', shaker: 'xxxxxxxxxxxxxxxx', bass: 'x.o.x..ox.o.x..o', stab: 'x..x..x...x..x..', lead: 'xxxxxxxxxxxxxxxx', leadLevel: 0.045, swing: 0.03, hatLevel: 0.18 },
  },
  {
    name: 'ELECTRO',
    bassWave: 'square',
    stabWave: 'sawtooth',
    leadWave: 'square',
    progs: [7, 1, 6],
    low: { kick: 'x...x...x...x...', back: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.x.x.x.x.x.x.x.', swing: 0, hatLevel: 0.16 },
    mid: { kick: 'x...x...x...x...', back: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.', bass: 'x..x..x.x..x..x.', stab: '..x...x...x...x.', lead: 'x.x.x.x.x.x.x.x.', leadLevel: 0.05, swing: 0, hatLevel: 0.17 },
    high: { kick: 'x...x...x...x...', back: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', ohat: '..x...x...x...x.', bass: 'x.o.x.o.x.o.x.o.', stab: 'x.....x...x.....', lead: 'xxxxxxxxxxxxxxxx', leadLevel: 0.04, swing: 0, hatLevel: 0.19 },
  },
  {
    name: 'CHIP',
    bassWave: 'square',
    stabWave: 'square',
    leadWave: 'square',
    progs: [2, 5, 0],
    low: { kick: 'x.......x.......', back: '....x.......x...', hat: 'x...x...x...x...', bass: 'x...x...x...x...', swing: 0.1, hatLevel: 0.14 },
    mid: { kick: 'x.....x.x.......', back: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.', stab: '..x...x...x...x.', lead: 'x.x.x.x.x.x.x.x.', leadLevel: 0.06, swing: 0.1, hatLevel: 0.15 },
    high: { kick: 'x...x..xx...x...', back: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'xoxoxoxoxoxoxoxo', stab: 'x..x..x...x..x..', lead: 'xxxxxxxxxxxxxxxx', leadLevel: 0.05, swing: 0.08, hatLevel: 0.16 },
  },
];

export const BAND_NAMES = BANDS.map((b) => b.name);

/** Section role -> how hard the band plays. */
const ROLE: Record<Exclude<GrooveId, 'finale'>, 'low' | 'mid' | 'high'> = {
  intro: 'low',
  easy: 'low',
  new: 'mid',
  mix: 'mid',
  dembow: 'mid',
  final: 'high',
};

/** A fresh song for a session: band, chord loop and key. */
export function rollSong(rng: Rng): { band: number; progression: number; transpose: number } {
  return {
    band: rng.int(BANDS.length),
    progression: rng.int(PROGRESSIONS.length),
    transpose: rng.int(7) - 3,
  };
}

function chordAt(mix: MusicMix, band: Band, bar: number): Chord {
  // The chord loop rotates every 8 bars, so long sections keep moving.
  const list = band.progs;
  const prog = PROGRESSIONS[list[(mix.progression + Math.floor(bar / 8)) % list.length]];
  const c = prog[bar % prog.length];
  const t = mix.transpose;
  return { root: c.root + t, notes: c.notes.map((n) => n + t) };
}

type Push = (t: number, fn: (t: number) => void) => void;
const on = (pat: string | undefined, i: number): boolean => !!pat && pat[i] === 'x';

/** Expands one phrase into timed band hits (created lazily by the scheduler). */
export function scheduleMusic(a: AudioEngine, sp: ScheduledPhrase, push: Push, mix: MusicMix): void {
  const p = sp.phrase;
  const band = BANDS[mix.band % BANDS.length];
  if (p.groove === 'finale') {
    scheduleFinale(a, sp, push, mix, band);
    return;
  }
  const g = band[ROLE[p.groove]];
  const step = sp.beatDur / 4;
  const drop = new Set(p.dropBeats ?? []);
  for (let s = 0; s < p.beats * 4; s++) {
    const beat = Math.floor(s / 4);
    if (drop.has(beat)) continue;
    const s16 = s % 16;
    const chord = chordAt(mix, band, Math.floor((sp.globalBeat + beat) / 4));
    const t = sp.start + s * step + (s % 2 === 1 ? g.swing * step : 0);

    if (p.fill && beat === p.beats - 1) {
      const vel = 0.3 + (s % 4) * 0.15;
      push(t, (tt) => a.snare(tt, vel));
      if (s % 4 === 0) push(t, (tt) => a.kick(tt, 0.9));
      continue;
    }
    if (on(g.kick, s16)) push(t, (tt) => a.kick(tt));
    if (on(g.back, s16)) push(t, (tt) => (band.snare ? a.snare(tt, 0.85) : a.clap(tt)));
    if (on(g.hat, s16)) {
      const v = g.hatLevel * (s % 2 === 0 ? (s % 4 === 0 ? 1 : 0.75) : 0.45);
      push(t, (tt) => a.hat(tt, v));
    }
    if (on(g.ohat, s16)) push(t, (tt) => mix.level >= 2 && a.hat(tt, g.hatLevel * 0.8, true));
    if (on(g.shaker, s16)) push(t, (tt) => mix.level >= 2 && a.shaker(tt));
    // FEVER layer: 16th hats + a high sparkle on top.
    if (s % 2 === 1) push(t, (tt) => mix.level >= 3 && a.hat(tt, g.hatLevel * 0.35));
    if (s % 2 === 0) {
      const sparkle = [...chord.notes, chord.notes[1] + 12][(s / 2) % 4] + 24;
      push(t, (tt) => mix.level >= 3 && a.pluck(tt, sparkle, 0.08, 0.035, false, band.leadWave));
    }
    const bc = g.bass?.[s16];
    if (bc && bc !== '.') {
      const m = chord.root + (bc === 'o' ? 12 : bc === '5' ? 7 : 0);
      push(t, (tt) => a.bass(tt, m, step * 1.7, 0.45, band.bassWave));
    }
    if (on(g.stab, s16)) push(t, (tt) => mix.level >= 1 && a.stab(tt, chord.notes, 0.13, 0.09, band.stabWave));
    if (on(g.lead, s16)) {
      const arp = [...chord.notes, chord.notes[0] + 12];
      const m = arp[s % 4] + 12;
      const lv = g.leadLevel ?? 0.06;
      push(t, (tt) => mix.level >= 2 && a.pluck(tt, m, 0.12, lv, false, band.leadWave));
    }
  }
  for (const b of p.crashAt ?? []) push(sp.start + b * sp.beatDur, (tt) => a.crash(tt));
}

/** Big "ta - ta - ta - TAAAN" ending, in the session's key. */
function scheduleFinale(a: AudioEngine, sp: ScheduledPhrase, push: Push, mix: MusicMix, band: Band): void {
  const b = sp.beatDur;
  const t0 = sp.start;
  const k = mix.transpose;
  const chord = [60, 64, 67, 72].map((n) => n + k);
  [0, 1, 2].forEach((i) =>
    push(t0 + i * b, (tt) => {
      a.kick(tt);
      a.stab(tt, chord, 0.18, 0.12, band.stabWave);
      a.bass(tt, 36 + k, b * 0.5, 0.45, band.bassWave);
      if (i === 0) a.crash(tt);
    }),
  );
  push(t0 + 2.5 * b, (tt) => a.snare(tt, 0.7));
  push(t0 + 2.75 * b, (tt) => a.snare(tt, 0.9));
  push(t0 + 3 * b, (tt) => {
    a.kick(tt);
    a.crash(tt, 0.4);
    a.pad(tt, [48, 60, 64, 67, 72, 76].map((n) => n + k), b * 3.5, 0.06);
    a.bass(tt, 36 + k, b * 3, 0.5, band.bassWave);
  });
}
