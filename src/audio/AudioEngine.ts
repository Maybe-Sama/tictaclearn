import type { JingleKind } from '../rhythm/types';

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [0, 2, 4, 7, 9];

/** Rising pentatonic note for combo feedback: every hit climbs a step. */
function pentaNote(step: number): number {
  const s = step < 10 ? Math.max(0, step) : 5 + (step % 5);
  return 72 + 12 * Math.floor(s / 5) + PENTA[s % 5];
}

/**
 * Owns the AudioContext (the master clock of the whole game) and every
 * synthesised sound. Nothing here is sampled: all procedural.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  /** Manual calibration, subtracted from every input timestamp. */
  inputOffsetMs = 0;
  private master: GainNode;
  private music!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private sfx!: GainNode;
  private noiseBuf: AudioBuffer;
  private offsetEst: number | null = null;

  constructor() {
    const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: 'interactive' });
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.002;
    comp.release.value = 0.14;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.resetBuses();
  }

  resume(): Promise<void> {
    return this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume();
  }

  /** Fresh buses per run: anything already scheduled on the old ones is silenced. */
  resetBuses(): void {
    const now = this.ctx.currentTime;
    for (const bus of [this.music, this.sfx]) {
      if (!bus) continue;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0, now, 0.015);
      window.setTimeout(() => bus.disconnect(), 300);
    }
    const oldFilter = this.musicFilter;
    if (oldFilter) window.setTimeout(() => oldFilter.disconnect(), 300);
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.78;
    this.music.connect(this.musicFilter);
    this.sfx = this.bus(0.95);
  }

  /** On a miss the band goes muffled for a moment and opens back up. */
  dip(): void {
    const f = this.musicFilter.frequency;
    const t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(650, t);
    f.exponentialRampToValueAtTime(20000, t + 1.1);
  }

  private bus(v: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(this.master);
    return g;
  }

  /**
   * Maps a performance.now() timestamp to the AudioContext time that was
   * *audible* at that instant (output latency compensated). Inputs and visuals
   * both live on this "heard" clock, so they compare directly against
   * scheduled beat times.
   */
  heardTime(perfMs: number = performance.now()): number {
    const c = this.ctx;
    let raw: number;
    const ts = typeof c.getOutputTimestamp === 'function' ? c.getOutputTimestamp() : null;
    if (ts && ts.contextTime && ts.performanceTime) {
      raw = ts.contextTime - ts.performanceTime / 1000;
    } else {
      raw = c.currentTime - (c.baseLatency || 0) - (c.outputLatency || 0) - performance.now() / 1000;
    }
    if (this.offsetEst === null || Math.abs(raw - this.offsetEst) > 0.05) this.offsetEst = raw;
    else this.offsetEst += (raw - this.offsetEst) * 0.08;
    return perfMs / 1000 + this.offsetEst;
  }

  get latency(): { base: number; output: number } {
    return { base: this.ctx.baseLatency || 0, output: this.ctx.outputLatency || 0 };
  }

  // ---------------------------------------------------------------- building blocks

  private vca(t: number, peak: number, attack: number, decay: number, dest: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  private osc(type: OscillatorType, freq: number, t: number, stop: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(stop);
    return o;
  }

  private tone(type: OscillatorType, freq: number, t: number, decay: number, peak: number, dest: AudioNode = this.sfx, attack = 0.004): OscillatorNode {
    const g = this.vca(t, peak, attack, decay, dest);
    return this.osc(type, freq, t, t + attack + decay + 0.05, g);
  }

  private noise(t: number, decay: number, peak: number, ftype: BiquadFilterType, freq: number, q: number, dest: AudioNode, attack = 0.001): BiquadFilterNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = ftype;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    const g = this.vca(t, peak, attack, decay, dest);
    src.connect(f);
    f.connect(g);
    src.start(t, Math.random() * 0.4);
    src.stop(t + attack + decay + 0.05);
    return f;
  }

  // ---------------------------------------------------------------- band

  kick(t: number, v = 1): void {
    const g = this.vca(t, 0.95 * v, 0.002, 0.34, this.music);
    const o = this.osc('sine', 155, t, t + 0.4, g);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    this.noise(t, 0.012, 0.22 * v, 'lowpass', 3000, 0.7, this.music);
  }

  clap(t: number, v = 1): void {
    for (const dt of [0, 0.011, 0.022]) this.noise(t + dt, 0.018, 0.45 * v, 'bandpass', 1250, 0.9, this.music);
    this.noise(t + 0.032, 0.15, 0.4 * v, 'bandpass', 1150, 0.8, this.music);
  }

  snare(t: number, v = 1): void {
    this.noise(t, 0.13, 0.42 * v, 'bandpass', 1900, 0.6, this.music);
    const g = this.vca(t, 0.28 * v, 0.002, 0.07, this.music);
    const o = this.osc('triangle', 210, t, t + 0.1, g);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.07);
  }

  hat(t: number, v = 0.2, open = false): void {
    this.noise(t, open ? 0.2 : 0.034, v, 'highpass', 7800, 0.8, this.music);
  }

  shaker(t: number, v = 0.09): void {
    this.noise(t, 0.045, v, 'bandpass', 6200, 1.2, this.music, 0.012);
  }

  crash(t: number, v = 0.3): void {
    this.noise(t, 1.3, v, 'highpass', 4800, 0.5, this.music);
    this.noise(t, 0.6, v * 0.5, 'bandpass', 9000, 0.8, this.music);
  }

  bass(t: number, midi: number, dur: number, v = 0.45): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(1200, t);
    f.frequency.exponentialRampToValueAtTime(240, t + Math.max(0.06, dur));
    const g = this.vca(t, v, 0.006, dur, this.music);
    f.connect(g);
    this.osc('sawtooth', mtof(midi), t, t + dur + 0.1, f);
    const sg = this.vca(t, v * 0.8, 0.006, dur, this.music);
    this.osc('sine', mtof(midi), t, t + dur + 0.1, sg);
  }

  stab(t: number, notes: number[], dur = 0.13, v = 0.09): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = this.vca(t, v, 0.004, dur, this.music);
    f.connect(g);
    for (const n of notes) this.osc('square', mtof(n), t, t + dur + 0.1, f);
  }

  pluck(t: number, midi: number, dur = 0.18, v = 0.12, toSfx = false): void {
    const dest = toSfx ? this.sfx : this.music;
    this.tone('triangle', mtof(midi), t, dur, v, dest);
    this.tone('square', mtof(midi), t, dur * 0.45, v * 0.22, dest);
  }

  pad(t: number, notes: number[], dur: number, v = 0.07): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.4);
    f.frequency.exponentialRampToValueAtTime(600, t + dur);
    const g = this.vca(t, v, 0.03, dur, this.music);
    f.connect(g);
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = this.osc('sawtooth', mtof(n), t, t + dur + 0.1, f);
        o.detune.value = det;
      }
    }
  }

  riser(t: number, dur: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(6500, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + dur);
    g.gain.setValueAtTime(0.0001, t + dur + 0.01);
    src.connect(f).connect(g).connect(this.music);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- cues

  /** "tum-tum": the audible count-in before names start landing. */
  tom(t: number, n = 0): void {
    const p = n === 0 ? 1 : 0.8;
    const g = this.vca(t, 0.7, 0.002, 0.26, this.music);
    const o = this.osc('sine', 235 * p, t, t + 0.3, g);
    o.frequency.exponentialRampToValueAtTime(130 * p, t + 0.12);
    this.noise(t, 0.015, 0.15, 'bandpass', 2400, 1, this.music);
  }

  cowbell(t: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 820;
    f.Q.value = 2.5;
    const g = this.vca(t, 0.4, 0.002, 0.2, this.music);
    f.connect(g);
    this.osc('square', 560, t, t + 0.3, f);
    this.osc('square', 835, t, t + 0.3, f);
  }

  whoop(t: number): void {
    const g = this.vca(t, 0.14, 0.01, 0.15, this.sfx);
    const o = this.osc('sine', 320, t, t + 0.22, g);
    o.frequency.exponentialRampToValueAtTime(1100, t + 0.13);
  }

  /** Soft woodblock on each name landing: keeps the pulse audible in silences. */
  tick(t: number): void {
    this.tone('sine', 1250, t, 0.04, 0.06, this.music);
    this.tone('triangle', 2500, t, 0.02, 0.02, this.music);
  }

  // ---------------------------------------------------------------- drums you play

  /** Very soft ghost of the drum line (always scheduled). */
  guide(t: number, offbeat: boolean): void {
    this.tone('sine', offbeat ? 520 : 300, t, 0.05, 0.035, this.music);
  }

  /** The drum the player plays: deep "tum" on the beat, bright "ta" on the "y". */
  drumHit(t: number, offbeat: boolean, bell: boolean, v = 1): void {
    if (bell) {
      this.cowbell(t);
      return;
    }
    const p = offbeat ? 1.45 : 1;
    const g = this.vca(t, 0.75 * v, 0.002, offbeat ? 0.16 : 0.26, this.sfx);
    const o = this.osc('sine', 250 * p, t, t + 0.3, g);
    o.frequency.exponentialRampToValueAtTime(150 * p, t + 0.1);
    this.noise(t, 0.03, 0.28 * v, 'bandpass', offbeat ? 3200 : 1800, 1.2, this.sfx);
  }

  drumMiss(t: number): void {
    this.noise(t, 0.05, 0.18, 'lowpass', 400, 0.7, this.sfx);
  }

  feverOn(t: number): void {
    this.crash(t, 0.35);
    [72, 76, 79, 84, 88, 91].forEach((m, i) => this.pluck(t + i * 0.045, m, 0.3, 0.1, true));
    const g = this.vca(t, 0.12, 0.02, 0.4, this.sfx);
    const o = this.osc('sawtooth', 200, t, t + 0.5, g);
    o.frequency.exponentialRampToValueAtTime(1600, t + 0.35);
  }

  feverOff(t: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    const g = this.vca(t, 0.16, 0.01, 0.45, this.sfx);
    f.connect(g);
    const o = this.osc('sawtooth', 700, t, t + 0.5, f);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.45);
  }

  streak(t: number): void {
    [84, 88, 91, 96].forEach((m, i) => this.tone('sine', mtof(m), t + i * 0.05, 0.25, 0.08));
  }

  /** Calibration metronome. */
  click(t: number, accent: boolean): void {
    this.tone('square', accent ? 1760 : 1320, t, 0.03, accent ? 0.2 : 0.13);
  }

  // ---------------------------------------------------------------- feedback

  stampThunk(t: number, v = 1): void {
    this.noise(t, 0.06, 0.4 * v, 'lowpass', 900, 0.8, this.sfx);
    const g = this.vca(t, 0.45 * v, 0.002, 0.09, this.sfx);
    const o = this.osc('sine', 150, t, t + 0.14, g);
    o.frequency.exponentialRampToValueAtTime(65, t + 0.09);
  }

  perfect(t: number, step: number): void {
    const f = mtof(pentaNote(step));
    this.tone('sine', f, t, 0.5, 0.28);
    this.tone('sine', f * 2, t, 0.26, 0.09);
    this.tone('triangle', f * 1.5, t + 0.055, 0.22, 0.07);
    this.tone('sine', f * 2, t + 0.1, 0.3, 0.06);
  }

  good(t: number, step: number): void {
    const f = mtof(pentaNote(step) - 12);
    this.tone('triangle', f, t, 0.3, 0.22);
    this.tone('sine', f * 2, t, 0.12, 0.05);
  }

  /** Comic "bonk". */
  miss(t: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = this.vca(t, 0.32, 0.003, 0.2, this.sfx);
    f.connect(g);
    const o = this.osc('square', 210, t, t + 0.26, f);
    o.frequency.exponentialRampToValueAtTime(85, t + 0.18);
  }

  /** "uh-oh": you stamped the wrong country. */
  wrong(t: number): void {
    [67, 62].forEach((m, i) => {
      const tt = t + i * 0.12;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1300;
      const g = this.vca(tt, 0.17, 0.01, 0.12, this.sfx);
      f.connect(g);
      const o = this.osc('sawtooth', mtof(m), tt, tt + 0.2, f);
      o.frequency.linearRampToValueAtTime(mtof(m) * 0.94, tt + 0.13);
    });
  }

  whiff(t: number): void {
    this.noise(t, 0.05, 0.07, 'bandpass', 2600, 1, this.sfx);
  }

  jingle(t: number, kind: JingleKind, beatDur: number, n = 0): void {
    const s = beatDur / 4;
    switch (kind) {
      case 'section':
        [72, 76, 79, 84].forEach((m, i) => this.pluck(t + i * s, m, 0.22, 0.13, true));
        break;
      case 'teach': {
        const base = [72, 74, 76, 79][n % 4];
        this.pluck(t, base, 0.2, 0.13, true);
        this.pluck(t + beatDur, base + 5, 0.32, 0.14, true);
        break;
      }
      case 'go':
        this.pluck(t, 67, 0.2, 0.14, true);
        this.pluck(t + s * 2, 72, 0.35, 0.15, true);
        this.whoop(t + s * 2);
        break;
      case 'unlock':
        [72, 76, 79, 84, 88].forEach((m, i) => this.pluck(t + i * s * 0.7, m, 0.25, 0.12, true));
        this.tone('sine', mtof(96), t + 5 * s * 0.7, 0.5, 0.05);
        break;
    }
  }
}
