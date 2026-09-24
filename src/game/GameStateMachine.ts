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
  Tour = 'Tour',
  Free = 'Free',
  Subject = 'Subject',
  Difficulty = 'Difficulty',
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
const HUBS = new Set<GameState>([GameState.Menu, GameState.Results, GameState.Calibration, GameState.Tour, GameState.Free, GameState.Subject, GameState.Difficulty]);

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
    // Hub screens (menu, tour map, free picker, calibration, results) can reach each other or start a song.
    if (HUBS.has(from)) return HUBS.has(to) || PLAYING_STATES.has(to);
    // Leaving a song early goes back to its hub.
    if (PLAYING_STATES.has(from) && HUBS.has(to)) return true;
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
