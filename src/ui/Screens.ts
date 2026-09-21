import type { ContentPack, LearningItem } from '../content/types';
import { GLOBE_SVG } from './art';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from '../game/Difficulty';

function el<T extends HTMLElement = HTMLDivElement>(cls: string, html = '', tag = 'div'): T {
  const e = document.createElement(tag) as T;
  e.className = cls;
  e.innerHTML = html;
  return e;
}

const LETTER_COLORS = ['#FF5D8F', '#16C2A3', '#4FB3FF', '#FFD23F', '#A98BFF', '#FF8C42'];

export class Menu {
  readonly root: HTMLDivElement;
  onPlay: () => void = () => {};
  onPlay2: () => void = () => {};
  onCalibrate: () => void = () => {};
  onDifficulty: (id: DifficultyId) => void = () => {};
  private best: HTMLElement;
  private diffDesc: HTMLElement;

  constructor(host: HTMLElement, pack: ContentPack) {
    const word = (w: string, offset: number): string =>
      [...w]
        .map((ch, i) =>
          ch === 'O' && offset === 0
            ? `<span class="l globe" style="--d:${i * 0.08}s">${GLOBE_SVG}</span>`
            : `<span class="l" style="--c:${LETTER_COLORS[(i + offset) % LETTER_COLORS.length]};--d:${(i + offset) * 0.08}s">${ch}</span>`,
        )
        .join('');
    const flags = pack.items
      .slice(0, 8)
      .map((it, i) => `<div class="mf" style="--x:${[6, 84, 12, 78, 3, 88, 2, 86][i]}%;--y:${[14, 10, 64, 60, 38, 34, 86, 84][i]}%;--r:${(i % 2 ? 1 : -1) * (6 + i * 2)}deg;--d:${i * 0.4}s">${pack.renderPrompt(it)}</div>`)
      .join('');
    this.root = el(
      'menu screen',
      `<div class="menu-flags" aria-hidden="true">${flags}</div>
       <div class="logo" aria-label="${pack.title}"><div class="logo-row">${word('WORLD', 0)}</div><div class="logo-row">${word('BEAT', 5)}</div></div>
       <div class="subtitle">${pack.subtitle}</div>
       <div class="diff-row" role="radiogroup" aria-label="Dificultad">
         ${DIFFICULTY_ORDER.map((id) => `<button class="diff d-${id}" type="button" role="radio" data-id="${id}">${DIFFICULTIES[id].label}</button>`).join('')}
       </div>
       <p class="diff-desc"></p>
       <button class="btn-play" type="button">JUGAR</button>
       <div class="menu-row">
         <button class="btn-level2" type="button">GROOVE 2 · GEMELAS <small>2</small></button>
         <button class="btn-calibrate" type="button">AJUSTAR RITMO <small>C</small></button>
       </div>
       <p class="menu-hint">Golpea los tambores… y el país de la bandera. Todo con <kbd>ESPACIO</kbd>, al ritmo.</p>
       <p class="menu-best"></p>`,
    );
    host.appendChild(this.root);
    this.best = this.root.querySelector('.menu-best')!;
    this.diffDesc = this.root.querySelector('.diff-desc')!;
    this.root.querySelectorAll<HTMLButtonElement>('.diff').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        b.blur();
        this.onDifficulty(b.dataset.id as DifficultyId);
      }),
    );
    const btn = this.root.querySelector<HTMLButtonElement>('.btn-play')!;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.blur();
      this.onPlay();
    });
    const wire = (sel: string, fn: () => void): void =>
      this.root.querySelector<HTMLButtonElement>(sel)!.addEventListener('click', (e) => {
        e.stopPropagation();
        (e.currentTarget as HTMLButtonElement).blur();
        fn();
      });
    wire('.btn-level2', () => this.onPlay2());
    wire('.btn-calibrate', () => this.onCalibrate());
  }

  show(v: boolean, best?: { score: number; combo: number }): void {
    this.root.classList.toggle('hidden', !v);
    if (v) this.best.textContent = best && best.score > 0 ? `Récord en esta dificultad: ${best.score.toLocaleString('es-ES')} · mejor combo ${best.combo}` : '';
  }

  setDifficulty(id: DifficultyId): void {
    this.root.querySelectorAll<HTMLButtonElement>('.diff').forEach((b) => {
      const on = b.dataset.id === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    this.diffDesc.textContent = DIFFICULTIES[id].desc;
    this.diffDesc.animate([{ transform: 'scale(.9)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }
}

export interface ResultsData {
  level: string;
  suggestion: string | null;
  bestStreak: number;
  fevers: number;
  recognized: number;
  total: number;
  timingPct: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  score: number;
  newBest: boolean;
  mastered: LearningItem[];
  weak: LearningItem[];
}

export class ResultsScreen {
  readonly root: HTMLDivElement;
  onAgain: () => void = () => {};
  onRestart: () => void = () => {};

  constructor(
    host: HTMLElement,
    private pack: ContentPack,
  ) {
    this.root = el('results screen hidden');
    host.appendChild(this.root);
  }

  show(v: boolean, d?: ResultsData): void {
    this.root.classList.toggle('hidden', !v);
    if (!v || !d) return;
    const mini = (it: LearningItem, big = false): string => `<div class="rs-flag${big ? ' big' : ''}"><div class="rs-flag-art">${this.pack.renderPrompt(it)}</div><span>${this.pack.answerLabel(it)}</span></div>`;
    const bubble = (label: string, value: string, color: string, i: number): string => `<div class="rs-bubble" style="--bc:${color};--i:${i}"><b data-count="${value}">${value}</b><span>${label}</span></div>`;
    this.root.innerHTML = `
      <h1 class="rs-title"><span>GROOVE</span><span>COMPLETE</span></h1>
      <p class="rs-level">${d.level}</p>${d.suggestion ? `<p class="rs-suggest">${d.suggestion}</p>` : ''}
      <div class="rs-body">
        <div class="rs-left">
          <div class="rs-big"><div class="rs-big-num"><b>${d.recognized}</b><small>/${d.total}</small></div><div class="rs-big-label">banderas<br>reconocidas</div></div>
          <div class="rs-bubbles">
            ${bubble('Timing', `${d.timingPct}%`, '#4FB3FF', 0)}
            ${bubble('Mejor combo', String(d.maxCombo), '#FF8C42', 1)}
            ${bubble('Perfect', String(d.perfect), '#FFD23F', 2)}
            ${bubble('Good', String(d.good), '#16C2A3', 3)}
            ${bubble('Miss', String(d.miss), '#FF5D8F', 4)}
          </div>
          <p class="rs-score">${d.score.toLocaleString('es-ES')} pts · racha perfect ${d.bestStreak}${d.fevers ? ` · FEVER ×${d.fevers}` : ''}${d.newBest ? ' · <em>¡NUEVO RÉCORD!</em>' : ''}</p>
        </div>
        <div class="rs-right">
          <h3>Las que ya dominas</h3>
          <div class="rs-row">${d.mastered.length ? d.mastered.slice(0, 8).map((m) => mini(m)).join('') : '<p class="rs-empty">¡La próxima caen!</p>'}</div>
          <h3>Dale otra vuelta a</h3>
          <div class="rs-row weak">${d.weak.length ? d.weak.map((w) => mini(w, true)).join('') : '<p class="rs-empty">Nada. Las clavaste todas.</p>'}</div>
        </div>
      </div>
      <div class="rs-buttons">
        <button class="btn-again" type="button">OTRA VEZ <small>ENTER</small></button>
        <button class="btn-restart" type="button">REINICIAR <small>R</small></button>
      </div>`;
    const again = this.root.querySelector<HTMLButtonElement>('.btn-again')!;
    const restart = this.root.querySelector<HTMLButtonElement>('.btn-restart')!;
    again.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onAgain();
    });
    restart.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRestart();
    });
  }
}

export class PauseOverlay {
  readonly root: HTMLDivElement;
  onResume: () => void = () => {};
  onRestart: () => void = () => {};

  constructor(host: HTMLElement) {
    this.root = el(
      'pause hidden',
      `<div class="pause-card">
         <h2>PAUSA</h2>
         <button class="btn-resume" type="button">SEGUIR <small>ENTER</small></button>
         <button class="btn-restart" type="button">REINICIAR <small>R</small></button>
       </div>`,
    );
    host.appendChild(this.root);
    this.root.querySelector('.btn-resume')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onResume();
    });
    this.root.querySelector('.btn-restart')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRestart();
    });
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }
}

/** Tap along to 12 clicks; the median offset becomes inputOffsetMs. */
export class CalibrationScreen {
  readonly root: HTMLDivElement;
  onDone: () => void = () => {};
  onRetry: () => void = () => {};
  private status: HTMLElement;
  private dot: HTMLElement;
  private result: HTMLElement;
  private taps: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = el(
      'calib screen hidden',
      `<h2>AJUSTAR RITMO</h2>
       <p class="calib-status"></p>
       <div class="calib-dot"></div>
       <div class="calib-taps"></div>
       <p class="calib-result"></p>
       <div class="calib-buttons">
         <button class="btn-resume calib-done" type="button">LISTO <small>ENTER</small></button>
         <button class="btn-restart calib-retry" type="button">REPETIR <small>R</small></button>
       </div>`,
    );
    host.appendChild(this.root);
    this.status = this.root.querySelector('.calib-status')!;
    this.dot = this.root.querySelector('.calib-dot')!;
    this.result = this.root.querySelector('.calib-result')!;
    this.taps = this.root.querySelector('.calib-taps')!;
    this.root.querySelector('.calib-done')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onDone();
    });
    this.root.querySelector('.calib-retry')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRetry();
    });
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (v) {
      this.taps.innerHTML = '';
      this.result.textContent = '';
      this.root.classList.remove('done');
    }
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  beat(accent: boolean): void {
    this.dot.classList.toggle('accent', accent);
    this.dot.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
  }

  tap(deltaMs: number): void {
    const t = document.createElement('i');
    // Tap marks sit on a ruler: centre = on time, left = early, right = late.
    t.style.left = `${50 + Math.max(-45, Math.min(45, deltaMs / 3))}%`;
    this.taps.appendChild(t);
  }

  finish(offsetMs: number | null): void {
    this.root.classList.add('done');
    this.result.textContent =
      offsetMs === null
        ? 'Necesito más golpes. ¡Repite!'
        : `Ajuste: ${offsetMs > 0 ? '+' : ''}${offsetMs} ms ${Math.abs(offsetMs) < 15 ? '· ¡clavado!' : offsetMs > 0 ? '· sueles ir un pelín tarde' : '· sueles adelantarte'}`;
  }
}
