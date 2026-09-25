import type { ContentPack, LearningItem, LevelId } from '../content/types';
import type { PhraseSource } from '../rhythm/RhythmEngine';
import type { GrooveId, OptionSpec, Phrase, PhraseEvent } from '../rhythm/types';
import { OFFBEAT_PATTERNS, TEMPLATES, type ChallengeGenerator, type DrumPattern, type TemplateId } from './ChallengeGenerator';
import type { DifficultyDirector, DifficultySettings, Tier } from './Difficulty';
import type { ConcertParams } from './Tour';
import { ARCHETYPE_COPY } from './archetypes';
import { GameState } from './GameStateMachine';
import type { PrimitiveId } from './Progress';
import type { Rng } from '../util/rng';

export type { LevelId };

/**
 * HOLD stays out of the concerts until the sustain passes the touch validation
 * of docs/DESIGN-ARCHETYPES.md §5.4 (`pointercancel` on iOS moves the finger
 * one pixel and breaks the note). Plan B is already decided
 * (ARCHETYPE-ROLLOUT, resolución 5): while this is `false`, DESFILE is the
 * concert of long phrases and low tempo, and JEFE closes on a `tension` where
 * its long note would go. The primitive itself works — `window.__wb.debugHold()`
 * plays it — so flipping this single flag to `true` is all it takes for DESFILE
 * to use `holdIntro()` + `holdRead` and for JEFE to end on a sustain. Nothing
 * else in this file reads the primitive.
 */
const HOLD_IN_CONCERTS = false;

/**
 * E1, the flat pulse: always the first echo round of the player's life
 * (invariant E6 of the design). Everything after it comes from
 * `ChallengeGenerator.echoPattern(tier)`.
 */
const FLAT_ECHO = [0, 1, 2, 3];

interface AdaptiveOpts {
  section: GameState;
  pool: LearningItem[];
  groove: GrooveId;
  /** One tempo per section: the pulse never shifts under the player's feet. */
  bpm: number;
  budget: number;
  allowQuick?: boolean;
  allowFlash?: boolean;
  allowDouble?: boolean;
  ghostChance?: number;
  /** Drop a drum-solo rest halfway through (no flag, no knowledge load). */
  drumBreak?: boolean;
  /** Cap for the adaptive tier (Beat Tour ramps it with tour position). */
  maxTier?: Tier;
  /** Events for the first adaptive phrase (e.g. the section change). */
  firstEvents?: PhraseEvent[];
}

/** A Beat Tour concert or a Beat Libre session. */
export interface SessionPlan {
  title: string;
  sub: string;
  /** Text of the HUD pill during the session. */
  pill: string;
  newItems: LearningItem[];
  pool: LearningItem[];
  params: ConcertParams;
  final: boolean;
  /** 0..1 how far into the tour (drives look-alike distractors). */
  depth: number;
}

export interface SetlistOpts {
  level: LevelId;
  skipTutorial: boolean;
  plan?: SessionPlan;
  /**
   * Was this primitive already taught, in any session? Wired to
   * `Progress.knows()` in `Game.launch()`: a tutorial (and the banner that goes
   * with it) plays once in a lifetime, not once per session.
   */
  taught?: (p: PrimitiveId) => boolean;
  /** Remember that it just played. Wired to `Progress.teach()`. */
  onTaught?: (p: PrimitiveId) => void;
}

/**
 * The session "song": a sequence of short sections, written as generators so
 * each phrase is built just-in-time (a bar ahead) and can react to what the
 * player just did (practice loop, adaptive targets, dynamic difficulty).
 */
export class Setlist implements PhraseSource {
  private sections: (() => Generator<Phrase, void, void>)[];
  private current: Generator<Phrase, void, void> | null = null;
  private i = 0;
  private skipRequested = false;
  private practiceHits = 0;
  /** Mechanics already announced to the player (never a new rule without a cue). */
  private introduced = new Set<string>();
  /** Lifetime memory of the primitives (`Progress`), if the caller wired it. */
  private taughtBefore?: (p: PrimitiveId) => boolean;
  private onTaught?: (p: PrimitiveId) => void;

  constructor(
    private pack: ContentPack,
    private cg: ChallengeGenerator,
    private dd: DifficultyDirector,
    private diff: DifficultySettings,
    private rng: Rng,
    opts: SetlistOpts,
  ) {
    this.taughtBefore = opts.taught;
    this.onTaught = opts.onTaught;
    if (opts.plan) {
      const plan = opts.plan;
      this.sections = [() => this.planned(plan)];
    } else if (opts.level === 2) {
      const intro = pack.levels[2].intro === 'traps' ? () => this.traps() : () => this.twins();
      this.sections = [intro, () => this.mix2(), () => this.final2()];
    } else {
      const all = [() => this.tutorial(), () => this.practice(), () => this.easy(), () => this.teachNew(), () => this.mix(), () => this.final()];
      this.sections = opts.skipTutorial ? all.slice(2) : all;
    }
  }

  next(startTime: number): Phrase | null {
    this.cg.now = startTime;
    while (this.i < this.sections.length) {
      if (this.skipRequested) {
        this.skipRequested = false;
        if (this.current) {
          this.current = null;
          this.i++;
          continue;
        }
      }
      if (!this.current) this.current = this.sections[this.i]();
      const r = this.current.next();
      if (!r.done) return this.adjust(r.value);
      this.current = null;
      this.i++;
    }
    return null;
  }

  /** Apply the difficulty to every phrase: tempo, and no offbeats on FÁCIL. */
  private adjust(p: Phrase): Phrase {
    p.bpm = Math.round(p.bpm * this.diff.bpmScale);
    if (!this.diff.offbeats) {
      for (const c of p.challenges) {
        // Offbeat drums become plain on-beat ones (deduplicated).
        const seen = new Set<number>();
        c.options = c.options.filter((o) => {
          if (o.kind !== 'drum') return true;
          const b = Math.round(o.beat);
          if (seen.has(b) || c.options.some((x) => x.kind === 'answer' && x.beat === b)) return false;
          seen.add(b);
          o.beat = b;
          return true;
        });
      }
      p.events = p.events.filter((e) => !(e.type === 'text' && e.text === '¡CONTRATIEMPO!'));
    }
    return p;
  }

  /** Debug: jump to the next section at the next phrase boundary. */
  skipSection(): void {
    this.skipRequested = true;
  }

  notifyPracticeHit(): void {
    this.practiceHits++;
  }

  // ================================================================== GROOVE 1

  private *tutorial(): Generator<Phrase, void, void> {
    const jp = this.byId('jp');
    const g1 = this.group(1);
    const S = GameState.RhythmTutorial;
    yield {
      label: 'intro',
      bpm: 100,
      beats: 4,
      groove: 'intro',
      crashAt: [0],
      events: [
        { type: 'section', beat: 0, state: S },
        { type: 'clear', beat: 0 },
        { type: 'text', beat: 0, text: 'SIENTE EL RITMO', style: 'title', beats: 3.6 },
      ],
      challenges: [],
    };
    // Tap every drum: you are playing the groove from second 5.
    yield this.cg.drumPhrase(8, [0, 1, 2, 3, 4, 5, 6, 7], {
      bpm: 100,
      groove: 'intro',
      section: S,
      scored: false,
      events: [
        { type: 'text', beat: 0, text: 'GOLPEA CADA TAMBOR', sub: 'ESPACIO · 1 · 2 · 3 · 4', style: 'top', beats: 7.8 },
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((b): PhraseEvent => ({ type: 'count', beat: b, n: (b % 4) + 1 })),
      ],
    });
    const demoText = (text: string, sub: string): PhraseEvent[] => [{ type: 'text', beat: 0, text, sub, style: 'top', beats: 7.6 }];
    yield this.cg.challengePhrase('four', { targets: [jp], pool: g1, demo: true, hint: true, forceCorrect: [2], drums: 'pickup', bpm: 100, groove: 'intro', section: S, events: demoText('MIRA', `tambores… ¡y SOLO su ${this.pack.answerNoun}!`) });
    yield this.cg.challengePhrase('four', { targets: [jp], pool: g1, demo: true, hint: true, forceCorrect: [1], drums: 'pickup', bpm: 100, groove: 'intro', section: S, events: demoText('¡OTRA!', 'lo demás, ni tocarlo') });
    yield this.banner('AHORA TÚ', 100, 'intro', 'go');
  }

  private *practice(): Generator<Phrase, void, void> {
    const jp = this.byId('jp');
    const g1 = this.group(1);
    this.practiceHits = 0;
    for (let n = 0; n < 4 && this.practiceHits < 2; n++) {
      const events: PhraseEvent[] = n === 0 ? [{ type: 'section', beat: 0, state: GameState.GuidedPractice }, { type: 'text', beat: 0, text: `TAMBORES + ${this.pack.answerLabel(jp)}`, style: 'top', beats: 7.6 }] : [];
      yield this.cg.challengePhrase('four', { targets: [jp], pool: g1, hint: true, glow: n === 0, scored: false, maxCorrect: 2, drums: 'pickup', bpm: 100, groove: 'intro', section: GameState.GuidedPractice, events });
    }
    const p = this.banner(this.practiceHits >= 1 ? '¡LO TIENES!' : '¡VAMOS!', 100, 'intro', 'unlock');
    p.events.push({ type: 'confetti', beat: 0 });
    yield p;
  }

  private *easy(): Generator<Phrase, void, void> {
    this.cg.beginSection();
    const g1 = this.group(1);
    const S = GameState.EasyGroove;
    yield this.title('EASY BEAT', `4 ${this.pack.noun}`, S, 100, 'easy');
    yield this.teach(g1, 100, 'easy', 'LA BANDA');
    for (let i = 0; i < 6; i++) {
      yield this.cg.challengePhrase('four', { pool: g1, hint: i < this.diff.hints, drums: i < 3 ? 'pickup' : 'gallop', bpm: 100, groove: 'easy', section: S, events: i === 3 ? this.announce('offbeat') : [] });
    }
  }

  private *teachNew(): Generator<Phrase, void, void> {
    this.cg.beginSection();
    const all = this.levelItems(1);
    const g2 = this.group(2);
    const S = GameState.TeachNewFlags;
    const [de, pt, gb, br] = ['de', 'pt', 'gb', 'br'].map((id) => this.byId(id));
    const c = (t: LearningItem, drums: DrumPattern): Phrase => this.cg.challengePhrase('four', { targets: [t], pool: all, prefer: g2, drums, bpm: 102, groove: 'new', section: S });
    yield this.title('NUEVO BEAT', `4 ${this.pack.noun} más`, S, 102, 'new');
    yield this.teach([de, pt], 102, 'new', '¡NUEVOS EN LA BANDA!');
    yield c(de, 'pickup');
    yield c(pt, 'sync');
    yield this.teach([gb, br], 102, 'new', '¡Y ESTOS DOS!');
    yield c(gb, 'sync');
    yield c(br, 'gallop');
  }

  private *mix(): Generator<Phrase, void, void> {
    yield this.title('MIX BEAT', 'las 8 mezcladas', GameState.MixGroove, 106, 'mix');
    yield* this.adaptive({ section: GameState.MixGroove, pool: this.levelItems(1), groove: 'mix', bpm: 106, budget: 88, allowQuick: true, allowFlash: true, drumBreak: true, ghostChance: this.diff.ghost / 2 });
  }

  private *final(): Generator<Phrase, void, void> {
    const S = GameState.FinalGroove;
    const pool = this.levelItems(1);
    const title = this.title('FINAL BEAT', '¡a por todas!', S, 116, 'final');
    title.events.push({ type: 'riser', beat: 0, beats: 4 });
    yield title;
    if (this.diff.double) yield* this.doubleIntro(pool, 116, 'final', S);
    yield* this.adaptive({ section: S, pool, groove: 'final', bpm: 116, budget: 64, allowQuick: true, allowFlash: true, allowDouble: true, ghostChance: this.diff.ghost });
    yield this.finale(116);
  }

  // ================================================================== GROOVE 2

  private *twins(): Generator<Phrase, void, void> {
    this.cg.beginSection();
    const S = GameState.TeachNewFlags;
    const [it, mx, ie, de, be, fr, nl, pl, id] = ['it', 'mx', 'ie', 'de', 'be', 'fr', 'nl', 'pl', 'id'].map((x) => this.byId(x));
    const bpm = 108;
    const c = (t: LearningItem, pool: LearningItem[], drums: DrumPattern): Phrase => this.cg.challengePhrase('four', { targets: [t], pool: this.levelItems(2), prefer: pool, drums, bpm, groove: 'dembow', section: S });
    yield this.title('BEAT 2', 'banderas gemelas', S, bpm, 'dembow');
    yield c(it, [fr, de], 'sync');
    yield this.teach([mx, ie], bpm, 'dembow', '¿ITALIA? ¡NO TAN RÁPIDO!');
    yield c(mx, [it, ie], 'sync');
    yield c(ie, [it, mx], 'gallop');
    yield c(it, [mx, ie], 'sync');
    yield this.teach([de, be], bpm, 'dembow', 'GIRA ALEMANIA…');
    yield c(be, [de, it], 'gallop');
    yield c(de, [be, fr], 'sync');
    yield this.teach([pl, id], bpm, 'dembow', '¿ARRIBA O ABAJO?');
    yield c(pl, [id, nl], 'sync');
    yield c(id, [pl, nl], 'gallop');
    yield this.teach([fr, nl], bpm, 'dembow', '¡FRANCIA TUMBADA!');
    yield c(nl, [fr, pl], 'gallop');
  }

  /** Capitales trampa: the famous city is right there on the lane, tempting you. */
  private *traps(): Generator<Phrase, void, void> {
    this.cg.beginSection();
    const S = GameState.TeachNewFlags;
    const pool = this.levelItems(2);
    const [au, ca, tr, ch, ma, us, nl, ind] = ['au', 'ca', 'tr', 'ch', 'ma', 'us', 'nl', 'in'].map((x) => this.byId(x));
    const bpm = 108;
    const c = (t: LearningItem, drums: DrumPattern): Phrase => this.cg.challengePhrase('four', { targets: [t], pool, drums, bpm, groove: 'dembow', section: S });
    yield this.title('BEAT 2', 'capitales trampa', S, bpm, 'dembow');
    yield this.teach([au, ca], bpm, 'dembow', '¡LA FAMOSA NO ES LA CAPITAL!');
    yield c(au, 'sync');
    yield c(ca, 'sync');
    yield this.teach([tr, ch], bpm, 'dembow', 'NI ESTAMBUL NI ZÚRICH…');
    yield c(tr, 'gallop');
    yield c(ch, 'sync');
    yield c(au, 'gallop');
    yield this.teach([ma, us], bpm, 'dembow', 'NI CASABLANCA NI NUEVA YORK…');
    yield c(ma, 'sync');
    yield c(us, 'gallop');
    yield this.teach([nl, ind], bpm, 'dembow', '¡OJO CON ESTAS DOS!');
    yield c(nl, 'sync');
    yield c(ind, 'gallop');
  }

  private *mix2(): Generator<Phrase, void, void> {
    const lv = this.pack.levels[2];
    yield this.title(lv.mixTitle ?? 'MIX BEAT', lv.mixSub ?? '', GameState.MixGroove, 112, 'dembow');
    if (this.diff.double) yield* this.doubleIntro(this.levelItems(2), 112, 'dembow', GameState.MixGroove);
    yield* this.adaptive({ section: GameState.MixGroove, pool: this.levelItems(2), groove: 'dembow', bpm: 112, budget: 96, allowQuick: true, allowFlash: true, allowDouble: true, drumBreak: true, ghostChance: this.diff.ghost / 2 });
  }

  private *final2(): Generator<Phrase, void, void> {
    const S = GameState.FinalGroove;
    const pool = this.levelItems(2);
    const title = this.title('FINAL BEAT', this.pack.levels[2].finalSub ?? '¡a por todas!', S, 120, 'final');
    title.events.push({ type: 'riser', beat: 0, beats: 4 });
    yield title;
    const blind = this.diff.id !== 'facil';
    if (blind) yield this.cg.drumPhrase(8, [0, 1, 1.5, 2, 3, 4, 5, 5.5, 6, 7], {
      bpm: 120,
      groove: 'final',
      section: S,
      ghost: true,
      events: [{ type: 'text', beat: 0, text: '¡A CIEGAS!', sub: 'siente el pulso', style: 'top', beats: 7.6 }],
    });
    this.introduced.add('ghost');
    yield* this.adaptive({ section: S, pool, groove: 'final', bpm: 120, budget: 72, allowQuick: true, allowFlash: true, allowDouble: true, ghostChance: blind ? Math.max(0.4, this.diff.ghost) : 0 });
    yield this.finale(120);
  }

  // ================================================================== BEAT TOUR / BEAT LIBRE

  /**
   * A concert is a dispatcher (docs/DESIGN-ARCHETYPES.md §3.4 point 5):
   *
   *     title → (presentation, only if there are new items) → body → finale
   *
   * The body is what the archetype owns; `adaptive()` is the tool it uses to
   * fill its free stretches, not the shape of the concert.
   */
  private *planned(pl: SessionPlan): Generator<Phrase, void, void> {
    this.cg.beginSection();
    this.cg.lookalikeRate = 0.25 + 0.5 * pl.depth;
    const P = pl.params;
    const title = this.title(pl.title, pl.sub, pl.newItems.length ? GameState.TeachNewFlags : GameState.MixGroove, P.bpm, P.groove, pl.pill);
    // The boss announces itself with the riser, which is sound and not text (§2.6).
    if (P.archetype === 'jefe') title.events.push({ type: 'riser', beat: 0, beats: 4 });
    yield title;
    if (pl.newItems.length) yield* this.presentation(pl);
    yield* this.body(pl);
    yield this.finale(P.bpm);
  }

  /**
   * PRESENTATION (§2.0), the same block it has always been: teach two, play each
   * one right away (interleaved practice). 4 new items = 40 beats, 5 = 48.
   */
  private *presentation(pl: SessionPlan): Generator<Phrase, void, void> {
    const P = pl.params;
    const S = GameState.TeachNewFlags;
    const drums: DrumPattern = P.maxTier === 0 ? 'pickup' : 'sync';
    for (let i = 0; i < pl.newItems.length; i += 2) {
      const pair = pl.newItems.slice(i, i + 2);
      yield this.teach(pair, P.bpm, P.groove, i === 0 ? '¡NUEVOS EN LA GIRA!' : '¡Y AHORA ESTOS!');
      for (const t of pair) yield this.cg.challengePhrase('four', { targets: [t], pool: pl.pool, drums, bpm: P.bpm, groove: P.groove, section: S });
    }
  }

  /** The section change rides the first phrase of the body, whatever it is. */
  private *body(pl: SessionPlan): Generator<Phrase, void, void> {
    let first = true;
    for (const p of this.archetypeBody(pl)) {
      if (first) {
        first = false;
        p.events.unshift({ type: 'section', beat: 0, state: GameState.MixGroove, label: pl.pill });
      }
      yield p;
    }
  }

  /** One generator per archetype, with the structures of §2.1-2.6. */
  private *archetypeBody(pl: SessionPlan): Generator<Phrase, void, void> {
    switch (pl.params.archetype) {
      case 'carrera':
        yield* this.carrera(pl);
        return;
      case 'eco':
        yield* this.eco(pl);
        return;
      case 'memoria':
        yield* this.memoria(pl);
        return;
      case 'desfile':
        yield* this.desfile(pl);
        return;
      case 'jefe':
        yield* this.jefe(pl);
        return;
      default:
        yield* this.escuela(pl);
        return;
    }
  }

  /**
   * ESCUELA (§2.1) — *the band introduces its new members.* The baseline, and
   * the only archetype with no mechanic of its own: one extra phrase per pair
   * where the two freshly taught items are each other's distractors, then a calm
   * adaptive stretch capped at tier 1. No bursts, no flash, no ghosts, no echo,
   * no holds: this is where countries are learned, not mechanics.
   */
  private *escuela(pl: SessionPlan): Generator<Phrase, void, void> {
    const P = pl.params;
    const base = this.bodyBase(pl);
    let mixed = 0;
    for (let i = 0; i + 1 < pl.newItems.length && mixed < 2; i += 2) {
      const pair = pl.newItems.slice(i, i + 2);
      yield this.cg.challengePhrase('gap', { ...base, targets: [pair[0]], prefer: pair, drums: 'pickup' });
      mixed++;
    }
    yield* this.adaptive({
      ...base,
      budget: Math.max(24, P.budget - 8 * mixed),
      allowQuick: false,
      allowFlash: false,
      allowDouble: false,
      ghostChance: 0,
      drumBreak: false,
      maxTier: Math.min(1, P.maxTier) as Tier,
    });
  }

  /**
   * CARRERA (§2.2) — *the train does not stop:* one flag per bar and no time to
   * hesitate. It emits its `quick` bursts itself instead of hoping `adaptive()`
   * rolls them, which is what let the burst reach Europa at all.
   */
  private *carrera(pl: SessionPlan): Generator<Phrase, void, void> {
    const base = this.bodyBase(pl);
    const long = pl.params.budget >= 96;
    yield* this.burst(pl, long ? 6 : 4);
    yield this.drumBreak(pl.params.bpm, pl.params.groove, base.section);
    yield* this.burst(pl, long ? 6 : 4);
    if (long) {
      // Five names and less reading room: the same pressure, with the full bar back.
      for (let k = 0; k < 2; k++) yield this.cg.challengePhrase('rapid', { ...base, drums: 'gallop' });
      yield this.drumBreak(pl.params.bpm, pl.params.groove, base.section);
      yield* this.burst(pl, 4);
    } else {
      yield this.cg.challengePhrase('rapid', { ...base, drums: 'gallop' });
    }
  }

  /** A "ráfaga": `quick` chained, one flag per bar, announced the first time. */
  private *burst(pl: SessionPlan, n: number): Generator<Phrase, void, void> {
    const base = this.bodyBase(pl);
    for (let k = 0; k < n; k++) {
      yield this.cg.challengePhrase('quick', { ...base, drums: 'basic', events: k === 0 ? this.announce('quick') : [] });
    }
  }

  /**
   * ECO (§2.3) — *the band challenges you with a bar and you give it back.* Two
   * blocks of two rounds, the second one a step above the first, with normal
   * play in between so the player comes back to the main contract.
   */
  private *eco(pl: SessionPlan): Generator<Phrase, void, void> {
    const P = pl.params;
    const base = this.bodyBase(pl);
    const long = P.budget >= 96;
    const tier = Math.min(this.dd.tier, P.maxTier) as Tier;
    const filler = (): Generator<Phrase, void, void> =>
      this.adaptive({
        ...base,
        budget: 32,
        allowQuick: P.quick,
        allowFlash: P.flash,
        allowDouble: P.double,
        ghostChance: Math.max(P.ghost, this.diff.ghost),
        maxTier: P.maxTier,
      });
    yield* this.echoBlock(pl, tier);
    if (long) {
      yield* filler();
    } else {
      yield this.cg.challengePhrase('four', { ...base, drums: tier === 0 ? 'pickup' : 'sync' });
      yield this.cg.challengePhrase('gap', { ...base, drums: tier === 0 ? 'pickup' : 'gallop' });
    }
    yield* this.echoBlock(pl, Math.min(2, tier + 1) as Tier);
    if (long) yield* filler();
  }

  /**
   * MEMORIA (§2.4) — *the flag goes out and the bar keeps going.* FLASH first
   * (the cover lands halfway to the names), then A CIEGAS on `tension`, which
   * silences the band on beats 1-3 so only the pulse is left, then an adaptive
   * stretch full of ghosts. On FÁCIL there is no `flash`, so it degrades to
   * ghosts without a cover — still a different, honest concert.
   */
  private *memoria(pl: SessionPlan): Generator<Phrase, void, void> {
    const P = pl.params;
    const base = this.bodyBase(pl);
    const long = P.budget >= 96;
    const flash = P.flash && this.diff.flash;
    // On FÁCIL there is no cover, so there is nothing to announce either.
    yield this.cg.challengePhrase('gap', { ...base, drums: 'pickup', flash, events: flash ? this.announce('flash') : [] });
    yield this.cg.challengePhrase('four', { ...base, drums: 'sync', flash });
    yield this.cg.challengePhrase('tension', {
      ...base,
      drums: 'pickup',
      flash,
      ghost: true,
      events: [{ type: 'text', beat: 0, text: '¡A CIEGAS!', sub: 'siente el pulso', style: 'top', beats: 7.6 }],
    });
    this.introduced.add('ghost');
    yield this.cg.challengePhrase('tension', { ...base, drums: 'sync', flash, ghost: true });
    yield* this.adaptive({
      ...base,
      budget: long ? 64 : 16,
      allowQuick: false,
      allowFlash: true,
      allowDouble: false,
      ghostChance: Math.max(0.6, this.diff.ghost),
      drumBreak: long,
      maxTier: P.maxTier,
    });
  }

  /**
   * DESFILE (§2.5) — *the float goes by, slow and wide:* long phrases at the
   * lowest tempo of the tour, closing on the double hit. With
   * `HOLD_IN_CONCERTS` the long notes come back and the whole parade is played
   * on `holdRead`; until then the width is carried by `eight` alone.
   */
  private *desfile(pl: SessionPlan): Generator<Phrase, void, void> {
    const P = pl.params;
    const base = this.bodyBase(pl);
    const long = P.budget >= 96;
    const holds = HOLD_IN_CONCERTS && P.hold;
    if (holds && !this.knows('hold')) {
      for (const p of this.holdIntro(P.bpm, P.groove, base.section)) yield p;
      this.learn('hold');
    }
    const drums: DrumPattern = holds ? 'holdRead' : P.maxTier === 0 ? 'pickup' : 'gallop';
    const wide = (): Phrase => this.cg.challengePhrase('eight', { ...base, drums });
    for (let k = 0; k < (long ? 4 : 3); k++) yield wide();
    if (long) {
      yield this.drumBreak(P.bpm, P.groove, base.section);
      for (let k = 0; k < 2; k++) yield wide();
    }
    // The finish: two flags, two hits, no hold under it, so the cowbell stands out.
    if (P.double && this.diff.double) {
      if (this.introduced.has('double')) yield this.cg.challengePhrase('double', { ...base, drums: 'triple', doubleGap: 2, events: this.announce('double') });
      else yield* this.doubleIntro(pl.pool, P.bpm, P.groove, base.section);
    } else {
      yield wide();
    }
  }

  /**
   * JEFE (§2.6) — *everything you know, at once, with an audience.* The only
   * concert where every primitive lives together, and the only one whose echo
   * block is dramatic relief: it lands right before the hardest stretch.
   */
  private *jefe(pl: SessionPlan): Generator<Phrase, void, void> {
    const P = pl.params;
    const base = this.bodyBase(pl);
    const loud = {
      allowQuick: P.quick,
      allowFlash: P.flash,
      allowDouble: P.double,
      ghostChance: Math.max(P.ghost, this.diff.ghost),
      maxTier: P.maxTier,
    };
    if (P.double && this.diff.double) yield* this.doubleIntro(pl.pool, P.bpm, P.groove, base.section);
    yield* this.adaptive({ ...base, ...loud, budget: 40 });
    yield* this.echoBlock(pl, 2);
    yield* this.adaptive({ ...base, ...loud, budget: 24 });
    // Where the long note goes when HOLD ships: its tail melts into the crash of
    // the finale. Until then the same slot is a `tension` with the flag covered —
    // the band drops out and the player carries the bar alone.
    yield this.cg.challengePhrase('tension', { ...base, drums: HOLD_IN_CONCERTS && P.hold ? 'holdRead' : 'gallop', flash: P.flash && this.diff.flash });
  }

  /**
   * Two rounds of call and response (§1.B): four beats the band plays, four the
   * player gives back. **Only the archetypes with `params.echo` (ECO and JEFE)
   * emit it** — while every concert had one, the ECO badge promised what the
   * concert next door already did.
   */
  private *echoBlock(pl: SessionPlan, tier: Tier): Generator<Phrase, void, void> {
    const P = pl.params;
    const base = { bpm: P.bpm, groove: P.groove, section: GameState.MixGroove };
    const virgin = !this.knows('echo');
    const copy = ARCHETYPE_COPY.eco.banner;
    // Once in a lifetime: the game says the word its badge on the map promises.
    if (virgin && copy) yield this.banner(copy.text, P.bpm, P.groove, 'go', copy.sub);
    for (let round = 0; round < 2; round++) {
      const first = round === 0 && !this.introduced.has('echo');
      const pattern = virgin && round === 0 ? FLAT_ECHO : this.cg.echoPattern(tier);
      const [call, answer] = this.cg.echoPair(pattern, { ...base, first });
      this.learn('echo');
      yield call;
      yield answer;
    }
  }

  /** What every body phrase of a concert shares. */
  private bodyBase(pl: SessionPlan): { pool: LearningItem[]; bpm: number; groove: GrooveId; section: GameState } {
    return { pool: pl.pool, bpm: pl.params.bpm, groove: pl.params.groove, section: GameState.MixGroove };
  }

  /** Was this primitive ever taught: this session, or a previous one. */
  private knows(p: PrimitiveId): boolean {
    return this.introduced.has(p) || !!this.taughtBefore?.(p);
  }

  /** It just played: never again, in this session or the next. */
  private learn(p: PrimitiveId): void {
    this.introduced.add(p);
    this.onTaught?.(p);
  }

  // ================================================================== adaptive core

  /**
   * Fills `budget` beats with templates picked from the DifficultyDirector's
   * tier. New mechanics are announced the first time they show up.
   */
  private *adaptive(o: AdaptiveOpts): Generator<Phrase, void, void> {
    this.cg.beginSection();
    let used = 0;
    let breakDone = !o.drumBreak;
    let n = 0;
    while (used < o.budget) {
      const tier = Math.min(this.dd.tier, o.maxTier ?? 2) as Tier;
      const firstEvents = n === 0 && used === 0 ? (o.firstEvents ?? []) : [];
      const bpm = o.bpm;
      const base = { pool: o.pool, bpm, groove: o.groove, section: o.section };

      if (!breakDone && used >= o.budget * 0.45) {
        breakDone = true;
        used += 8;
        // The rest: a drum solo, no flag and no knowledge load. Call and response
        // used to sit here, but an echo in every concert made the ECO badge
        // promise what the concert next door already did; it now belongs to the
        // archetypes that announce it.
        const rest = this.drumBreak(bpm, o.groove, o.section);
        if (firstEvents.length) rest.events.push(...firstEvents);
        yield rest;
        continue;
      }

      if (o.allowQuick && tier >= 1 && n >= 2 && this.rng.chance(tier === 2 ? 0.35 : 0.2)) {
        const count = tier === 2 ? 4 : 2;
        for (let k = 0; k < count; k++) {
          yield this.cg.challengePhrase('quick', { ...base, drums: 'basic', ghost: this.ghost(o), events: k === 0 ? [...firstEvents, ...this.announce('quick')] : [] });
        }
        used += 4 * count;
        n++;
        continue;
      }

      const choices: TemplateId[] = tier === 0 ? ['four', 'four', 'gap'] : tier === 1 ? ['four', 'gap', 'rapid', 'eight', 'tension'] : ['rapid', 'eight', 'tension', 'gap', ...(o.allowDouble && this.diff.double ? (['double'] as TemplateId[]) : [])];
      const tid = this.rng.pick(choices);
      const drums: DrumPattern = tier === 0 ? this.rng.pick<DrumPattern>(['basic', 'pickup']) : tier === 1 ? this.rng.pick<DrumPattern>(['pickup', 'sync', 'gallop']) : this.rng.pick<DrumPattern>(['sync', 'gallop', 'offbeats']);
      const flash = !!o.allowFlash && this.diff.flash && tier === 2 && tid !== 'double' && this.rng.chance(0.35);
      const events: PhraseEvent[] = [...firstEvents];
      if (OFFBEAT_PATTERNS.has(drums)) events.push(...this.announce('offbeat'));
      if (flash) events.push(...this.announce('flash'));
      if (tid === 'double') events.push(...this.announce('double'));
      yield this.cg.challengePhrase(tid, { ...base, drums: tid === 'double' ? 'triple' : drums, flash, ghost: this.ghost(o), doubleGap: this.rng.chance(0.5) ? 1 : 2, events });
      used += TEMPLATES[tid].beats;
      n++;
    }
  }

  private ghost(o: AdaptiveOpts): boolean {
    return !!o.ghostChance && this.rng.chance(o.ghostChance);
  }

  /**
   * The drum solo rest: eight beats with no flag, so nothing has to be known and
   * the hands keep the groove. It is the breather of every concert that does not
   * announce an echo (docs/ARCHETYPE-ROLLOUT, resolución 1).
   */
  private drumBreak(bpm: number, groove: GrooveId, section: GameState): Phrase {
    return this.cg.drumPhrase(8, [0, 1, 1.5, 2, 3, 4, 4.5, 5, 6, 6.5, 7], {
      bpm,
      groove,
      section,
      events: [{ type: 'text', beat: 0, text: '¡SOLO DE TAMBOR!', style: 'top', beats: 7.6 }],
    });
  }

  /** Double hit is always demonstrated before it is asked for. */
  private *doubleIntro(pool: LearningItem[], bpm: number, groove: GrooveId, section: GameState): Generator<Phrase, void, void> {
    yield this.cg.challengePhrase('double', {
      pool,
      demo: true,
      forceCorrect: [1, 3],
      drums: 'triple',
      bpm,
      groove,
      section,
      events: [{ type: 'text', beat: 0, text: '¡DOBLE!', sub: 'dos seguidas · dos golpes', style: 'top', beats: 11.5 }],
    });
    this.introduced.add('double');
  }

  /**
   * The hold is demonstrated before it is ever asked for (twin of `doubleIntro`):
   * the band sustains one on beat 2 so the player *sees* the bar fill and *hears*
   * the long note, then plays the same hold on beat 6. Zero risk of failing the
   * first one. Returns the phrases instead of yielding them, so the debug hook
   * can queue it too.
   */
  holdIntro(bpm: number, groove: GrooveId, section: GameState): Phrase[] {
    const hold = (beat: number): OptionSpec => ({ beat, kind: 'hold', correct: true, lenBeats: 2 });
    const drums = (beats: number[]): OptionSpec[] => beats.map((b) => ({ beat: b, kind: 'drum', correct: true }));
    const base = { targets: [], flagBeat: null, glowCorrect: false, ghost: false, section };
    this.introduced.add('hold');
    return [
      {
        label: 'hold-intro',
        bpm,
        beats: 8,
        groove,
        events: [{ type: 'text', beat: 0, text: '¡SOSTÉN!', sub: 'mantén ESPACIO mientras cruza', style: 'top', beats: 7.6 }],
        challenges: [
          { ...base, options: [...drums([0, 1]), hold(2)], demo: true, scored: false, hint: false },
          { ...base, options: [...drums([4, 5]), hold(6)], demo: false, scored: true, hint: true },
        ],
      },
      this.banner('AHORA TÚ', bpm, groove, 'go'),
    ];
  }

  private announce(what: 'offbeat' | 'flash' | 'quick' | 'double'): PhraseEvent[] {
    if (this.introduced.has(what)) return [];
    this.introduced.add(what);
    // No banner names the subject: there are two packs (`banderas`, `capitales`),
    // so "una bandera por compás" is a lie in half the game. Either `pack.noun`
    // goes in, or the noun is left out — which is also shorter on a phone.
    const t: Record<typeof what, [string, string]> = {
      offbeat: ['¡CONTRATIEMPO!', 'los tambores «y» caen entre golpes'],
      flash: ['¡FLASH!', 'memorízala rápido'],
      quick: ['¡RÁFAGA!', 'una por compás'],
      double: ['¡DOBLE!', 'dos seguidas · dos golpes'],
    };
    return [{ type: 'text', beat: 0, text: t[what][0], sub: t[what][1], style: 'top', beats: 3.5 }];
  }

  // ================================================================== helpers

  private byId(id: string): LearningItem {
    return this.pack.byId(id);
  }

  private group(g: number): LearningItem[] {
    return this.pack.items.filter((i) => i.group === g);
  }

  private levelItems(l: LevelId): LearningItem[] {
    return this.pack.levels[l].items.map((id) => this.byId(id));
  }

  private title(text: string, sub: string, state: GameState, bpm: number, groove: GrooveId, pill?: string): Phrase {
    return {
      label: `title:${text}`,
      bpm,
      beats: 4,
      groove,
      fill: true,
      crashAt: [0],
      events: [
        { type: 'section', beat: 0, state, label: pill },
        { type: 'clear', beat: 0 },
        { type: 'text', beat: 0, text, sub, style: 'title', beats: 3.6 },
        { type: 'jingle', beat: 0, kind: 'section' },
      ],
      challenges: [],
    };
  }

  private banner(text: string, bpm: number, groove: GrooveId, jingle: 'go' | 'unlock', sub?: string): Phrase {
    return {
      label: `banner:${text}`,
      bpm,
      beats: 4,
      groove,
      fill: true,
      events: [
        { type: 'clear', beat: 0 },
        { type: 'text', beat: 0, text, sub, style: 'big', beats: 3.5 },
        { type: 'jingle', beat: 0, kind: jingle },
      ],
      challenges: [],
    };
  }

  /** Musical introduction: one flag every 2 beats, "ta" on the flag, "da!" on the name. */
  private teach(items: LearningItem[], bpm: number, groove: GrooveId, caption: string): Phrase {
    const per = 2;
    const events: PhraseEvent[] = [
      { type: 'clear', beat: 0 },
      { type: 'text', beat: 0, text: caption, style: 'top', beats: items.length * per - 0.3 },
    ];
    items.forEach((item, i) => {
      events.push({ type: 'teach', beat: i * per, item });
      events.push({ type: 'jingle', beat: i * per, kind: 'teach', n: i });
    });
    // Keep phrases a whole number of bars (a single item still takes a full bar).
    return { label: `teach:${items.map((i) => i.id).join(',')}`, bpm, beats: Math.ceil((items.length * per) / 4) * 4, groove, events, challenges: [] };
  }

  private finale(bpm: number): Phrase {
    return {
      label: 'finale',
      bpm,
      beats: 8,
      groove: 'finale',
      events: [
        { type: 'clear', beat: 3 },
        { type: 'finale', beat: 3 },
        { type: 'text', beat: 3, text: 'BEAT COMPLETE', style: 'title', beats: 4 },
        { type: 'end', beat: 6.5 },
      ],
      challenges: [],
    };
  }
}
