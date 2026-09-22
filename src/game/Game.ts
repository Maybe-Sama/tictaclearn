import { AudioEngine } from '../audio/AudioEngine';
import type { MusicMix } from '../audio/Music';
import type { ContentPack, LearningItem } from '../content/types';
import type { Action } from '../input/Input';
import { Judge } from '../rhythm/Judge';
import { RhythmEngine } from '../rhythm/RhythmEngine';
import type { Challenge, ChallengeOption, Judgement, TimedVisual } from '../rhythm/types';
import type { DebugPanel } from '../ui/Debug';
import type { Particles } from '../ui/Particles';
import type { CalibrationScreen, Menu, PauseOverlay, ResultsData, ResultsScreen } from '../ui/Screens';
import type { FreeScreen, TourScreen } from '../ui/Hubs';
import { preloadFlags } from '../content/flags';
import { setVoice, silence, voiceEnabled } from '../util/voice';
import { Progress } from './Progress';
import { buildTour, concertUnlocked, nextConcert, starsFor, type ConcertDef, type StageDef } from './Tour';
import type { Stage } from '../ui/Stage';
import { loadBest, loadDifficulty, loadOffset, loadSubject, saveBest, saveDifficulty, saveOffset, saveSubject } from '../util/storage';
import { ChallengeGenerator } from './ChallengeGenerator';
import { DIFFICULTIES, DIFFICULTY_ORDER, DifficultyDirector, type DifficultyId, type DifficultySettings } from './Difficulty';
import { GameState, GameStateMachine, PLAYING_STATES } from './GameStateMachine';
import { LearningTracker, type Outcome } from './LearningTracker';
import { SessionStats } from './SessionStats';
import { Setlist, type LevelId, type SessionPlan } from './Setlist';

export interface GameUI {
  stage: Stage;
  menu: Menu;
  results: ResultsScreen;
  pause: PauseOverlay;
  calib: CalibrationScreen;
  tour: TourScreen;
  free: FreeScreen;
  fx: Particles;
  debug: DebugPanel | null;
}

export interface GameOptions {
  debug: boolean;
  /** Debug bot: 'good' | 'spam' | 'wrong'. */
  autoplay: string | null;
}

/** Band layers you start each section with (combo adds the rest). */
const SECTION_BASE_LAYER: Partial<Record<GameState, number>> = {
  [GameState.RhythmTutorial]: 1,
  [GameState.GuidedPractice]: 1,
  [GameState.FinalGroove]: 1,
};

/** What the current / last session was, so OTRA VEZ and the hub buttons know where to go. */
type Mode = { kind: 'beat'; level: LevelId } | { kind: 'tour'; concert: ConcertDef } | { kind: 'free'; ids: string[] };

interface Calib {
  start: number;
  beatDur: number;
  clicks: number;
  deltas: number[];
  lastBeat: number;
  done: boolean;
}

/** Glue: wires audio clock, rhythm engine, judge, learning model and UI. */
export class Game {
  readonly fsm = new GameStateMachine();
  audio: AudioEngine | null = null;
  engine: RhythmEngine | null = null;
  judge: Judge | null = null;
  tracker: LearningTracker;
  diff: DifficultySettings = DIFFICULTIES.normal;
  dd = new DifficultyDirector(this.diff);
  stats = new SessionStats();
  readonly mix: MusicMix = { level: 1 };
  private level: LevelId = 1;
  private setlist: Setlist | null = null;
  private paused = false;
  private playing = false;
  private resultsAt: number | null = null;
  private resultsShownAt = 0;
  private lastFrame = performance.now();
  private practiceStep = 0;
  private bot: Bot | null = null;
  private calib: Calib | null = null;
  private mode: Mode = { kind: 'beat', level: 1 };
  readonly progress = new Progress();
  private tours = new Map<string, StageDef[]>();

  private pack: ContentPack;

  constructor(
    private packs: ContentPack[],
    private ui: GameUI,
    private opts: GameOptions,
  ) {
    const savedSubject = loadSubject();
    this.pack = packs.find((p) => p.id === savedSubject) ?? packs[0];
    ui.menu.onSubject = (id) => this.setSubject(id);
    ui.menu.setSubject(this.pack);
    ui.stage.pack = this.pack;
    ui.results.pack = this.pack;
    this.tracker = this.newTracker(1);
    const saved = loadDifficulty();
    if (saved && saved in DIFFICULTIES) this.diff = DIFFICULTIES[saved as DifficultyId];
    ui.menu.onDifficulty = (id) => this.setDifficulty(id);
    ui.menu.setDifficulty(this.diff.id);
    this.fsm.onChange((to) => this.onStateChange(to));
    ui.menu.onPlay = () => this.start(1, false);
    ui.menu.onPlay2 = () => this.start(2, false);
    ui.menu.onTour = () => this.openTour();
    ui.menu.onFree = () => this.openFree();
    ui.menu.onVoice = () => this.toggleVoice();
    ui.menu.setVoice(voiceEnabled());
    ui.menu.onCalibrate = () => this.startCalibration();
    ui.tour.onBack = () => this.toMenu();
    ui.tour.onPlay = (c) => this.startConcert(c);
    ui.free.onBack = () => this.toMenu();
    ui.free.onPlay = (ids) => this.startFree(ids);
    ui.results.onAgain = () => this.again();
    ui.results.onRestart = () => this.toHub();
    ui.results.onNext = () => this.nextFromResults();
    ui.pause.onResume = () => this.resume();
    ui.stage.onPause = () => this.pause();
    ui.pause.onRestart = () => this.toHub();
    ui.calib.onDone = () => this.toMenu();
    ui.calib.onRetry = () => this.startCalibration();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    if (opts.autoplay) this.bot = new Bot(opts.autoplay, (t) => this.pressAt(t), () => this.engine);
    this.onStateChange(GameState.Menu);
    requestAnimationFrame(this.frame);
  }

  private newTracker(level: LevelId, carry?: LearningTracker): LearningTracker {
    return new LearningTracker(
      this.pack.levels[level].items.map((id) => this.pack.byId(id)),
      carry,
    );
  }

  setDifficulty(id: DifficultyId): void {
    this.diff = DIFFICULTIES[id];
    saveDifficulty(id);
    this.ui.menu.setDifficulty(id);
    this.ui.menu.show(this.fsm.state === GameState.Menu, loadBest(this.bestKey(1)));
  }

  /** Switch subject (Banderas / Capitales). Only from the menu. */
  setSubject(id: string): void {
    const next = this.packs.find((p) => p.id === id);
    if (!next || next === this.pack) return;
    this.pack = next;
    saveSubject(id);
    this.ui.stage.pack = next;
    this.ui.results.pack = next;
    this.ui.menu.setSubject(next);
    this.ui.menu.setContinue(this.continueText());
    this.tracker = this.newTracker(1);
    this.ui.menu.show(this.fsm.state === GameState.Menu, loadBest(this.bestKey(1)));
  }

  /** Records per subject + groove + difficulty (Banderas keeps its original keys). */
  private bestKey(level: LevelId = this.level): string {
    const base = `${level}-${this.diff.id}`;
    return this.pack.id === 'flags' ? base : `${this.pack.id}-${base}`;
  }

  private ensureAudio(): AudioEngine {
    // Created/resumed inside the user gesture that called us.
    if (!this.audio) {
      this.audio = new AudioEngine();
      // If the phone takes the audio away (call, system sound, speech), pause
      // cleanly instead of letting the song drift; SEGUIR resumes on the beat.
      const ctx = this.audio.ctx;
      ctx.addEventListener('statechange', () => {
        if (this.playing && !this.paused && ctx.state !== 'running') this.pause();
      });
    }
    void this.audio.resume();
    this.audio.resetBuses();
    this.audio.inputOffsetMs = loadOffset();
    return this.audio;
  }

  // ------------------------------------------------------------------ hubs

  tour(): StageDef[] {
    let t = this.tours.get(this.pack.id);
    if (!t) {
      t = buildTour(this.pack);
      this.tours.set(this.pack.id, t);
    }
    return t;
  }

  openTour(stageIdx?: number, focus?: number): void {
    this.stopSong();
    this.ui.tour.open(this.pack, this.tour(), this.progress, stageIdx, focus);
    this.fsm.transition(GameState.Tour);
  }

  openFree(): void {
    this.stopSong();
    this.ui.free.open(this.pack, this.progress);
    this.fsm.transition(GameState.Free);
  }

  /** Where JUGAR will take you: the first unlocked concert you have not passed. */
  private continueText(): string {
    const P = this.pack.id;
    const stages = this.tour();
    const anyPlayed = stages.some((s) => s.concerts.some((c) => this.progress.concert(P, c.id)));
    for (const st of stages) {
      for (const c of st.concerts) {
        if (!this.progress.concert(P, c.id)?.passed && concertUnlocked(stages, this.progress, P, c)) {
          const name = c.final ? 'GRAN FINAL' : (c.theme ?? c.title);
          return anyPlayed ? `Seguir el Beat Tour · ${st.name} · ${name}` : `Beat Tour · empieza en ${st.name}`;
        }
      }
    }
    return 'Beat Tour · ¡gira completada!';
  }

  private toggleVoice(): void {
    setVoice(!voiceEnabled());
    this.ui.menu.setVoice(voiceEnabled());
  }

  /** Back to wherever this session came from. */
  private toHub(): void {
    if (this.mode.kind === 'tour') this.openTour(this.mode.concert.stage.index, this.mode.concert.index);
    else if (this.mode.kind === 'free') this.openFree();
    else this.toMenu();
  }

  private again(): void {
    const m = this.mode;
    if (m.kind === 'tour') this.startConcert(m.concert);
    else if (m.kind === 'free') this.startFree(m.ids);
    else this.start(m.level, true);
  }

  private nextFromResults(): void {
    if (this.mode.kind !== 'tour') return this.again();
    const n = nextConcert(this.mode.concert);
    if (n && concertUnlocked(this.tour(), this.progress, this.pack.id, n)) this.startConcert(n);
    else this.toHub();
  }

  // ------------------------------------------------------------------ flow

  /** Beat 1 / Beat 2 quick play. */
  start(level: LevelId, replay: boolean): void {
    const sameLevel = replay && level === this.level && this.mode.kind === 'beat';
    this.level = level;
    this.mode = { kind: 'beat', level };
    const skipTutorial = replay || this.diff.skipTutorial;
    const first = level === 2 ? GameState.TeachNewFlags : skipTutorial ? GameState.EasyGroove : GameState.RhythmTutorial;
    this.launch(this.newTracker(level, sameLevel ? this.tracker : undefined), { level, skipTutorial }, first);
  }

  /** A Beat Tour concert: new countries + a review of earlier ones from the same stage. */
  startConcert(c: ConcertDef): void {
    this.mode = { kind: 'tour', concert: c };
    const P = this.pack.id;
    const byUrgency = (ids: string[]) => [...ids].sort((a, b) => this.progress.urgency(P, a) - this.progress.urgency(P, b));
    let newItems: LearningItem[] = [];
    let pool: LearningItem[];
    let weak: string[];
    if (c.poolIds.length) {
      pool = c.poolIds.map((id) => this.pack.byId(id));
      weak = byUrgency(c.poolIds.filter((id) => this.progress.mastery(P, id))).slice(0, 6);
    } else {
      newItems = c.newIds.map((id) => this.pack.byId(id));
      const earlier = c.stage.concerts.slice(0, c.index).flatMap((x) => x.newIds);
      const review = byUrgency(earlier).slice(0, 4);
      pool = [...newItems, ...review.map((id) => this.pack.byId(id))];
      weak = review;
    }
    const tracker = new LearningTracker(pool);
    tracker.boost(weak);
    const depth = c.stage.index / 6;
    const plan: SessionPlan = { title: c.stage.name, sub: c.theme ?? c.title, pill: `${c.stage.name} · ${c.final ? 'FINAL' : c.index + 1}`, newItems, pool, params: c.params, final: c.final, depth };
    this.launch(tracker, { level: 1, skipTutorial: true, plan }, newItems.length ? GameState.TeachNewFlags : GameState.MixGroove);
  }

  /** Beat Libre: your own set. Unknown countries get taught first (up to 6). */
  startFree(ids: string[]): void {
    this.mode = { kind: 'free', ids };
    const P = this.pack.id;
    const pool = ids.map((id) => this.pack.byId(id));
    const newItems = pool.filter((i) => this.progress.level(P, i.id) === 'nuevo').slice(0, 6);
    const tracker = new LearningTracker(pool);
    tracker.boost(ids.filter((id) => this.progress.level(P, id) === 'aprendiendo'));
    const n = pool.length;
    const plan: SessionPlan = {
      title: 'BEAT LIBRE',
      sub: `${n} ${this.pack.noun}`,
      pill: 'BEAT LIBRE',
      newItems,
      pool,
      params: { bpm: 104, groove: 'mix', maxTier: 2, quick: true, flash: true, double: true, ghost: 0, budget: Math.max(56, Math.min(112, 40 + 4 * n)) },
      final: n >= 12,
      depth: 0.6,
    };
    this.launch(tracker, { level: 1, skipTutorial: true, plan }, newItems.length ? GameState.TeachNewFlags : GameState.MixGroove);
  }

  private stopSong(): void {
    this.engine?.stop();
    this.audio?.resetBuses();
    silence();
    this.playing = false;
    this.paused = false;
    this.calib = null;
    this.ui.pause.show(false);
  }

  private launch(tracker: LearningTracker, opts: { level: LevelId; skipTutorial: boolean; plan?: SessionPlan }, first: GameState): void {
    const a = this.ensureAudio();
    this.engine?.stop();
    this.calib = null;
    this.tracker = tracker;
    preloadFlags(tracker.all().map((s) => s.id));
    this.stats = new SessionStats(this.diff.feverAt, this.diff.scoreMult);
    this.dd = new DifficultyDirector(this.diff);
    const cg = new ChallengeGenerator(this.tracker, this.pack.items);
    this.setlist = new Setlist(this.pack, cg, this.dd, this.diff, opts);
    this.engine = new RhythmEngine(a, this.setlist, this.mix);
    this.engine.prePlay = (o) => this.inGroove(o);
    this.judge = new Judge(this.engine, this.diff.windows);
    this.ui.stage.setFeverAt(this.diff.feverAt);

    this.paused = false;
    this.resultsAt = null;
    this.practiceStep = 0;
    this.ui.pause.show(false);
    this.ui.calib.show(false);
    this.ui.stage.reset();
    this.fsm.transition(first);
    this.updateMix();
    this.playing = true;
    this.engine.start(a.ctx.currentTime + 0.35);
  }

  /**
   * Every drum is pre-scheduled exactly on its beat, so the drum line is always
   * in time (a press-triggered sound would land one output-latency late, very
   * noticeable on phones). In the groove it plays full; after a miss, softer
   * until you land the next one: you hear the groove drop without losing time.
   */
  private inGroove(o: ChallengeOption): number {
    if (!this.playing || this.paused) return 0;
    const grooving = o.challenge.scored ? this.stats.combo > 0 : this.practiceStep > 0;
    return grooving ? 1 : 0.4;
  }

  toMenu(): void {
    this.stopSong();
    if (this.audio && this.audio.ctx.state === 'suspended') void this.audio.ctx.resume();
    this.fsm.transition(GameState.Menu);
  }

  private pause(): void {
    if (!this.playing || this.paused || !this.audio) return;
    this.paused = true;
    void this.audio.ctx.suspend();
    this.ui.pause.show(true);
  }

  private resume(): void {
    if (!this.paused || !this.audio) return;
    this.paused = false;
    void this.audio.ctx.resume();
    this.ui.pause.show(false);
  }

  private showResults(): void {
    this.playing = false;
    this.resultsAt = null;
    this.engine?.stop();
    silence();
    const P = this.pack.id;
    const all = this.tracker.all();
    // Long-term memory: every session teaches the Leitner boxes something.
    this.progress.recordOutcomes(P, new Map(all.map((s) => [s.id, s.history])));

    const key = this.mode.kind === 'tour' ? `tour-${this.mode.concert.id}-${this.diff.id}` : this.mode.kind === 'free' ? `free-${this.diff.id}` : this.bestKey();
    const best = loadBest(this.mode.kind === 'beat' ? key : `${P}-${key}`);
    const newBest = this.stats.score > best.score;
    saveBest({ score: Math.max(best.score, this.stats.score), combo: Math.max(best.combo, this.stats.maxCombo) }, this.mode.kind === 'beat' ? key : `${P}-${key}`);

    const attempted = all.filter((s) => s.attempts > 0);
    const outcomes = attempted.flatMap((s) => s.history);
    const good = outcomes.filter((o) => o === 'clean' || o === 'rhythm').length;
    const accuracy = outcomes.length ? good / outcomes.length : 0;
    let tour: ResultsData['tour'];
    let level: string;
    if (this.mode.kind === 'tour') {
      const c = this.mode.concert;
      const r = starsFor(accuracy, this.stats.timingPct);
      this.progress.recordConcert(P, c.id, r.stars, r.passed, this.stats.score);
      tour = { stars: r.stars, passed: r.passed, accuracyPct: Math.round(accuracy * 100), hasNext: !!nextConcert(c) };
      level = `BEAT TOUR · ${c.stage.name} · ${c.final ? 'GRAN FINAL' : c.theme ?? c.title} · ${this.diff.label}`;
    } else if (this.mode.kind === 'free') level = `${this.pack.subtitle.toUpperCase()} · BEAT LIBRE · ${this.diff.label}`;
    else level = `${this.pack.subtitle.toUpperCase()} · ${this.pack.levels[this.level].name} · ${this.diff.label}`;

    this.fsm.transition(GameState.Results);
    const byId = (id: string) => this.pack.byId(id);
    this.ui.results.show(true, {
      mode: this.mode.kind,
      tour,
      level,
      suggestion: this.mode.kind === 'beat' ? this.suggestion() : null,
      recognized: this.tracker.recognizedCount(),
      total: this.mode.kind === 'beat' ? this.pack.levels[this.level].items.length : attempted.length,
      timingPct: this.stats.timingPct,
      maxCombo: this.stats.maxCombo,
      perfect: this.stats.perfect,
      good: this.stats.good,
      miss: this.stats.miss,
      score: this.stats.score,
      bestStreak: this.stats.bestPerfectStreak,
      fevers: this.stats.feverCount,
      newBest,
      mastered: this.tracker.mastered().map((s) => byId(s.id)),
      weak: this.tracker.weakest(3).map((s) => byId(s.id)),
    });
    this.resultsShownAt = performance.now();
    if (this.opts.debug) console.table(all.map(({ history, confusedWith, ...s }) => ({ ...s, history: history.join(','), confusedWith: JSON.stringify(confusedWith) })));
  }

  /** Nudge players toward the difficulty that fits them. */
  private suggestion(): string | null {
    const i = DIFFICULTY_ORDER.indexOf(this.diff.id);
    const total = this.pack.levels[this.level].items.length;
    const great = this.stats.timingPct >= 88 && this.tracker.recognizedCount() >= total - 1 && this.stats.miss <= 8;
    const rough = this.stats.timingPct < 55 || this.tracker.recognizedCount() <= total / 2;
    if (great && i < DIFFICULTY_ORDER.length - 1) return `¿Te atreves con ${DIFFICULTIES[DIFFICULTY_ORDER[i + 1]].label}? Cámbialo en el menú`;
    if (rough && i > 0) return `Prueba ${DIFFICULTIES[DIFFICULTY_ORDER[i - 1]].label} para pillarle el beat`;
    return null;
  }

  private onStateChange(to: GameState): void {
    document.body.dataset.section = to;
    // FEVER's night stage belongs to the song only.
    if (!PLAYING_STATES.has(to)) document.body.classList.remove('fever-mode');
    const playing = this.fsm.isPlaying;
    this.ui.menu.show(to === GameState.Menu, loadBest(this.bestKey(1)));
    if (to === GameState.Menu) this.ui.menu.setContinue(this.continueText());
    this.ui.stage.show(playing);
    this.ui.calib.show(to === GameState.Calibration);
    this.ui.tour.show(to === GameState.Tour);
    this.ui.free.show(to === GameState.Free);
    if (to !== GameState.Results) this.ui.results.show(false);
    if (playing) {
      this.ui.stage.setSection(to);
      this.updateMix();
    }
  }

  /** Band intensity = section base, raised by your combo (see SessionStats.layer). */
  private updateMix(): void {
    this.mix.level = Math.max(SECTION_BASE_LAYER[this.fsm.state] ?? 0, this.stats.layer);
  }

  // ------------------------------------------------------------------ calibration

  private startCalibration(): void {
    const a = this.ensureAudio();
    this.engine?.stop();
    this.playing = false;
    const beatDur = 0.6;
    const start = a.ctx.currentTime + 0.6;
    const clicks = 16;
    for (let i = 0; i < clicks; i++) a.click(start + i * beatDur, i % 4 === 0);
    this.calib = { start, beatDur, clicks, deltas: [], lastBeat: -1, done: false };
    if (this.fsm.state === GameState.Calibration) this.ui.calib.show(true);
    else this.fsm.transition(GameState.Calibration);
    this.ui.calib.setStatus('Escucha 4 clics… y luego pulsa ESPACIO con cada clic');
  }

  private calibrationTap(ts: number): void {
    const c = this.calib;
    if (!c || c.done || !this.audio) return;
    const t = this.audio.heardTime(ts);
    const i = Math.round((t - c.start) / c.beatDur);
    if (i < 4 || i >= c.clicks) return;
    const d = (t - (c.start + i * c.beatDur)) * 1000;
    if (Math.abs(d) > 250) return;
    c.deltas.push(d);
    this.ui.calib.tap(d);
  }

  private calibrationFrame(): void {
    const c = this.calib;
    if (!c || c.done || !this.audio) return;
    const now = this.audio.heardTime();
    const i = Math.floor((now - c.start) / c.beatDur);
    if (i !== c.lastBeat && i >= 0 && i < c.clicks) {
      c.lastBeat = i;
      this.ui.calib.beat(i % 4 === 0);
      this.ui.calib.setStatus(i < 4 ? `${4 - i}…` : '¡Pulsa con cada clic!');
    }
    if (now > c.start + c.clicks * c.beatDur + 0.2) {
      c.done = true;
      let offset: number | null = null;
      if (c.deltas.length >= 6) {
        const sorted = [...c.deltas].sort((x, y) => x - y);
        offset = Math.round(sorted[Math.floor(sorted.length / 2)]);
        saveOffset(offset);
        this.audio.inputOffsetMs = offset;
      }
      this.ui.calib.setStatus(offset === null ? '' : 'Guardado. Ya puedes jugar.');
      this.ui.calib.finish(offset);
    }
  }

  // ------------------------------------------------------------------ input

  onAction(action: Action, ts: number): void {
    const s = this.fsm.state;
    if (s === GameState.Menu) {
      if (this.ui.menu.settingsOpen) {
        if (action === 'back' || action === 'confirm') this.ui.menu.closeSettings();
        else if (action === 'prev' || action === 'next') {
          const i = DIFFICULTY_ORDER.indexOf(this.diff.id) + (action === 'next' ? 1 : -1);
          this.setDifficulty(DIFFICULTY_ORDER[Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, i))]);
        }
        return;
      }
      if (action === 'confirm') this.openTour();
      else if (action === 'level1') this.start(1, false);
      else if (action === 'level2') this.start(2, false);
      else if (action === 'free') this.openFree();
      else if (action === 'voice') this.toggleVoice();
      else if (action === 'up' || action === 'down') {
        const i = this.packs.indexOf(this.pack);
        this.setSubject(this.packs[(i + 1) % this.packs.length].id);
      }
      else if (action === 'calibrate') this.startCalibration();
      else if (action === 'prev' || action === 'next') {
        const i = DIFFICULTY_ORDER.indexOf(this.diff.id) + (action === 'next' ? 1 : -1);
        this.setDifficulty(DIFFICULTY_ORDER[Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, i))]);
      }
      return;
    }
    if (s === GameState.Calibration) {
      if (action === 'hit') this.calibrationTap(ts);
      else if (action === 'confirm' || action === 'back') this.toMenu();
      else if (action === 'restart') this.startCalibration();
      return;
    }
    if (s === GameState.Tour) {
      if (action === 'back') this.toMenu();
      else if (action === 'confirm') this.ui.tour.confirm();
      else if (action === 'prev' || action === 'next') this.ui.tour.move(action === 'next' ? 1 : -1, 0);
      else if (action === 'up' || action === 'down') this.ui.tour.move(0, action === 'down' ? 1 : -1);
      return;
    }
    if (s === GameState.Free) {
      if (action === 'back') this.toMenu();
      else if (action === 'confirm') this.ui.free.play();
      return;
    }
    if (s === GameState.Results) {
      if (performance.now() - this.resultsShownAt < 900) return;
      if (action === 'confirm') this.nextFromResults();
      else if (action === 'restart' || action === 'back') this.toHub();
      return;
    }
    if (this.paused) {
      if (action === 'confirm' || action === 'back') this.resume();
      else if (action === 'restart') this.toHub();
      return;
    }
    switch (action) {
      case 'hit':
        this.onHit(ts);
        break;
      case 'back':
        this.pause();
        break;
      case 'skip':
        if (this.opts.debug) this.setlist?.skipSection();
        break;
      case 'offsetUp':
      case 'offsetDown':
        if (this.opts.debug && this.audio) {
          this.audio.inputOffsetMs += action === 'offsetUp' ? 5 : -5;
          saveOffset(this.audio.inputOffsetMs);
        }
        break;
      default:
        break;
    }
  }

  private onHit(ts: number): void {
    if (!this.audio || !this.playing) return;
    const pn = performance.now();
    const evTs = ts > 0 && Math.abs(pn - ts) < 1000 ? ts : pn;
    this.pressAt(this.audio.heardTime(evTs) - this.audio.inputOffsetMs / 1000);
  }

  /** inputTime is on the heard clock, directly comparable to scheduled beat times. */
  private pressAt(inputTime: number): void {
    if (!this.audio || !this.judge || !this.playing || this.paused) return;
    this.ui.stage.stamp();
    const j = this.judge.judgeInput(inputTime);
    // Drums already sound on the beat. The stamp is percussive: only play it when it can land on the
    // beat (you pressed on time or early); a late thunk would flam against the music.
    const hit = j.grade !== 'miss';
    const onBeat = !!j.option && j.option.time >= this.audio.ctx.currentTime;
    if (!j.drum && (!hit || onBeat)) this.audio.stampThunk(this.soundTime(j), 0.8);
    else if (j.drum && !hit) this.audio.stampThunk(this.audio.ctx.currentTime, 0.4);
    this.apply(j);
  }

  /**
   * When to sound a hit: on the exact beat if it is still ahead in the audio
   * clock (you pressed on time or early), otherwise right now.
   */
  private soundTime(j: Judgement): number {
    const now = this.audio!.ctx.currentTime;
    return j.option && j.grade !== 'miss' ? Math.max(now, j.option.time) : now;
  }

  private apply(j: Judgement): void {
    const a = this.audio!;
    const now = a.ctx.currentTime;
    const st = this.ui.stage;
    if (j.kind === 'whiff') {
      a.whiff(now);
      return;
    }
    if (j.kind === 'demo') {
      st.stamp();
      st.feedback(j);
      return;
    }

    const c = j.challenge;
    const scored = !!c?.scored;
    if (j.grade !== 'miss') {
      let step: number;
      if (scored) {
        const ev = this.stats.hit(j.grade, j.drum);
        step = this.stats.combo - 1;
        if (ev.feverStart) {
          a.feverOn(now);
          st.setFever(true);
        }
        if (ev.streak) {
          a.streak(now);
          st.streak(ev.streak);
        }
      } else step = this.practiceStep++;
      const at = this.soundTime(j);
      if (j.drum) {
        // Already pre-scheduled on the beat if you were in the groove.
        if (!j.option?.prePlayed) a.drumHit(at, !!j.option?.offbeat, !!j.option?.bell, j.grade === 'perfect' ? 1 : 0.7);
        if (scored) this.dd.recordDrum(true);
      } else if (j.grade === 'perfect') a.perfect(at, step);
      else a.good(at, step);
      if (!j.drum && c?.section === GameState.GuidedPractice) this.setlist?.notifyPracticeHit();
      st.feedback(j);
      if (scored) {
        st.setCombo(this.stats.combo);
        st.setScore(this.stats.score);
        this.updateMix();
      }
      return;
    }

    if (!j.silent) {
      if (j.drum) a.drumMiss(now);
      else if (j.errorKind === 'knowledge') a.wrong(now);
      else a.miss(now);
      if (scored) {
        const hadCombo = this.stats.combo >= 5;
        const lostFever = this.stats.fail(j.errorKind ?? 'stray');
        if (j.drum) this.dd.recordDrum(false);
        if (hadCombo) a.dip();
        if (lostFever) {
          a.feverOff(now);
          st.setFever(false);
        }
        st.setCombo(0);
        this.updateMix();
      } else this.practiceStep = 0;
    }
    st.feedback(j);
  }

  /** Feed the learning model once a challenge is fully over. */
  private onResolved(c: Challenge, now: number): void {
    if (!c.scored || c.demo) return;
    // Mashing is not "knowing it": more presses than tokens (+1 slack) counts as a guess.
    const mashed = c.presses > c.options.filter((o) => o.correct).length + 1;
    for (const o of c.options) {
      if (o.kind !== 'answer' || !o.correct || !o.item) continue;
      let outcome: Outcome;
      if (o.state === 'hit') outcome = c.wrongPresses > 0 || mashed ? 'hitWithErrors' : 'clean';
      else if (o.judgement?.errorKind === 'rhythm' && !mashed) outcome = 'rhythm';
      else outcome = c.wrongPresses > 0 ? 'knowledge' : 'noResponse';
      this.dd.recordAnswer(outcome);
      if (c.hint) continue;
      const hit = o.state === 'hit' && o.judgement;
      this.tracker.record(o.item, outcome, now, {
        timingErrorMs: hit ? Math.abs(o.judgement!.deltaMs) : undefined,
        grade: hit && o.judgement!.grade !== 'miss' ? (o.judgement!.grade as 'perfect' | 'good') : undefined,
        confusedWith: c.wrongItems.map((i) => i.id),
      });
    }
  }

  // ------------------------------------------------------------------ loop

  private frame = (): void => {
    requestAnimationFrame(this.frame);
    const pn = performance.now();
    const dt = Math.min(0.05, (pn - this.lastFrame) / 1000);
    this.lastFrame = pn;
    if (this.paused) return;
    this.ui.fx.update(dt);
    if (this.calib) this.calibrationFrame();
    const { audio, engine, judge } = this;
    if (!this.playing || !audio || !engine || !judge) return;

    const now = audio.heardTime(pn);
    for (const tv of engine.pollVisual(now)) this.onVisual(tv);
    const { judgements, resolved } = judge.update(now);
    for (const j of judgements) this.apply(j);
    for (const c of resolved) this.onResolved(c, now);
    this.bot?.tick(now);
    this.ui.stage.render(now, engine);

    // Safety net: if the song ran out without an 'end' event, still finish.
    if (this.resultsAt === null && engine.sourceDone && now > engine.songEnd + 1) this.resultsAt = now;
    if (this.resultsAt !== null && now >= this.resultsAt) this.showResults();

    if (this.ui.debug) {
      const info = engine.beatInfo(now);
      const exp = judge.nextExpected(now);
      this.ui.debug.update({
        state: this.fsm.state,
        paused: this.paused,
        bpm: info?.sp.phrase.bpm ?? null,
        songTime: now - engine.songStart,
        beat: info?.globalBeat ?? null,
        phrase: info?.sp.phrase.label ?? '—',
        expected: exp === null ? null : exp - engine.songStart,
        lastDelta: judge.lastDeltaMs,
        latency: audio.latency,
        offset: audio.inputOffsetMs,
        combo: this.stats.combo,
        extra: `${this.diff.id}  late ${engine.lateNotes}  layer ${this.mix.level}  skill ${this.dd.skill.toFixed(2)} (tier ${this.dd.tier})`,
      });
    }
  };

  private onVisual(tv: TimedVisual): void {
    const ev = tv.ev;
    const st = this.ui.stage;
    switch (ev.type) {
      case 'section':
        this.fsm.transition(ev.state);
        if (ev.label) st.setPill(ev.label);
        break;
      case 'flag':
        st.showFlag(ev.challenge.targets, ev.challenge.hint);
        break;
      case 'teach':
        st.showTeach(ev.item);
        break;
      case 'clear':
        st.clearFlag();
        break;
      case 'cover':
        st.coverFlag();
        break;
      case 'text':
        st.showText(ev.text, ev.sub, ev.style, (ev.beats ?? 2) * tv.sp.beatDur);
        break;
      case 'count':
        st.showCount(ev.n);
        break;
      case 'cue':
        st.cue(ev.kind);
        break;
      case 'confetti':
        st.confetti();
        break;
      case 'finale':
        st.finale(this.stats.lastWasHit);
        break;
      case 'end':
        this.resultsAt = tv.time + 1.2;
        break;
      default:
        break;
    }
  }
}

/** Debug autoplayer used to verify full runs (?debug=1&autoplay=good|spam|wrong|drums). */
class Bot {
  private pressed = new WeakSet<ChallengeOption>();
  private jitter = new WeakMap<ChallengeOption, number>();
  private lastSpam = 0;

  constructor(
    private mode: string,
    private press: (t: number) => void,
    private engine: () => RhythmEngine | null,
  ) {}

  tick(now: number): void {
    const e = this.engine();
    if (!e) return;
    if (this.mode === 'spam') {
      if (now - this.lastSpam > 0.09) {
        this.lastSpam = now;
        this.press(now);
      }
      return;
    }
    for (const c of e.challenges) {
      if (c.demo || c.resolved) continue;
      for (const o of c.options) {
        let want: boolean;
        if (o.kind === 'drum') want = true;
        else if (this.mode === 'wrong') want = !o.correct && o.index === (c.correctBeatIndex[0] + 1) % c.options.length;
        else if (this.mode === 'drums') want = false;
        else want = o.correct;
        if (!want || this.pressed.has(o) || o.state !== 'pending') continue;
        let j = this.jitter.get(o);
        if (j === undefined) {
          j = (Math.random() - 0.5) * 0.12;
          this.jitter.set(o, j);
        }
        if (now >= o.time + j) {
          this.pressed.add(o);
          this.press(o.time + j);
        }
      }
    }
  }
}
