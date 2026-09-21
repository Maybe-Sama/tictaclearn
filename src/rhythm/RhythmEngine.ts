import type { AudioEngine } from '../audio/AudioEngine';
import { scheduleMusic, type MusicMix } from '../audio/Music';
import type { Challenge, ChallengeOption, ChallengeSpec, Phrase, PhraseEvent, ScheduledPhrase, TimedVisual } from './types';

export interface PhraseSource {
  /** Called just before `startTime` so content can adapt to the latest results. */
  next(startTime: number): Phrase | null;
}

/** Audio is created at most this far ahead of the AudioContext clock. */
const LOOKAHEAD = 0.12;
/**
 * A phrase is requested this many beats before its first beat, so tokens
 * that land early in it can already scroll in from the right.
 */
const LEAD_BEATS = 4;
/** The pump only wakes the scheduler; it is never the timing source. */
const PUMP_MS = 25;

/**
 * The conductor. Pulls phrases from the setlist, places them on the
 * AudioContext timeline (beat n of a phrase = start + n * 60/bpm), schedules
 * sample-accurate audio with a short lookahead, and queues visual events
 * that the render loop fires when their *heard* time arrives.
 */
export class RhythmEngine {
  readonly phrases: ScheduledPhrase[] = [];
  readonly challenges: Challenge[] = [];
  songStart = 0;
  songEnd = Infinity;
  sourceDone = false;
  /** Diagnostics: notes that reached the scheduler after their time. */
  lateNotes = 0;
  maxLateMs = 0;
  /**
   * Asked ~120 ms before each drum: should its sound be pre-scheduled on the
   * exact beat? (Yes while the player is in the groove.) Input-triggered sounds
   * always arrive one output-latency late; pre-scheduled ones are sample-accurate.
   */
  prePlay: (o: ChallengeOption) => boolean = () => false;
  private audioQ: { time: number; fn: (t: number) => void }[] = [];
  private visualQ: TimedVisual[] = [];
  private nextStart = 0;
  private globalBeat = 0;
  private phraseCount = 0;
  private challengeCount = 0;
  private timer: number | null = null;
  private lastBeatDur = 0.6;

  constructor(
    private audio: AudioEngine,
    private source: PhraseSource,
    private mix: MusicMix,
  ) {}

  start(at: number): void {
    this.songStart = at;
    this.nextStart = at;
    this.pump();
    this.timer = window.setInterval(() => this.pump(), PUMP_MS);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.audioQ.length = 0;
    this.visualQ.length = 0;
  }

  pump(): void {
    const ctx = this.audio.ctx;
    if (ctx.state !== 'running' || (this.timer === null && this.phraseCount > 0)) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;

    while (!this.sourceDone && this.nextStart - LEAD_BEATS * this.lastBeatDur <= horizon) {
      const p = this.source.next(this.nextStart);
      if (!p) {
        this.sourceDone = true;
        this.songEnd = this.nextStart;
        break;
      }
      this.schedulePhrase(p);
    }

    let n = 0;
    while (n < this.audioQ.length && this.audioQ[n].time < horizon) {
      const e = this.audioQ[n++];
      // If the tab stalled we drop late notes instead of playing them off-beat.
      if (e.time < now) {
        this.lateNotes++;
        this.maxLateMs = Math.max(this.maxLateMs, (now - e.time) * 1000);
      }
      if (e.time >= now - 0.03) e.fn(Math.max(e.time, now));
    }
    if (n) this.audioQ.splice(0, n);

    // Housekeeping.
    for (let i = this.challenges.length - 1; i >= 0; i--) {
      const c = this.challenges[i];
      if (c.resolved && c.options[c.options.length - 1].time < now - 5) this.challenges.splice(i, 1);
    }
    while (this.phrases.length > 2 && this.phrases[0].end < now - 10) this.phrases.shift();
  }

  /** Visual events whose heard time has arrived. */
  pollVisual(now: number): TimedVisual[] {
    let n = 0;
    while (n < this.visualQ.length && this.visualQ[n].time <= now) n++;
    return n ? this.visualQ.splice(0, n) : [];
  }

  phraseAt(t: number): ScheduledPhrase | null {
    for (let i = this.phrases.length - 1; i >= 0; i--) {
      const sp = this.phrases[i];
      if (t >= sp.start && t < sp.end) return sp;
    }
    return null;
  }

  beatInfo(t: number): { sp: ScheduledPhrase; beat: number; globalBeat: number } | null {
    const sp = this.phraseAt(t);
    if (!sp) return null;
    const beat = (t - sp.start) / sp.beatDur;
    return { sp, beat, globalBeat: sp.globalBeat + beat };
  }

  private pushAudio(time: number, fn: (t: number) => void): void {
    this.audioQ.push({ time, fn });
  }

  private schedulePhrase(p: Phrase): void {
    const beatDur = 60 / p.bpm;
    const start = this.nextStart;
    const sp: ScheduledPhrase = { phrase: p, start, end: start + p.beats * beatDur, beatDur, globalBeat: this.globalBeat, index: this.phraseCount++ };
    this.phrases.push(sp);
    this.nextStart = sp.end;
    this.globalBeat += p.beats;
    this.lastBeatDur = beatDur;

    scheduleMusic(this.audio, sp, (t, fn) => this.pushAudio(t, fn), this.mix);

    for (const ev of p.events) {
      const t = start + ev.beat * beatDur;
      this.eventAudio(ev, t, sp);
      if (ev.type !== 'jingle' && ev.type !== 'riser') this.visualQ.push({ time: t, ev, sp });
    }
    for (const spec of p.challenges) this.buildChallenge(spec, sp);

    this.audioQ.sort((a, b) => a.time - b.time);
    this.visualQ.sort((a, b) => a.time - b.time);
  }

  private eventAudio(ev: PhraseEvent, t: number, sp: ScheduledPhrase): void {
    const a = this.audio;
    switch (ev.type) {
      case 'cue':
        this.pushAudio(t, (tt) => (ev.kind === 'double' ? a.cowbell(tt) : a.whoop(tt)));
        break;
      case 'jingle':
        this.pushAudio(t, (tt) => a.jingle(tt, ev.kind, sp.beatDur, ev.n ?? 0));
        break;
      case 'riser':
        this.pushAudio(t, (tt) => a.riser(tt, ev.beats * sp.beatDur));
        break;
      default:
        break;
    }
  }

  private buildChallenge(spec: ChallengeSpec, sp: ScheduledPhrase): void {
    const c: Challenge = {
      id: ++this.challengeCount,
      spec,
      phrase: sp,
      beatDur: sp.beatDur,
      targets: spec.targets,
      options: [],
      correctBeatIndex: [],
      drumCount: 0,
      scheduledStartTime: sp.start,
      expectedHitTimes: [],
      flagTime: spec.flagBeat === null ? null : sp.start + spec.flagBeat * sp.beatDur,
      demo: spec.demo,
      scored: spec.scored,
      hint: spec.hint,
      section: spec.section,
      wrongPresses: 0,
      presses: 0,
      wrongItems: [],
      resolved: false,
    };
    spec.options.forEach((o, i) => {
      const time = sp.start + o.beat * sp.beatDur;
      const offbeat = Math.abs(o.beat - Math.round(o.beat)) > 0.01;
      c.options.push({ challenge: c, index: i, kind: o.kind, item: o.item, correct: o.correct, bell: !!o.bell, offbeat, beat: o.beat, time, beatDur: sp.beatDur, state: 'pending' });
      if (o.kind === 'drum') {
        c.drumCount++;
        // Quiet guide so the drum line stays audible even when you miss it.
        this.pushAudio(time, (tt) => this.audio.guide(tt, offbeat));
        const opt = c.options[c.options.length - 1];
        this.pushAudio(time, (tt) => {
          if (opt.state === 'pending' && (spec.demo || this.prePlay(opt))) {
            opt.prePlayed = true;
            this.audio.drumHit(tt, offbeat, !!o.bell, 1);
          }
        });
        return;
      }
      if (o.correct) {
        c.correctBeatIndex.push(i);
        c.expectedHitTimes.push(time);
      }
      this.pushAudio(time, (tt) => this.audio.tick(tt));
      if (spec.demo && o.correct) {
        this.pushAudio(time, (tt) => {
          this.audio.stampThunk(tt, 0.8);
          this.audio.perfect(tt, 4 + i);
        });
      }
    });
    this.challenges.push(c);
    if (c.flagTime !== null) this.visualQ.push({ time: c.flagTime, ev: { type: 'flag', beat: spec.flagBeat ?? 0, challenge: c }, sp });
  }
}
