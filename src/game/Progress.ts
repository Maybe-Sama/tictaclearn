import type { Outcome } from './LearningTracker';

/**
 * Long-term memory, saved in localStorage (per subject):
 * - Beat Tour concerts: stars and pass state.
 * - Mastery per country: a Leitner box (0..5). Right answers move it up,
 *   misses move it down; low boxes and long-unseen items come back first.
 */
export interface ConcertRecord {
  stars: number;
  passed: boolean;
  best: number;
}

export interface MasteryRecord {
  box: number;
  seen: number;
  last: number;
}

interface SubjectData {
  concerts: Record<string, ConcertRecord>;
  mastery: Record<string, MasteryRecord>;
}

export type MasteryLevel = 'nuevo' | 'aprendiendo' | 'dominado';

const KEY = 'worldbeat.progress.v1';

export class Progress {
  private data: Record<string, SubjectData> = {};

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
  }

  private subject(id: string): SubjectData {
    return (this.data[id] ??= { concerts: {}, mastery: {} });
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode: progress lives for the session only */
    }
  }

  concert(subject: string, id: string): ConcertRecord | null {
    return this.subject(subject).concerts[id] ?? null;
  }

  /** Keeps the best result. Returns the stored record. */
  recordConcert(subject: string, id: string, stars: number, passed: boolean, score: number): ConcertRecord {
    const s = this.subject(subject);
    const prev = s.concerts[id];
    const rec: ConcertRecord = {
      stars: Math.max(prev?.stars ?? 0, stars),
      passed: (prev?.passed ?? false) || passed,
      best: Math.max(prev?.best ?? 0, score),
    };
    s.concerts[id] = rec;
    this.save();
    return rec;
  }

  mastery(subject: string, id: string): MasteryRecord | null {
    return this.subject(subject).mastery[id] ?? null;
  }

  level(subject: string, id: string): MasteryLevel {
    const m = this.mastery(subject, id);
    if (!m) return 'nuevo';
    return m.box >= 3 ? 'dominado' : 'aprendiendo';
  }

  /** Fold one session's outcomes into the long-term boxes. */
  recordOutcomes(subject: string, outcomes: Map<string, Outcome[]>): void {
    const s = this.subject(subject);
    const now = Date.now();
    for (const [id, list] of outcomes) {
      if (!list.length) continue;
      const m = (s.mastery[id] ??= { box: 0, seen: 0, last: 0 });
      const good = list.filter((o) => o === 'clean' || o === 'rhythm').length;
      const bad = list.length - good;
      if (bad === 0) m.box = Math.min(5, m.box + 1);
      else if (good <= bad) m.box = Math.max(0, m.box - 1);
      m.seen += list.length;
      m.last = now;
    }
    this.save();
  }

  /** Lower = needs practice sooner (low box, long unseen). */
  urgency(subject: string, id: string): number {
    const m = this.mastery(subject, id);
    if (!m) return 0;
    const days = (Date.now() - m.last) / 86_400_000;
    return m.box - Math.min(3, days / 2);
  }

  totalStars(subject: string, ids: string[]): number {
    return ids.reduce((n, id) => n + (this.concert(subject, id)?.stars ?? 0), 0);
  }

  reset(subject: string): void {
    this.data[subject] = { concerts: {}, mastery: {} };
    this.save();
  }
}
