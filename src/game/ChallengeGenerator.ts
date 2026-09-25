import type { LearningItem } from '../content/types';
import type { GrooveId, OptionSpec, Phrase, PhraseEvent } from '../rhythm/types';
import type { GameState } from './GameStateMachine';
import type { LearningTracker } from './LearningTracker';
import { shuffle, weightedIndex } from '../util/random';
import type { Rng } from '../util/rng';

/**
 * Rhythm templates. Same grammar everywhere so the player can *feel* it:
 * the flag pops on beat 0, a drum pattern leads in, then country names land
 * one per beat. Drums are always hit; only the matching country is hit.
 */
interface Template {
  beats: number;
  flagBeat: number;
  /** Beats where country names land. */
  answerBeats: number[];
  targets: 1 | 2;
  dropBeats?: number[];
  crashAt?: number[];
}

export type TemplateId = 'four' | 'gap' | 'eight' | 'tension' | 'rapid' | 'double' | 'quick';

export const TEMPLATES: Record<TemplateId, Template> = {
  /** The basic groove: 4 names on beats 5-8. */
  four: { beats: 8, flagBeat: 0, answerBeats: [4, 5, 6, 7], targets: 1 },
  /** A rest in the middle: the band stops for one beat. */
  gap: { beats: 8, flagBeat: 0, answerBeats: [3, 4, 6, 7], targets: 1, dropBeats: [5] },
  /** Long run of 8 names. */
  eight: { beats: 12, flagBeat: 0, answerBeats: [4, 5, 6, 7, 8, 9, 10, 11], targets: 1 },
  /** The band drops out after the flag: you play the break alone, then CRASH. */
  tension: { beats: 8, flagBeat: 0, answerBeats: [4, 5, 6, 7], targets: 1, dropBeats: [1, 2, 3], crashAt: [4] },
  /** Five names, less time to read the flag. */
  rapid: { beats: 8, flagBeat: 0, answerBeats: [3, 4, 5, 6, 7], targets: 1 },
  /** Two flags, two country hits, 1-2 beats apart. */
  double: { beats: 12, flagBeat: 0, answerBeats: [4, 5, 6, 7, 8, 9, 10, 11], targets: 2 },
  /** One flag per bar, two names. Chained into bursts ("ráfagas"). */
  quick: { beats: 4, flagBeat: 0, answerBeats: [2, 3], targets: 1 },
};

/**
 * Drum lead-ins, in beats relative to the first country name. `holdRead` is the
 * odd one out: it has no drums at all, because a single HOLD takes their place
 * (see `holdLen`). Reading time, turned into action.
 */
export type DrumPattern = 'none' | 'basic' | 'pickup' | 'sync' | 'gallop' | 'offbeats' | 'triple' | 'holdRead';
const DRUMS: Record<DrumPattern, number[]> = {
  none: [],
  basic: [-2, -1],
  pickup: [-4, -2, -1],
  sync: [-4, -2.5, -2, -1],
  gallop: [-4, -3, -2.5, -2, -1],
  offbeats: [-4, -3.5, -2.5, -1.5, -1],
  triple: [-2, -1.5, -1],
  holdRead: [],
};
export const OFFBEAT_PATTERNS = new Set<DrumPattern>(['sync', 'gallop', 'offbeats']);

/**
 * Hold length for a template: from the flag beat to one beat before the first
 * name. 2 or 3 beats only — one beat cannot be told apart from a tap, and 4+
 * tires the hand and covers the band. 0 = this template takes no hold.
 */
export function holdLen(tid: TemplateId): number {
  const tpl = TEMPLATES[tid];
  const len = tpl.answerBeats[0] - 1 - tpl.flagBeat;
  return len >= 2 ? Math.min(3, len) : 0;
}

export interface ChallengeOptions {
  pool: LearningItem[];
  targets?: LearningItem[];
  bpm: number;
  groove: GrooveId;
  section: GameState;
  drums?: DrumPattern;
  demo?: boolean;
  hint?: boolean;
  glow?: boolean;
  scored?: boolean;
  /** Flag gets covered halfway to the names: remember it. */
  flash?: boolean;
  /** Drums drawn as outlines. */
  ghost?: boolean;
  forceCorrect?: number[];
  maxCorrect?: number;
  doubleGap?: 1 | 2;
  /** Distractors to favour (e.g. freshly taught or look-alike flags). */
  prefer?: LearningItem[];
  events?: PhraseEvent[];
}

export class ChallengeGenerator {
  /** Heard-clock time of the phrase being generated (set by the setlist). */
  now = 0;
  /** Chance to pull a look-alike (flag or capital) in as a distractor. 0 = off. */
  lookalikeRate = 0;
  private lastTargets: string[] = [];
  private lastIdx = -1;
  private seen = new Set<string>();
  /** Decoy answers (e.g. SÍDNEY) as throwaway items, so they can ride the lane. */
  private decoys = new Map<string, LearningItem>();

  constructor(
    private tracker: LearningTracker,
    private allItems: LearningItem[],
    private rng: Rng,
  ) {}

  beginSection(): void {
    this.seen.clear();
  }

  challengePhrase(tid: TemplateId, o: ChallengeOptions): Phrase {
    const tpl = TEMPLATES[tid];
    const n = tpl.answerBeats.length;
    const targets = o.targets ?? this.pickTargets(o.pool, tpl.targets);
    const correct = o.forceCorrect ?? (targets.length === 2 ? this.pickDouble(n, o.doubleGap ?? 2) : [this.pickCorrect(n, o.maxCorrect)]);
    const distractors = this.pickDistractors(targets, o.pool, n - targets.length, o.prefer);

    const options: OptionSpec[] = [];
    let d = 0;
    for (let i = 0; i < n; i++) {
      const ci = correct.indexOf(i);
      options.push({ beat: tpl.answerBeats[i], kind: 'answer', item: ci >= 0 ? targets[ci] : distractors[d++], correct: ci >= 0 });
    }
    const first = tpl.answerBeats[0];
    // `quick` has only one beat of reading room, so it falls back to drums.
    const holdBeats = o.drums === 'holdRead' ? holdLen(tid) : 0;
    const pattern = holdBeats ? 'holdRead' : o.drums === 'holdRead' ? 'basic' : (o.drums ?? 'basic');
    if (holdBeats) {
      // The hold owns (flagBeat, flagBeat + holdBeats] on its own: nothing else lands there.
      options.push({ beat: tpl.flagBeat, kind: 'hold', correct: true, lenBeats: holdBeats });
    }
    for (const rel of DRUMS[pattern]) {
      const b = first + rel;
      if (b >= 0) options.push({ beat: b, kind: 'drum', correct: true, bell: pattern === 'triple' });
    }
    options.sort((a, b) => a.beat - b.beat);

    targets.forEach((t) => this.seen.add(t.id));
    this.lastTargets = targets.map((t) => t.id);

    const events: PhraseEvent[] = [{ type: 'cue', beat: tpl.flagBeat, kind: 'reveal' }, ...(o.events ?? [])];
    if (o.flash) events.push({ type: 'cover', beat: tpl.flagBeat + Math.max(1, (first - tpl.flagBeat) / 2) });

    return {
      label: `${tid}/${pattern}${o.flash ? '/flash' : ''}${o.ghost ? '/ghost' : ''}:${targets.map((t) => t.id).join('+')}@${correct.join(',')}`,
      bpm: o.bpm,
      beats: tpl.beats,
      groove: o.groove,
      events,
      dropBeats: tpl.dropBeats,
      crashAt: tpl.crashAt,
      challenges: [
        {
          targets,
          options,
          flagBeat: tpl.flagBeat,
          demo: !!o.demo,
          scored: o.scored ?? !o.demo,
          hint: !!o.hint,
          glowCorrect: !!o.glow,
          ghost: !!o.ghost,
          section: o.section,
        },
      ],
    };
  }

  /** A pure-rhythm phrase: only drums, no flag. */
  drumPhrase(
    beats: number,
    drumBeats: number[],
    o: { bpm: number; groove: GrooveId; section: GameState; scored?: boolean; demo?: boolean; events?: PhraseEvent[]; ghost?: boolean; echo?: boolean; dropBeats?: number[]; label?: string },
  ): Phrase {
    return {
      label: o.label ?? `drums:${drumBeats.join(',')}`,
      bpm: o.bpm,
      beats,
      groove: o.groove,
      dropBeats: o.dropBeats,
      events: o.events ?? [],
      challenges: [
        {
          targets: [],
          options: drumBeats.map((b) => ({ beat: b, kind: 'drum', correct: true })),
          flagBeat: null,
          demo: !!o.demo,
          scored: o.scored ?? true,
          hint: false,
          glowCorrect: false,
          ghost: !!o.ghost,
          echo: !!o.echo,
          section: o.section,
        },
      ],
    };
  }

  /**
   * Call and response: the band plays a four-beat pattern, you play it back.
   * The call is a `demo` phrase, so the existing judge auto-plays it and
   * ignores presses during it; the response is the same pattern, scored.
   * Pure rhythm, no knowledge: it is the breather and the confidence beat.
   */
  echoPair(pattern: number[], o: { bpm: number; groove: GrooveId; section: GameState; first: boolean }): [Phrase, Phrase] {
    const base = { bpm: o.bpm, groove: o.groove, section: o.section, echo: true };
    const call = this.drumPhrase(4, pattern, {
      ...base,
      demo: true,
      ghost: true,
      scored: false,
      label: `echo-call:${pattern.join(',')}`,
      // The band thins out so the pattern is heard clean.
      dropBeats: [1, 2, 3],
      events: [
        { type: 'call', beat: 0, on: true },
        { type: 'call', beat: 3.9, on: false },
        { type: 'text', beat: 0, text: o.first ? '¡ESCUCHA!' : '¡OTRA!', sub: o.first ? 'el planeta toca…' : undefined, style: 'top', beats: 3.6 },
      ],
    });
    const answer = this.drumPhrase(4, pattern, {
      ...base,
      scored: true,
      label: `echo-answer:${pattern.join(',')}`,
      events: [{ type: 'text', beat: 0, text: '¡TÚ!', style: 'top', beats: 3.6 }],
    });
    return [call, answer];
  }

  /** Four-beat call patterns, easiest first. */
  echoPattern(tier: number): number[] {
    const byTier: number[][][] = [
      [[0, 1, 2, 3], [0, 1, 1.5, 3]],
      [[0, 0.5, 2, 3], [0, 1, 2, 2.5, 3], [0, 1, 1.5, 3]],
      [[0, 1.5, 2, 3.5], [0, 0.5, 1, 2, 3], [0, 1, 2, 2.5, 3]],
    ];
    return this.rng.pick(byTier[Math.max(0, Math.min(2, tier))]);
  }

  private pickTargets(pool: LearningItem[], k: number): LearningItem[] {
    const avail = [...pool];
    const chosen: LearningItem[] = [];
    for (let i = 0; i < k && avail.length; i++) {
      const weights = avail.map((it) => {
        let w = this.tracker.weight(it.id, this.now);
        if (!this.seen.has(it.id)) w *= 2.5;
        if (this.lastTargets.includes(it.id)) w *= 0.08;
        return w;
      });
      chosen.push(avail.splice(weightedIndex(weights, this.rng), 1)[0]);
    }
    return chosen;
  }

  /** Correct position varies and never repeats the previous slot. */
  private pickCorrect(n: number, max = n - 1): number {
    const cands: number[] = [];
    for (let i = 0; i <= Math.min(max, n - 1); i++) if (i !== this.lastIdx || n === 1) cands.push(i);
    const i = cands[weightedIndex(cands.map((c) => (c === 0 && n > 2 ? 0.6 : 1)), this.rng)];
    this.lastIdx = i;
    return i;
  }

  private pickDouble(n: number, gap: 1 | 2): number[] {
    const i = this.rng.int(n - gap);
    return [i, i + gap];
  }

  private decoy(label: string): LearningItem {
    const id = `decoy:${label}`;
    let it = this.decoys.get(id);
    if (!it) {
      it = { id, country: label, answer: label, flagAsset: '', difficulty: 0, group: 0 };
      this.decoys.set(id, it);
    }
    return it;
  }

  /** No duplicates; past confusions come back as distractors on purpose. */
  private pickDistractors(targets: LearningItem[], pool: LearningItem[], count: number, prefer?: LearningItem[]): LearningItem[] {
    const excl = new Set(targets.map((t) => t.id));
    const out: LearningItem[] = [];
    const add = (it: LearningItem | undefined): void => {
      if (it && !excl.has(it.id) && out.length < count) {
        out.push(it);
        excl.add(it.id);
      }
    };
    for (const t of targets) {
      const conf = this.tracker.topConfusions(t.id).map((id) => this.decoys.get(id) ?? this.allItems.find((i) => i.id === id));
      if (conf.length && this.rng.chance(0.7)) add(conf[0]);
      // The famous-but-wrong city is the whole point of a trap: it shows up most of the time.
      shuffle(t.decoys ?? [], this.rng).forEach((label, k) => {
        if (this.rng.chance(k === 0 ? 0.85 : 0.45)) add(this.decoy(label));
      });
      // "Is this Italy… or Mexico?" — the confusions worth practising.
      shuffle(t.lookalikes ?? [], this.rng)
        .slice(0, 2)
        .forEach((id) => {
          if (this.rng.chance(this.lookalikeRate)) add(pool.find((i) => i.id === id) ?? this.allItems.find((i) => i.id === id));
        });
    }
    if (prefer) for (const it of shuffle(prefer, this.rng).slice(0, Math.ceil(count / 2) + 1)) add(it);
    for (const it of shuffle(pool, this.rng)) add(it);
    for (const it of shuffle(this.allItems, this.rng)) add(it);
    return shuffle(out, this.rng);
  }
}
