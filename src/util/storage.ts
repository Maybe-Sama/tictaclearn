/** localStorage is only used for records and the input offset. */
const KEY_BEST = 'worldbeat.best';
const KEY_OFFSET = 'worldbeat.inputOffsetMs';
const KEY_DIFF = 'worldbeat.difficulty';
const KEY_SUBJECT = 'worldbeat.subject';

export interface Best {
  score: number;
  combo: number;
}

/** Records are kept per groove + difficulty (e.g. "1-normal"). */
export function loadBest(key = ''): Best {
  try {
    const raw = localStorage.getItem(key ? `${KEY_BEST}.${key}` : KEY_BEST);
    if (raw) return { score: 0, combo: 0, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { score: 0, combo: 0 };
}

export function saveBest(b: Best, key = ''): void {
  try {
    localStorage.setItem(key ? `${KEY_BEST}.${key}` : KEY_BEST, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

export function loadOffset(): number {
  try {
    const v = Number(localStorage.getItem(KEY_OFFSET));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export function saveOffset(ms: number): void {
  try {
    localStorage.setItem(KEY_OFFSET, String(ms));
  } catch {
    /* ignore */
  }
}

export function loadDifficulty(): string | null {
  try {
    return localStorage.getItem(KEY_DIFF);
  } catch {
    return null;
  }
}

export function saveDifficulty(id: string): void {
  try {
    localStorage.setItem(KEY_DIFF, id);
  } catch {
    /* ignore */
  }
}

export function loadSubject(): string | null {
  try {
    return localStorage.getItem(KEY_SUBJECT);
  } catch {
    return null;
  }
}

export function saveSubject(id: string): void {
  try {
    localStorage.setItem(KEY_SUBJECT, id);
  } catch {
    /* ignore */
  }
}
