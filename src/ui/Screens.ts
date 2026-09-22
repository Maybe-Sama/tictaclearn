import type { ContentPack, LearningItem } from '../content/types';
import { GLOBE_SVG } from './art';
import { TOUCH, inputWord } from './layout';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from '../game/Difficulty';

function el<T extends HTMLElement = HTMLDivElement>(cls: string, html = '', tag = 'div'): T {
  const e = document.createElement(tag) as T;
  e.className = cls;
  e.innerHTML = html;
  return e;
}

const LETTER_COLORS = ['#FF5D8F', '#16C2A3', '#4FB3FF', '#FFD23F', '#A98BFF', '#FF8C42'];

/**
 * Landing, organised as three steps: pick a subject, press JUGAR (continues
 * the Beat Tour), or pick another mode. Everything else lives in Ajustes.
 */
export class Menu {
  readonly root: HTMLDivElement;
  onPlay: () => void = () => {};
  onPlay2: () => void = () => {};
  onTour: () => void = () => {};
  onFree: () => void = () => {};
  onVoice: () => void = () => {};
  onCalibrate: () => void = () => {};
  onDifficulty: (id: DifficultyId) => void = () => {};
  onSubject: (id: string) => void = () => {};
  private best: HTMLElement;
  private diffDesc: HTMLElement;
  private sheet: HTMLElement;
  private diffLabel = 'NORMAL';
  private voiceOn = true;

  constructor(
    host: HTMLElement,
    pack: ContentPack,
    packs: ContentPack[],
  ) {
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
    const cardArt: Record<string, string> = { flags: 'es', capitals: 'fr' };
    const cardQ: Record<string, string> = { flags: '¿De qué país es la bandera?', capitals: '¿Cuál es su capital?' };
    const cards = packs
      .map((p) => {
        const sample = p.items.find((i) => i.id === (cardArt[p.id] ?? p.items[0].id)) ?? p.items[0];
        return `<button class="subject subject-card" type="button" role="radio" data-id="${p.id}">
          <span class="sc-art">${p.renderPrompt(sample)}</span>
          <span class="sc-text"><b>${p.subtitle.toUpperCase()}</b><span class="sc-q">${cardQ[p.id] ?? p.rule}</span></span>
          <i class="sc-check">✓</i>
        </button>`;
      })
      .join('');
    this.root = el(
      'menu screen',
      `<div class="menu-flags" aria-hidden="true">${flags}</div>
       <div class="logo" aria-label="${pack.title}"><div class="logo-row">${word('WORLD', 0)}</div><div class="logo-row">${word('BEAT', 5)}</div></div>
       <p class="menu-step">1 · ¿Qué quieres aprender?</p>
       <div class="subject-cards" role="radiogroup" aria-label="Asignatura">${cards}</div>
       <button class="btn-play btn-tour" type="button"><span class="play-main">▶ JUGAR</span><span class="play-sub"></span></button>
       <p class="menu-hint"><span class="rule"></span>. ${TOUCH ? 'Toca la pantalla' : 'Pulsa <kbd>ESPACIO</kbd>'} al ritmo.</p>
       <p class="menu-step">2 · Otros modos</p>
       <div class="menu-modes">
         <button class="mode btn-level1" type="button"><b>PARTIDA RÁPIDA</b><span class="mode-sub">3 min · con tutorial</span></button>
         <button class="mode btn-level2" type="button"><b class="l2-name"></b><span class="mode-sub">para expertos</span></button>
         <button class="mode btn-free" type="button"><b>BEAT LIBRE</b><span class="mode-sub">elige tus países</span></button>
       </div>
       <button class="btn-settings" type="button">⚙ AJUSTES <span class="settings-sum"></span></button>
       <div class="settings-sheet hidden" role="dialog" aria-label="Ajustes">
         <div class="sheet-card">
           <h3>AJUSTES</h3>
           <p class="sheet-label">Dificultad del ritmo</p>
           <div class="diff-row" role="radiogroup" aria-label="Dificultad">
             ${DIFFICULTY_ORDER.map((id) => `<button class="diff d-${id}" type="button" role="radio" data-id="${id}">${DIFFICULTIES[id].label}</button>`).join('')}
           </div>
           <p class="diff-desc"></p>
           <div class="sheet-row">
             <button class="btn-voice" type="button">VOZ: <b class="voice-state"></b></button>
             <button class="btn-calibrate" type="button">AJUSTAR RITMO</button>
           </div>
           <p class="sheet-note">¿Los golpes no cuadran con la música? Usa <b>Ajustar ritmo</b> (10 s).<br>La voz lee cada país nuevo; en algunos móviles puede descuadrar el ritmo.</p>
           <p class="menu-best"></p>
           <button class="btn-sheet-close" type="button">LISTO</button>
         </div>
       </div>`,
    );
    host.appendChild(this.root);
    this.best = this.root.querySelector('.menu-best')!;
    this.diffDesc = this.root.querySelector('.diff-desc')!;
    this.sheet = this.root.querySelector('.settings-sheet')!;
    const wire = (sel: string, fn: (b: HTMLButtonElement) => void): void =>
      this.root.querySelectorAll<HTMLButtonElement>(sel).forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          b.blur();
          fn(b);
        }),
      );
    wire('.subject', (b) => this.onSubject(b.dataset.id!));
    wire('.diff', (b) => this.onDifficulty(b.dataset.id as DifficultyId));
    wire('.btn-tour', () => this.onTour());
    wire('.btn-level1', () => this.onPlay());
    wire('.btn-level2', () => this.onPlay2());
    wire('.btn-free', () => this.onFree());
    wire('.btn-voice', () => this.onVoice());
    wire('.btn-calibrate', () => {
      this.closeSettings();
      this.onCalibrate();
    });
    wire('.btn-settings', () => this.openSettings());
    wire('.btn-sheet-close', () => this.closeSettings());
    this.sheet.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === this.sheet) this.closeSettings();
    });
  }

  show(v: boolean, best?: { score: number; combo: number }): void {
    this.root.classList.toggle('hidden', !v);
    if (!v) this.closeSettings();
    if (v) this.best.textContent = best && best.score > 0 ? `Récord en esta dificultad: ${best.score.toLocaleString('es-ES')} · mejor combo ${best.combo}` : '';
  }

  get settingsOpen(): boolean {
    return !this.sheet.classList.contains('hidden');
  }

  openSettings(): void {
    this.sheet.classList.remove('hidden');
    this.sheet.querySelector('.sheet-card')!.animate([{ transform: 'translateY(40px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
  }

  closeSettings(): void {
    this.sheet.classList.add('hidden');
  }

  /** "Beat Tour · Europa · Concierto 2" under JUGAR. */
  setContinue(text: string): void {
    this.root.querySelector('.play-sub')!.textContent = text;
  }

  setVoice(on: boolean): void {
    this.voiceOn = on;
    this.root.querySelector('.voice-state')!.textContent = on ? 'SÍ' : 'NO';
    this.summary();
  }

  setSubject(pack: ContentPack): void {
    this.root.querySelectorAll<HTMLButtonElement>('.subject').forEach((b) => {
      const on = b.dataset.id === pack.id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    this.root.querySelector('.l2-name')!.textContent = pack.levels[2].name;
    this.root.querySelector('.rule')!.textContent = pack.rule;
  }

  setDifficulty(id: DifficultyId): void {
    this.root.querySelectorAll<HTMLButtonElement>('.diff').forEach((b) => {
      const on = b.dataset.id === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    this.diffLabel = DIFFICULTIES[id].label;
    this.diffDesc.textContent = DIFFICULTIES[id].desc;
    this.summary();
  }

  private summary(): void {
    this.root.querySelector('.settings-sum')!.textContent = `· ${this.diffLabel} · VOZ ${this.voiceOn ? 'SÍ' : 'NO'}`;
  }
}

export interface ResultsData {
  mode: 'beat' | 'tour' | 'free';
  /** Beat Tour outcome. */
  tour?: { stars: number; passed: boolean; accuracyPct: number; hasNext: boolean };
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
  onNext: () => void = () => {};

  constructor(
    host: HTMLElement,
    public pack: ContentPack,
  ) {
    this.root = el('results screen hidden');
    host.appendChild(this.root);
  }

  show(v: boolean, d?: ResultsData): void {
    this.root.classList.toggle('hidden', !v);
    if (!v || !d) return;
    const cap = (it: LearningItem): string => {
      const c = this.pack.promptCaption?.(it);
      return c ? `<em>${c}</em>` : '';
    };
    const mini = (it: LearningItem, big = false): string => `<div class="rs-flag${big ? ' big' : ''}"><div class="rs-flag-art">${this.pack.renderPrompt(it)}</div>${cap(it)}<span>${this.pack.answerLabel(it)}</span></div>`;
    const bubble = (label: string, value: string, color: string, i: number): string => `<div class="rs-bubble" style="--bc:${color};--i:${i}"><b data-count="${value}">${value}</b><span>${label}</span></div>`;
    this.root.innerHTML = `
      <h1 class="rs-title"><span>BEAT</span><span>COMPLETE</span></h1>
      <p class="rs-level">${d.level}</p>${d.tour ? this.tourBanner(d.tour) : d.suggestion ? `<p class="rs-suggest">${d.suggestion}</p>` : ''}
      <div class="rs-body">
        <div class="rs-left">
          <div class="rs-big"><div class="rs-big-num"><b>${d.recognized}</b><small>/${d.total}</small></div><div class="rs-big-label">${this.pack.noun}<br>reconocidas</div></div>
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
      <div class="rs-buttons">${this.buttons(d)}</div>`;
    this.root.querySelectorAll<HTMLButtonElement>('.rs-buttons [data-act]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = b.dataset.act;
        if (act === 'next') this.onNext();
        else if (act === 'again') this.onAgain();
        else this.onRestart();
      }),
    );
  }

  private tourBanner(t: NonNullable<ResultsData['tour']>): string {
    const msg = t.passed ? (t.stars === 3 ? '¡CONCIERTO PERFECTO!' : '¡CONCIERTO SUPERADO!') : `Casi… ${t.accuracyPct} % · necesitas un 70 %`;
    return `<div class="rs-tour${t.passed ? ' passed' : ''}"><span class="rs-stars">${'★'.repeat(t.stars)}<i>${'★'.repeat(3 - t.stars)}</i></span><b>${msg}</b></div>`;
  }

  /** Big = primary (ENTER), small = secondary. */
  private buttons(d: ResultsData): string {
    const big = (act: string, label: string): string => `<button class="btn-again" type="button" data-act="${act}">${label} <small>ENTER</small></button>`;
    const small = (act: string, label: string, key = ''): string => `<button class="btn-restart" type="button" data-act="${act}">${label}${key ? ` <small>${key}</small>` : ''}</button>`;
    if (d.mode === 'tour') {
      const next = !!(d.tour?.passed && d.tour.hasNext);
      return next ? big('next', 'SIGUIENTE') + small('again', 'OTRA VEZ') + small('hub', 'GIRA', 'R') : big('again', 'OTRA VEZ') + small('hub', 'GIRA', 'R');
    }
    if (d.mode === 'free') return big('again', 'OTRA VEZ') + small('hub', 'BEAT LIBRE', 'R');
    return big('again', 'OTRA VEZ') + small('hub', 'REINICIAR', 'R');
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
    this.status.textContent = inputWord(text);
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
