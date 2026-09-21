import type { Outcome } from './LearningTracker';

export type Tier = 0 | 1 | 2;
export type DifficultyId = 'facil' | 'normal' | 'dificil' | 'experto';

/** Everything a difficulty level changes. The rhythm engine itself never changes. */
export interface DifficultySettings {
  id: DifficultyId;
  label: string;
  desc: string;
  /** Multiplies every phrase's BPM. */
  bpmScale: number;
  /** Timing windows in seconds. */
  windows: { perfect: number; good: number };
  /** Bounds for the adaptive director. */
  minTier: Tier;
  maxTier: Tier;
  startSkill: number;
  scoreMult: number;
  feverAt: number;
  skipTutorial: boolean;
  /** Offbeat ("y") drums. */
  offbeats: boolean;
  flash: boolean;
  double: boolean;
  /** Extra chance of ghost drums in Mix/Final. */
  ghost: number;
  /** How many Easy Groove challenges keep the name hint. */
  hints: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultySettings> = {
  facil: {
    id: 'facil',
    label: 'FÁCIL',
    desc: 'más lento · más margen · sin contratiempos',
    bpmScale: 0.88,
    windows: { perfect: 0.1, good: 0.2 },
    minTier: 0,
    maxTier: 1,
    startSkill: 0.4,
    scoreMult: 0.75,
    feverAt: 20,
    skipTutorial: false,
    offbeats: false,
    flash: false,
    double: false,
    ghost: 0,
    hints: 3,
  },
  normal: {
    id: 'normal',
    label: 'NORMAL',
    desc: 'el groove de siempre',
    bpmScale: 1,
    windows: { perfect: 0.08, good: 0.16 },
    minTier: 0,
    maxTier: 2,
    startSkill: 0.55,
    scoreMult: 1,
    feverAt: 30,
    skipTutorial: false,
    offbeats: true,
    flash: true,
    double: true,
    ghost: 0,
    hints: 2,
  },
  dificil: {
    id: 'dificil',
    label: 'DIFÍCIL',
    desc: 'más rápido · menos margen · sin tutorial',
    bpmScale: 1.06,
    windows: { perfect: 0.065, good: 0.13 },
    minTier: 1,
    maxTier: 2,
    startSkill: 0.7,
    scoreMult: 1.25,
    feverAt: 30,
    skipTutorial: true,
    offbeats: true,
    flash: true,
    double: true,
    ghost: 0.1,
    hints: 1,
  },
  experto: {
    id: 'experto',
    label: 'EXPERTO',
    desc: 'a toda máquina · a ciegas · sin piedad',
    bpmScale: 1.12,
    windows: { perfect: 0.05, good: 0.105 },
    minTier: 2,
    maxTier: 2,
    startSkill: 0.95,
    scoreMult: 1.5,
    feverAt: 40,
    skipTutorial: true,
    offbeats: true,
    flash: true,
    double: true,
    ghost: 0.3,
    hints: 0,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['facil', 'normal', 'dificil', 'experto'];

/**
 * Invisible dynamic difficulty. Watches how the player is doing (country
 * outcomes weigh a lot, drums a little) and tells the setlist which rhythm
 * templates to use next, always inside the chosen difficulty's bounds.
 */
export class DifficultyDirector {
  skill: number;

  constructor(private settings: DifficultySettings) {
    this.skill = settings.startSkill;
  }

  recordAnswer(outcome: Outcome): void {
    const v = outcome === 'clean' ? 1 : outcome === 'rhythm' ? 0.55 : outcome === 'hitWithErrors' ? 0.25 : 0;
    this.skill = this.skill * 0.7 + v * 0.3;
  }

  recordDrum(hit: boolean): void {
    this.skill = this.skill * 0.97 + (hit ? 1 : 0) * 0.03;
  }

  get tier(): Tier {
    const raw: Tier = this.skill < 0.5 ? 0 : this.skill < 0.8 ? 1 : 2;
    return Math.min(this.settings.maxTier, Math.max(this.settings.minTier, raw)) as Tier;
  }
}
