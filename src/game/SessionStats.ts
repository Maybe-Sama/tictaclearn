import type { ErrorKind, Grade } from '../rhythm/types';

/** Default combo at which FEVER kicks in (points x2, full band, night stage). */
export const FEVER_AT = 30;

export interface HitEvents {
  feverStart: boolean;
  /** Perfect streak just reached a multiple of 10. */
  streak: number | null;
}

/** Score/combo for one run. Knowledge vs rhythm errors are kept apart. */
export class SessionStats {
  perfect = 0;
  good = 0;
  miss = 0;
  combo = 0;
  maxCombo = 0;
  score = 0;
  perfectStreak = 0;
  bestPerfectStreak = 0;
  feverCount = 0;
  knowledgeErrors = 0;
  rhythmErrors = 0;
  noResponse = 0;
  stray = 0;
  lastWasHit = false;
  /** Call-and-response rounds played and how many were clean. */
  echoRounds = 0;
  echoClean = 0;
  /** Holds offered and how many were sustained all the way to the tail. */
  holdsTotal = 0;
  holdsClean = 0;
  private timingPts = 0;
  private timingN = 0;

  constructor(
    readonly feverAt = FEVER_AT,
    private scoreMult = 1,
  ) {}

  get fever(): boolean {
    return this.combo >= this.feverAt;
  }

  /** 0..3: how many band layers your combo has unlocked. */
  get layer(): number {
    // Band layers at ~1/4, ~1/2 of the way to FEVER, then FEVER itself.
    const at = [Math.round(this.feverAt * 0.27), Math.round(this.feverAt * 0.54), this.feverAt];
    return at.filter((c) => this.combo >= c).length;
  }

  hit(grade: Exclude<Grade, 'miss'>, drum: boolean): HitEvents {
    const wasFever = this.fever;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (grade === 'perfect') {
      this.perfect++;
      this.perfectStreak++;
      this.bestPerfectStreak = Math.max(this.bestPerfectStreak, this.perfectStreak);
    } else {
      this.good++;
      this.perfectStreak = 0;
    }
    const base = drum ? (grade === 'perfect' ? 30 : 15) : grade === 'perfect' ? 100 : 50;
    const streakBonus = grade === 'perfect' && this.perfectStreak % 10 === 0 ? 250 : 0;
    this.score += Math.round(((base + Math.min(this.combo, 50) * 2) * (this.fever ? 2 : 1) + streakBonus) * this.scoreMult);
    this.timingPts += grade === 'perfect' ? 1 : 0.6;
    this.timingN++;
    this.lastWasHit = true;
    const feverStart = !wasFever && this.fever;
    if (feverStart) this.feverCount++;
    return { feverStart, streak: streakBonus ? this.perfectStreak : null };
  }

  /** Returns true if FEVER was lost. */
  fail(kind: ErrorKind): boolean {
    const lost = this.fever;
    this.combo = 0;
    this.perfectStreak = 0;
    this.miss++;
    this.lastWasHit = false;
    if (kind === 'knowledge') this.knowledgeErrors++;
    else if (kind === 'rhythm') {
      this.rhythmErrors++;
      this.timingN++;
    } else if (kind === 'noResponse') this.noResponse++;
    else this.stray++;
    return lost;
  }

  /** Timing quality over every on-time attempt (knowledge errors excluded). */
  get timingPct(): number {
    return this.timingN ? Math.round((this.timingPts / this.timingN) * 100) : 0;
  }
}
