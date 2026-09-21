import type { AudioEngine } from './AudioEngine';
import type { GrooveId, ScheduledPhrase } from '../rhythm/types';

interface Chord {
  root: number;
  notes: number[];
}

/**
 * Live mix intensity, read when each note is actually created (~120 ms
 * ahead), so the band reacts to your combo almost instantly:
 * 0 = drums + bass, 1 = + chords, 2 = + lead & shakers, 3 = FEVER sparkle.
 */
export interface MusicMix {
  level: number;
}

/** 16-step bar patterns. 'x' = hit. Bass: 'x' root, 'o' octave, '5' fifth. */
interface Groove {
  kick: string;
  clap: string;
  hat: string;
  ohat?: string;
  shaker?: string;
  bass?: string;
  stab?: string;
  lead?: string;
  leadLevel?: number;
  prog: Chord[];
  swing: number;
  hatLevel: number;
}

const C: Chord = { root: 36, notes: [60, 64, 67] };
const G: Chord = { root: 43, notes: [59, 62, 67] };
const Am: Chord = { root: 45, notes: [60, 64, 69] };
const F: Chord = { root: 41, notes: [60, 65, 69] };
const POP = [C, G, Am, F];
const EPIC = [Am, F, C, G];

const GROOVES: Record<Exclude<GrooveId, 'finale'>, Groove> = {
  intro: { kick: 'x.......x.......', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.......x.....x.', prog: POP, swing: 0.12, hatLevel: 0.17 },
  easy: { kick: 'x.....x.x.......', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x..x....x..x..o.', stab: '..x...x...x...x.', prog: POP, swing: 0.14, hatLevel: 0.19 },
  new: { kick: 'x.....x.x.....x.', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', shaker: '.x.x.x.x.x.x.x.x', bass: 'x..x..o.x..x..5.', stab: '..x...x...x...x.', lead: 'x.......x...x...', leadLevel: 0.07, prog: POP, swing: 0.14, hatLevel: 0.19 },
  mix: { kick: 'x..x..x.x.......', clap: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', bass: 'x..x..x...x.x..o', stab: '..x...x...x...x.', lead: 'x..x..x.x..x..x.', leadLevel: 0.055, prog: POP, swing: 0.1, hatLevel: 0.19 },
  dembow: { kick: 'x...x...x...x...', clap: '...x..x....x..x.', hat: 'x.x.x.x.x.x.x.x.', shaker: 'xxxxxxxxxxxxxxxx', bass: 'x..x..x.x..x..o.', stab: '..x...x...x...x.', lead: 'x..x..x...x.x...', leadLevel: 0.06, prog: EPIC, swing: 0.04, hatLevel: 0.17 },
  final: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', ohat: '..x...x...x...x.', bass: 'x.o.x.o.x.o.x.o.', stab: 'x..x..x...x..x..', lead: 'xxxxxxxxxxxxxxxx', leadLevel: 0.045, prog: EPIC, swing: 0.06, hatLevel: 0.2 },
};

type Push = (t: number, fn: (t: number) => void) => void;
const on = (pat: string | undefined, i: number): boolean => !!pat && pat[i] === 'x';

/** Expands one phrase into timed band hits (created lazily by the scheduler). */
export function scheduleMusic(a: AudioEngine, sp: ScheduledPhrase, push: Push, mix: MusicMix): void {
  const p = sp.phrase;
  if (p.groove === 'finale') {
    scheduleFinale(a, sp, push);
    return;
  }
  const g = GROOVES[p.groove];
  const step = sp.beatDur / 4;
  const drop = new Set(p.dropBeats ?? []);
  for (let s = 0; s < p.beats * 4; s++) {
    const beat = Math.floor(s / 4);
    if (drop.has(beat)) continue;
    const s16 = s % 16;
    const chord = g.prog[Math.floor((sp.globalBeat + beat) / 4) % g.prog.length];
    const t = sp.start + s * step + (s % 2 === 1 ? g.swing * step : 0);

    if (p.fill && beat === p.beats - 1) {
      const vel = 0.3 + (s % 4) * 0.15;
      push(t, (tt) => a.snare(tt, vel));
      if (s % 4 === 0) push(t, (tt) => a.kick(tt, 0.9));
      continue;
    }
    if (on(g.kick, s16)) push(t, (tt) => a.kick(tt));
    if (on(g.clap, s16)) push(t, (tt) => a.clap(tt));
    if (on(g.hat, s16)) {
      const v = g.hatLevel * (s % 2 === 0 ? (s % 4 === 0 ? 1 : 0.75) : 0.45);
      push(t, (tt) => a.hat(tt, v));
    }
    if (on(g.ohat, s16)) push(t, (tt) => mix.level >= 2 && a.hat(tt, g.hatLevel * 0.8, true));
    if (on(g.shaker, s16)) push(t, (tt) => mix.level >= 2 && a.shaker(tt));
    // FEVER layer: 16th hats + a high sparkle arpeggio on top.
    if (s % 2 === 1) push(t, (tt) => mix.level >= 3 && a.hat(tt, g.hatLevel * 0.35));
    if (s % 2 === 0) {
      const sp = [...chord.notes, chord.notes[1] + 12][(s / 2) % 4] + 24;
      push(t, (tt) => mix.level >= 3 && a.pluck(tt, sp, 0.08, 0.035));
    }
    const bc = g.bass?.[s16];
    if (bc && bc !== '.') {
      const m = chord.root + (bc === 'o' ? 12 : bc === '5' ? 7 : 0);
      push(t, (tt) => a.bass(tt, m, step * 1.7));
    }
    if (on(g.stab, s16)) push(t, (tt) => mix.level >= 1 && a.stab(tt, chord.notes));
    if (on(g.lead, s16)) {
      const arp = [...chord.notes, chord.notes[0] + 12];
      const m = arp[s % 4] + 12;
      const lv = g.leadLevel ?? 0.06;
      push(t, (tt) => mix.level >= 2 && a.pluck(tt, m, 0.12, lv));
    }
  }
  for (const b of p.crashAt ?? []) push(sp.start + b * sp.beatDur, (tt) => a.crash(tt));
}

/** Big "ta - ta - ta - TAAAN" ending that resolves on C major. */
function scheduleFinale(a: AudioEngine, sp: ScheduledPhrase, push: Push): void {
  const b = sp.beatDur;
  const t0 = sp.start;
  const chord = [60, 64, 67, 72];
  [0, 1, 2].forEach((i) =>
    push(t0 + i * b, (tt) => {
      a.kick(tt);
      a.stab(tt, chord, 0.18, 0.12);
      a.bass(tt, 36, b * 0.5);
      if (i === 0) a.crash(tt);
    }),
  );
  push(t0 + 2.5 * b, (tt) => a.snare(tt, 0.7));
  push(t0 + 2.75 * b, (tt) => a.snare(tt, 0.9));
  push(t0 + 3 * b, (tt) => {
    a.kick(tt);
    a.crash(tt, 0.4);
    a.pad(tt, [48, 60, 64, 67, 72, 76], b * 3.5, 0.06);
    a.bass(tt, 36, b * 3, 0.5);
  });
}
