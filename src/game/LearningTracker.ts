import type { LearningItem } from '../content/types';
import { randRange } from '../util/random';

export type Outcome = 'clean' | 'hitWithErrors' | 'knowledge' | 'rhythm' | 'noResponse';

export interface ItemStats {
  id: string;
  country: string;
  attempts: number;
  hits: number;
  misses: number;
  perfects: number;
  goods: number;
  /** Stamped a wrong country while this was the target. */
  knowledgeErrors: number;
  /** Pressed the right country out of the window: knew it, missed the groove. */
  rhythmErrors: number;
  /** Let it pass without pressing. */
  noResponse: number;
  averageTimingError: number;
  lastSeen: number;
  lastOutcome: Outcome | null;
  streak: number;
  /** Hidden spaced-repetition: when this item should come back (heard clock). */
  dueAt: number | null;
  pending: number;
  confusedWith: Record<string, number>;
  history: Outcome[];
}

function fresh(it: LearningItem): ItemStats {
  return {
    id: it.id,
    country: it.country,
    attempts: 0,
    hits: 0,
    misses: 0,
    perfects: 0,
    goods: 0,
    knowledgeErrors: 0,
    rhythmErrors: 0,
    noResponse: 0,
    averageTimingError: 0,
    lastSeen: -Infinity,
    lastOutcome: null,
    streak: 0,
    dueAt: null,
    pending: 0,
    confusedWith: {},
    history: [],
  };
}

/**
 * In-memory learning model for one session. Failing a flag schedules it to
 * come back ~15-30 s later with a boosted weight; the player never sees any
 * of this, it just "happens" that Portugal shows up again.
 */
export class LearningTracker {
  private map = new Map<string, ItemStats>();
  private timingSum = new Map<string, number>();

  constructor(items: LearningItem[], carry?: LearningTracker) {
    for (const it of items) this.map.set(it.id, fresh(it));
    if (carry) {
      // "Dale otra vuelta" flags from the previous run are due immediately.
      for (const w of carry.weakest(3)) {
        const s = this.map.get(w.id);
        if (s) {
          s.pending = 1;
          s.dueAt = -Infinity;
        }
      }
    }
  }

  get(id: string): ItemStats {
    const s = this.map.get(id);
    if (!s) throw new Error(`No stats for ${id}`);
    return s;
  }

  all(): ItemStats[] {
    return [...this.map.values()];
  }

  record(item: LearningItem, outcome: Outcome, now: number, info: { timingErrorMs?: number; grade?: 'perfect' | 'good'; confusedWith?: string[] } = {}): void {
    const s = this.get(item.id);
    s.attempts++;
    s.lastSeen = now;
    s.lastOutcome = outcome;
    s.history.push(outcome);
    for (const id of info.confusedWith ?? []) s.confusedWith[id] = (s.confusedWith[id] ?? 0) + 1;

    switch (outcome) {
      case 'clean': {
        s.hits++;
        s.streak++;
        if (info.grade === 'perfect') s.perfects++;
        else s.goods++;
        if (s.dueAt !== null && now >= s.dueAt) {
          s.pending = Math.max(0, s.pending - 1);
          s.dueAt = s.pending > 0 ? now + randRange(20, 32) : null;
        }
        break;
      }
      case 'hitWithErrors':
      case 'knowledge':
      case 'noResponse':
        s.misses++;
        s.streak = 0;
        if (outcome === 'noResponse') s.noResponse++;
        else s.knowledgeErrors++;
        s.pending = Math.min(3, s.pending + 1);
        s.dueAt = now + randRange(15, 28);
        break;
      case 'rhythm':
        s.misses++;
        s.streak = 0;
        s.rhythmErrors++;
        s.pending = Math.max(1, s.pending);
        s.dueAt = now + randRange(22, 34);
        break;
    }

    if (info.timingErrorMs !== undefined) {
      const sum = (this.timingSum.get(item.id) ?? 0) + info.timingErrorMs;
      this.timingSum.set(item.id, sum);
      const n = s.perfects + s.goods;
      s.averageTimingError = n ? Math.round(sum / n) : 0;
    }
  }

  /** Selection weight for challenge targets. */
  weight(id: string, now: number): number {
    const s = this.get(id);
    let w = s.attempts === 0 ? 3 : 1;
    if (s.dueAt !== null) w *= now < s.dueAt ? 0.35 : 3 + 1.5 * s.pending;
    if (s.streak >= 2) w *= 0.6;
    if (now - s.lastSeen < 6) w *= 0.25;
    return w;
  }

  topConfusions(id: string): string[] {
    return Object.entries(this.get(id).confusedWith)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  }

  private trouble(s: ItemStats): number {
    const withErrors = s.history.filter((h) => h === 'hitWithErrors').length;
    return (s.knowledgeErrors - withErrors) * 2 + s.noResponse * 2 + withErrors * 1.5 + s.rhythmErrors * 0.7 + s.pending - s.hits * 0.8;
  }

  /** Recognised = last time you either nailed it, or knew it and just missed the groove. */
  recognizedCount(): number {
    return this.all().filter((s) => s.lastOutcome === 'clean' || s.lastOutcome === 'rhythm').length;
  }

  weakest(n: number): ItemStats[] {
    return this.all()
      .filter((s) => s.history.some((h) => h !== 'clean'))
      .filter((s) => !(s.lastOutcome === 'clean' && this.trouble(s) <= 1))
      .sort((a, b) => this.trouble(b) - this.trouble(a))
      .slice(0, n);
  }

  mastered(): ItemStats[] {
    const weak = new Set(this.weakest(3).map((s) => s.id));
    return this.all()
      .filter((s) => s.lastOutcome === 'clean' && !weak.has(s.id))
      .sort((a, b) => b.hits - a.hits);
  }
}
