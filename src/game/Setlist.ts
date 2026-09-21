import type { ContentPack, LearningItem, LevelId } from '../content/types';
import type { PhraseSource } from '../rhythm/RhythmEngine';
import type { GrooveId, Phrase, PhraseEvent } from '../rhythm/types';
import { OFFBEAT_PATTERNS, TEMPLATES, type ChallengeGenerator, type DrumPattern, type TemplateId } from './ChallengeGenerator';
import type { DifficultyDirector, DifficultySettings } from './Difficulty';
import { GameState } from './GameStateMachine';

export type { LevelId };

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
  drumBreak?: boolean;
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

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

  constructor(
    private pack: ContentPack,
    private cg: ChallengeGenerator,
    private dd: DifficultyDirector,
    private diff: DifficultySettings,
    opts: { level: LevelId; skipTutorial: boolean },
  ) {
    if (opts.level === 2) {
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
    yield this.title('EASY GROOVE', `4 ${this.pack.noun}`, S, 100, 'easy');
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
    yield this.title('NUEVO GROOVE', `4 ${this.pack.noun} más`, S, 102, 'new');
    yield this.teach([de, pt], 102, 'new', '¡NUEVOS EN LA BANDA!');
    yield c(de, 'pickup');
    yield c(pt, 'sync');
    yield this.teach([gb, br], 102, 'new', '¡Y ESTOS DOS!');
    yield c(gb, 'sync');
    yield c(br, 'gallop');
  }

  private *mix(): Generator<Phrase, void, void> {
    yield this.title('MIX GROOVE', 'las 8 mezcladas', GameState.MixGroove, 106, 'mix');
    yield* this.adaptive({ section: GameState.MixGroove, pool: this.levelItems(1), groove: 'mix', bpm: 106, budget: 88, allowQuick: true, allowFlash: true, drumBreak: true, ghostChance: this.diff.ghost / 2 });
  }

  private *final(): Generator<Phrase, void, void> {
    const S = GameState.FinalGroove;
    const pool = this.levelItems(1);
    const title = this.title('FINAL GROOVE', '¡a por todas!', S, 116, 'final');
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
    yield this.title('GROOVE 2', 'banderas gemelas', S, bpm, 'dembow');
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
    yield this.title('GROOVE 2', 'capitales trampa', S, bpm, 'dembow');
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
    yield this.title(lv.mixTitle ?? 'MIX GROOVE', lv.mixSub ?? '', GameState.MixGroove, 112, 'dembow');
    if (this.diff.double) yield* this.doubleIntro(this.levelItems(2), 112, 'dembow', GameState.MixGroove);
    yield* this.adaptive({ section: GameState.MixGroove, pool: this.levelItems(2), groove: 'dembow', bpm: 112, budget: 96, allowQuick: true, allowFlash: true, allowDouble: true, drumBreak: true, ghostChance: this.diff.ghost / 2 });
  }

  private *final2(): Generator<Phrase, void, void> {
    const S = GameState.FinalGroove;
    const pool = this.levelItems(2);
    const title = this.title('FINAL GROOVE', this.pack.levels[2].finalSub ?? '¡a por todas!', S, 120, 'final');
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
      const tier = this.dd.tier;
      const bpm = o.bpm;
      const base = { pool: o.pool, bpm, groove: o.groove, section: o.section };

      if (!breakDone && used >= o.budget * 0.45) {
        breakDone = true;
        used += 8;
        yield this.cg.drumPhrase(8, pick([[0, 1, 1.5, 2, 3, 4, 4.5, 5, 6, 6.5, 7], [0, 0.5, 1, 2, 2.5, 3, 4, 5, 5.5, 6, 7], [0, 1, 2, 2.5, 3, 3.5, 4, 5, 6, 7]]), {
          ...base,
          events: [{ type: 'text', beat: 0, text: '¡SOLO DE TAMBOR!', style: 'top', beats: 7.5 }],
        });
        continue;
      }

      if (o.allowQuick && tier >= 1 && n >= 2 && Math.random() < (tier === 2 ? 0.35 : 0.2)) {
        const count = tier === 2 ? 4 : 2;
        for (let k = 0; k < count; k++) {
          yield this.cg.challengePhrase('quick', { ...base, drums: 'basic', ghost: this.ghost(o), events: k === 0 ? this.announce('quick') : [] });
        }
        used += 4 * count;
        n++;
        continue;
      }

      const choices: TemplateId[] = tier === 0 ? ['four', 'four', 'gap'] : tier === 1 ? ['four', 'gap', 'rapid', 'eight', 'tension'] : ['rapid', 'eight', 'tension', 'gap', ...(o.allowDouble && this.diff.double ? (['double'] as TemplateId[]) : [])];
      const tid = pick(choices);
      const drums: DrumPattern = tier === 0 ? pick(['basic', 'pickup']) : tier === 1 ? pick(['pickup', 'sync', 'gallop']) : pick(['sync', 'gallop', 'offbeats']);
      const flash = !!o.allowFlash && this.diff.flash && tier === 2 && tid !== 'double' && Math.random() < 0.35;
      const events: PhraseEvent[] = [];
      if (OFFBEAT_PATTERNS.has(drums)) events.push(...this.announce('offbeat'));
      if (flash) events.push(...this.announce('flash'));
      if (tid === 'double') events.push(...this.announce('double'));
      yield this.cg.challengePhrase(tid, { ...base, drums: tid === 'double' ? 'triple' : drums, flash, ghost: this.ghost(o), doubleGap: Math.random() < 0.5 ? 1 : 2, events });
      used += TEMPLATES[tid].beats;
      n++;
    }
  }

  private ghost(o: AdaptiveOpts): boolean {
    return !!o.ghostChance && Math.random() < o.ghostChance;
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
      events: [{ type: 'text', beat: 0, text: '¡DOBLE!', sub: 'dos banderas · dos golpes', style: 'top', beats: 11.5 }],
    });
    this.introduced.add('double');
  }

  private announce(what: 'offbeat' | 'flash' | 'quick' | 'double'): PhraseEvent[] {
    if (this.introduced.has(what)) return [];
    this.introduced.add(what);
    const t: Record<typeof what, [string, string]> = {
      offbeat: ['¡CONTRATIEMPO!', 'los tambores «y» caen entre golpes'],
      flash: ['¡FLASH!', 'memoriza la bandera'],
      quick: ['¡RÁFAGA!', 'una bandera por compás'],
      double: ['¡DOBLE!', 'dos banderas · dos golpes'],
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

  private title(text: string, sub: string, state: GameState, bpm: number, groove: GrooveId): Phrase {
    return {
      label: `title:${text}`,
      bpm,
      beats: 4,
      groove,
      fill: true,
      crashAt: [0],
      events: [
        { type: 'section', beat: 0, state },
        { type: 'clear', beat: 0 },
        { type: 'text', beat: 0, text, sub, style: 'title', beats: 3.6 },
        { type: 'jingle', beat: 0, kind: 'section' },
      ],
      challenges: [],
    };
  }

  private banner(text: string, bpm: number, groove: GrooveId, jingle: 'go' | 'unlock'): Phrase {
    return {
      label: `banner:${text}`,
      bpm,
      beats: 4,
      groove,
      fill: true,
      events: [
        { type: 'clear', beat: 0 },
        { type: 'text', beat: 0, text, style: 'big', beats: 3.5 },
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
    return { label: `teach:${items.map((i) => i.id).join(',')}`, bpm, beats: items.length * per, groove, events, challenges: [] };
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
        { type: 'text', beat: 3, text: 'GROOVE COMPLETE', style: 'title', beats: 4 },
        { type: 'end', beat: 6.5 },
      ],
      challenges: [],
    };
  }
}
