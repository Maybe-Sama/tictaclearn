import type { LearningItem } from '../content/types';
import type { GameState } from '../game/GameStateMachine';

export type GrooveId = 'intro' | 'easy' | 'new' | 'mix' | 'final' | 'dembow' | 'finale';
export type CueKind = 'reveal' | 'double';
export type JingleKind = 'section' | 'teach' | 'go' | 'unlock';
export type TextStyle = 'title' | 'big' | 'top';

/** Everything in a phrase is placed on the musical grid (beats), never in ms. */
export type PhraseEvent =
  | { type: 'section'; beat: number; state: GameState; label?: string }
  | { type: 'text'; beat: number; text: string; sub?: string; style: TextStyle; beats?: number }
  | { type: 'count'; beat: number; n: number }
  | { type: 'teach'; beat: number; item: LearningItem }
  | { type: 'clear'; beat: number }
  | { type: 'cover'; beat: number }
  | { type: 'cue'; beat: number; kind: CueKind }
  | { type: 'call'; beat: number; on: boolean }
  | { type: 'jingle'; beat: number; kind: JingleKind; n?: number }
  | { type: 'riser'; beat: number; beats: number }
  | { type: 'confetti'; beat: number }
  | { type: 'finale'; beat: number }
  | { type: 'end'; beat: number };

/**
 * 'answer' = a country name: hit it only if it matches the flag.
 * 'drum'   = a drum: always hit it, on time. Keeps the hands busy and the groove alive.
 */
export type OptionKind = 'answer' | 'drum';

export interface OptionSpec {
  beat: number;
  kind: OptionKind;
  item?: LearningItem;
  correct: boolean;
  /** Drum variant with a cowbell voice (double-hit cue). */
  bell?: boolean;
}

export interface ChallengeSpec {
  targets: LearningItem[];
  /** Sorted by beat. */
  options: OptionSpec[];
  /** null = drum-only phrase (no flag). */
  flagBeat: number | null;
  demo: boolean;
  scored: boolean;
  hint: boolean;
  glowCorrect: boolean;
  /** Drums drawn as outlines only: feel them. */
  ghost: boolean;
  /** Part of a call-and-response round (the band plays, then you repeat). */
  echo?: boolean;
  section: GameState;
}

/** A musical phrase: always a multiple of 4 beats so bars stay aligned. */
export interface Phrase {
  label: string;
  bpm: number;
  beats: number;
  groove: GrooveId;
  events: PhraseEvent[];
  challenges: ChallengeSpec[];
  /** Beats where the band stops (silence / tension). */
  dropBeats?: number[];
  crashAt?: number[];
  /** Snare fill on the last beat. */
  fill?: boolean;
}

export interface ScheduledPhrase {
  phrase: Phrase;
  /** AudioContext time of beat 0. */
  start: number;
  end: number;
  beatDur: number;
  /** Beats elapsed in the song before this phrase. */
  globalBeat: number;
  index: number;
}

export type OptionState = 'pending' | 'hit' | 'wrong' | 'missed' | 'passed';

export interface ChallengeOption {
  challenge: Challenge;
  index: number;
  kind: OptionKind;
  item?: LearningItem;
  correct: boolean;
  bell: boolean;
  offbeat: boolean;
  beat: number;
  /** scheduledBeatTime: AudioContext time at which this token lands on the pad. */
  time: number;
  beatDur: number;
  state: OptionState;
  judgement?: Judgement;
  /** Its drum sound was scheduled ahead, exactly on the beat (player in the groove). */
  prePlayed?: boolean;
}

export interface Challenge {
  id: number;
  spec: ChallengeSpec;
  phrase: ScheduledPhrase;
  beatDur: number;
  targets: LearningItem[];
  /** optionsSequence (drums + names, time-sorted) */
  options: ChallengeOption[];
  /** Indices (into options) of the correct country names. */
  correctBeatIndex: number[];
  drumCount: number;
  scheduledStartTime: number;
  expectedHitTimes: number[];
  flagTime: number | null;
  demo: boolean;
  scored: boolean;
  hint: boolean;
  section: GameState;
  wrongPresses: number;
  /** Every press judged against this challenge (mash detection). */
  presses: number;
  wrongItems: LearningItem[];
  resolved: boolean;
}

export type Grade = 'perfect' | 'good' | 'miss';
/**
 * knowledge  -> stamped a wrong name on time (didn't recognise the flag)
 * rhythm     -> right name / drum outside the window, or a drum let through
 * noResponse -> let the right country pass without pressing
 * stray      -> pressed on a rest / nothing near
 */
export type ErrorKind = 'knowledge' | 'rhythm' | 'noResponse' | 'stray';
export type JudgeKind = 'hit' | 'auto' | 'demo' | 'whiff';

export interface Judgement {
  kind: JudgeKind;
  grade: Grade;
  side: 'early' | 'late' | 'center';
  /** timingDelta = inputTime - scheduledBeatTime, in ms (negative = early). */
  deltaMs: number;
  inputTime: number;
  /** Judged against a drum (vs a country name). */
  drum: boolean;
  errorKind?: ErrorKind;
  option?: ChallengeOption;
  challenge?: Challenge;
  /** Already penalised by an earlier press in the same challenge. */
  silent?: boolean;
}

export type VisualEvent = PhraseEvent | { type: 'flag'; beat: number; challenge: Challenge };

export interface TimedVisual {
  time: number;
  ev: VisualEvent;
  sp: ScheduledPhrase;
}
