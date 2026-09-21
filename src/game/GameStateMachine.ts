export enum GameState {
  Menu = 'Menu',
  RhythmTutorial = 'RhythmTutorial',
  GuidedPractice = 'GuidedPractice',
  EasyGroove = 'EasyGroove',
  TeachNewFlags = 'TeachNewFlags',
  MixGroove = 'MixGroove',
  FinalGroove = 'FinalGroove',
  Results = 'Results',
  Calibration = 'Calibration',
}

const ORDER: GameState[] = [
  GameState.RhythmTutorial,
  GameState.GuidedPractice,
  GameState.EasyGroove,
  GameState.TeachNewFlags,
  GameState.MixGroove,
  GameState.FinalGroove,
  GameState.Results,
];

export const PLAYING_STATES = new Set<GameState>(ORDER.slice(0, -1));

type Listener = (to: GameState, from: GameState) => void;

/**
 * Menu -> (tutorial | any groove on replay / Groove 2) -> ... -> Results -> Menu/replay.
 * Menu <-> Calibration.
 * Song sections only ever move forward; anything can bail out to Menu.
 */
export class GameStateMachine {
  private current = GameState.Menu;
  private listeners: Listener[] = [];

  get state(): GameState {
    return this.current;
  }

  get isPlaying(): boolean {
    return PLAYING_STATES.has(this.current);
  }

  canTransition(to: GameState): boolean {
    const from = this.current;
    if (to === GameState.Menu) return true;
    if (from === GameState.Menu) return PLAYING_STATES.has(to) || to === GameState.Calibration;
    if (from === GameState.Results || from === GameState.Calibration) return PLAYING_STATES.has(to);
    return ORDER.indexOf(to) > ORDER.indexOf(from);
  }

  transition(to: GameState): boolean {
    const from = this.current;
    if (to === from) return true;
    if (!this.canTransition(to)) {
      console.warn(`[WorldBeat] blocked transition ${from} -> ${to}`);
      return false;
    }
    this.current = to;
    for (const l of this.listeners) l(to, from);
    return true;
  }

  onChange(l: Listener): void {
    this.listeners.push(l);
  }
}
