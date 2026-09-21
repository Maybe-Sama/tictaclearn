export type Action = 'hit' | 'confirm' | 'back' | 'restart' | 'skip' | 'offsetUp' | 'offsetDown' | 'level2' | 'calibrate' | 'prev' | 'next';

type Handler = (action: Action, timeStamp: number) => void;

/**
 * Device-agnostic input: everything is mapped to abstract actions with the
 * event timestamp, so a gamepad or touch layer only needs to emit 'hit'.
 */
export class Input {
  private handlers: Handler[] = [];

  constructor(pointerArea: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.emit('hit', e.timeStamp);
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, Action> = {
        Enter: 'confirm',
        NumpadEnter: 'confirm',
        Escape: 'back',
        KeyR: 'restart',
        KeyN: 'skip',
        BracketRight: 'offsetUp',
        BracketLeft: 'offsetDown',
        Digit2: 'level2',
        Numpad2: 'level2',
        KeyC: 'calibrate',
        ArrowLeft: 'prev',
        ArrowRight: 'next',
      };
      const a = map[e.code];
      if (a) {
        if (a === 'confirm') e.preventDefault();
        this.emit(a, e.timeStamp);
      }
    });
    // Keep SPACE from "clicking" a focused button on keyup.
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') e.preventDefault();
    });
    // Touch / click on the stage = hit (mobile-ready).
    pointerArea.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.emit('hit', e.timeStamp);
    });
  }

  on(h: Handler): void {
    this.handlers.push(h);
  }

  private emit(a: Action, ts: number): void {
    for (const h of this.handlers) h(a, ts);
  }
}
