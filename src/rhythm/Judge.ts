import type { RhythmEngine } from './RhythmEngine';
import type { Challenge, ChallengeOption, Judgement } from './types';

/** Default timing windows in seconds (|inputTime - scheduledBeatTime|). */
export const WINDOWS = { perfect: 0.08, good: 0.16 };
export type Windows = typeof WINDOWS;

const sideOf = (d: number): 'early' | 'late' => (d < 0 ? 'early' : 'late');

/**
 * Compares inputs against the real scheduled beat times. Each press consumes
 * the single nearest pending token (drum or country), so mashing stamps wrong
 * countries and breaks the combo. Knowledge errors (wrong country on time)
 * are kept apart from rhythm errors (right token, wrong time).
 */
export class Judge {
  lastDeltaMs: number | null = null;

  constructor(
    private engine: RhythmEngine,
    private w: Windows = WINDOWS,
  ) {}

  judgeInput(t: number): Judgement {
    const live = this.engine.challenges.filter((c) => {
      if (c.demo || c.resolved) return false;
      const first = c.options[0];
      const last = c.options[c.options.length - 1];
      // A hold is still live while its body crosses the pad, long after its head time.
      return t >= first.time - c.beatDur * 0.5 && t <= last.time + last.lenBeats * c.beatDur + c.beatDur * 0.5;
    });

    if (live.length === 0) return { kind: 'whiff', grade: 'miss', side: 'center', deltaMs: 0, inputTime: t, drum: false };
    for (const c of live) c.presses++;

    let best: ChallengeOption | null = null;
    let bd = Infinity;
    for (const c of live) {
      for (const o of c.options) {
        if (o.state !== 'pending') continue;
        const d = t - o.time;
        if (Math.abs(d) < Math.abs(bd)) {
          bd = d;
          best = o;
        }
      }
    }

    // Tokens can sit half a beat apart (offbeat drums), so the catch radius is the smaller of half a beat and 0.45 s.
    if (!best || Math.abs(bd) > Math.min(best.beatDur * 0.5, 0.45)) {
      return { kind: 'hit', grade: 'miss', errorKind: 'stray', side: Number.isFinite(bd) ? sideOf(bd) : 'center', deltaMs: Number.isFinite(bd) ? bd * 1000 : 0, inputTime: t, drum: false, challenge: best?.challenge ?? live[0] };
    }

    const c = best.challenge;
    const ad = Math.abs(bd);
    // A hold belongs to the drum family: never a knowledge decision.
    const drum = best.kind !== 'answer';
    this.lastDeltaMs = bd * 1000;

    if (best.kind === 'hold') {
      if (ad <= this.w.good) {
        const j = this.graded(bd, t, best);
        best.state = 'holding';
        best.judgement = j;
        return j;
      }
      // Missed the attack: the note is lost, no sustain is offered.
      best.state = 'broken';
      const j: Judgement = { kind: 'hit', grade: 'miss', errorKind: 'rhythm', side: sideOf(bd), deltaMs: bd * 1000, inputTime: t, drum: true, option: best, challenge: c };
      best.judgement = j;
      return j;
    }

    if (best.correct) {
      if (ad <= this.w.good) {
        const j = this.graded(bd, t, best);
        best.state = 'hit';
        best.judgement = j;
        return j;
      }
      best.state = 'missed';
      const j: Judgement = { kind: 'hit', grade: 'miss', errorKind: 'rhythm', side: sideOf(bd), deltaMs: bd * 1000, inputTime: t, drum, option: best, challenge: c };
      best.judgement = j;
      return j;
    }

    if (ad <= this.w.good) {
      best.state = 'wrong';
      c.wrongPresses++;
      if (best.item) c.wrongItems.push(best.item);
      return { kind: 'hit', grade: 'miss', errorKind: 'knowledge', side: sideOf(bd), deltaMs: bd * 1000, inputTime: t, drum: false, option: best, challenge: c };
    }

    // Off-beat press next to a wrong name: rhythm slip if the right one is close.
    const nearCorrect = c.options.some((o) => o.correct && o.state === 'pending' && Math.abs(t - o.time) <= o.beatDur);
    return { kind: 'hit', grade: 'miss', errorKind: nearCorrect ? 'rhythm' : 'stray', side: sideOf(bd), deltaMs: bd * 1000, inputTime: t, drum: false, challenge: c };
  }

  /** Auto-misses, demo auto-hits and challenge resolution, driven by the heard clock. */
  update(now: number): { judgements: Judgement[]; resolved: Challenge[] } {
    const judgements: Judgement[] = [];
    const resolved: Challenge[] = [];
    for (const c of this.engine.challenges) {
      if (c.resolved) continue;
      for (const o of c.options) {
        if (o.state !== 'pending') continue;
        const drum = o.kind !== 'answer';
        if (c.demo) {
          if (o.correct && now >= o.time) {
            // The band plays a demo hold too: it sustains, then `updateHold` lands it.
            o.state = o.kind === 'hold' ? 'holding' : 'hit';
            judgements.push({ kind: 'demo', grade: 'perfect', side: 'center', deltaMs: 0, inputTime: o.time, drum, option: o, challenge: c });
          } else if (!o.correct && now > o.time + this.w.good) o.state = 'passed';
          continue;
        }
        if (now > o.time + this.w.good) {
          if (o.correct) {
            o.state = 'missed';
            const j: Judgement = drum
              ? { kind: 'auto', grade: 'miss', errorKind: 'rhythm', side: 'late', deltaMs: 0, inputTime: now, drum, option: o, challenge: c }
              : { kind: 'auto', grade: 'miss', errorKind: 'noResponse', side: 'late', deltaMs: 0, inputTime: now, drum, option: o, challenge: c, silent: c.wrongPresses > 0 };
            o.judgement = j;
            judgements.push(j);
          } else o.state = 'passed';
        }
      }
      const last = c.options[c.options.length - 1];
      if (now > last.time + last.lenBeats * c.beatDur + this.w.good + 0.02 && c.options.every((o) => o.state !== 'pending' && o.state !== 'holding')) {
        c.resolved = true;
        resolved.push(c);
      }
    }
    return { judgements, resolved };
  }

  /**
   * Releasing is motorically less precise than pressing, so the tail is
   * deliberately generous: a hold is won on its head and enjoyed on its body.
   */
  get releaseWindow(): number {
    return this.w.good * 1.5;
  }

  /**
   * Per-frame half of a hold: breaks the ones let go too early or held too long.
   * Called from the game loop, which already owns `now` and the key state.
   */
  updateHold(now: number, keyDown: boolean): Judgement[] {
    const out: Judgement[] = [];
    const rw = this.releaseWindow;
    for (const c of this.engine.challenges) {
      if (c.resolved) continue;
      for (const o of c.options) {
        if (o.kind !== 'hold' || o.state !== 'holding') continue;
        if (c.demo) {
          // Nothing to break: the band is playing it.
          if (now >= o.endTime) o.state = 'hit';
          continue;
        }
        const early = !keyDown && now < o.endTime - rw;
        if (!early && !(keyDown && now > o.endTime + rw)) continue;
        o.state = 'broken';
        const j: Judgement = { kind: 'auto', grade: 'miss', errorKind: 'rhythm', side: early ? 'early' : 'late', deltaMs: (now - o.endTime) * 1000, inputTime: now, drum: true, option: o, challenge: c };
        o.releaseJudgement = j;
        out.push(j);
      }
    }
    return out;
  }

  /**
   * A release never goes through `judgeInput()`, so it can never consume another
   * token; and the press that started the hold already took it out of 'pending',
   * so it is never re-judged either. Anything outside the window is left to
   * `updateHold()`, which breaks it.
   */
  release(t: number): Judgement[] {
    const out: Judgement[] = [];
    for (const c of this.engine.challenges) {
      if (c.resolved || c.demo) continue;
      for (const o of c.options) {
        if (o.kind !== 'hold' || o.state !== 'holding') continue;
        const d = t - o.endTime;
        if (Math.abs(d) > this.releaseWindow) continue;
        o.state = 'hit';
        const j = this.gradedRelease(d, t, o);
        o.releaseJudgement = j;
        out.push(j);
      }
    }
    return out;
  }

  /** Next expected country hit (debug). */
  nextExpected(now: number): number | null {
    let best: number | null = null;
    for (const c of this.engine.challenges) {
      for (const o of c.options) {
        if (o.kind === 'answer' && o.correct && o.state === 'pending' && o.time >= now - this.w.good && (best === null || o.time < best)) best = o.time;
      }
    }
    return best;
  }

  private graded(d: number, t: number, option: ChallengeOption): Judgement {
    const ad = Math.abs(d);
    const grade = ad <= this.w.perfect ? 'perfect' : ad <= this.w.good ? 'good' : 'miss';
    const side = ad <= 0.03 ? 'center' : sideOf(d);
    return { kind: 'hit', grade, side, deltaMs: d * 1000, inputTime: t, drum: option.kind !== 'answer', option, challenge: option.challenge };
  }

  /** Same shape as `graded`, on the wider release windows (see `releaseWindow`). */
  private gradedRelease(d: number, t: number, option: ChallengeOption): Judgement {
    const ad = Math.abs(d);
    const grade = ad <= this.w.perfect * 1.5 ? 'perfect' : 'good';
    const side = ad <= 0.045 ? 'center' : sideOf(d);
    return { kind: 'hit', grade, side, deltaMs: d * 1000, inputTime: t, drum: true, option, challenge: option.challenge };
  }
}
