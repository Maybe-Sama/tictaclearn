import type { ContentPack, LearningItem } from '../content/types';
import type { RhythmEngine } from '../rhythm/RhythmEngine';
import type { ChallengeOption, CueKind, Judgement, TextStyle } from '../rhythm/types';
import { GameState } from '../game/GameStateMachine';
import { PARTY, type Particles } from './Particles';
import { PLANET_SVG, STAMP_SVG } from './art';
import { L, inputWord } from './layout';
import { speak } from '../util/voice';

/** Stage coordinates come from the active layout (landscape or portrait). */
const HOP_HEIGHT = 34;

const SECTION_NAMES: Partial<Record<GameState, string>> = {
  [GameState.RhythmTutorial]: 'SIENTE EL RITMO',
  [GameState.GuidedPractice]: 'TU TURNO',
  [GameState.EasyGroove]: 'EASY BEAT',
  [GameState.TeachNewFlags]: 'NUEVO BEAT',
  [GameState.MixGroove]: 'MIX BEAT',
  [GameState.FinalGroove]: 'FINAL BEAT',
};

const MILESTONES: Record<number, string> = { 5: 'NICE!', 10: 'KEEP IT!', 30: 'ON FIRE!', 50: '¡IMPARABLE!', 75: 'NAILED IT!', 100: '¡LEYENDA!' };

interface Token {
  el: HTMLDivElement;
  tk: HTMLDivElement;
  detached: boolean;
}

/**
 * Tokens hop in lockstep every half beat and *land* on the 8th-note grid:
 * they rest, then jump, so every landing is a beat (or an "y") you can see
 * coming, and on-beat / offbeat tokens always keep their spacing.
 */
function hop(b: number, reduced: boolean, offbeat = false): { pos: number; lift: number; sx: number; sy: number } {
  if (reduced) return { pos: b, lift: 0, sx: 1, sy: 1 };
  const b2 = b * 2;
  const k = Math.ceil(b2);
  const u = k - b2;
  const H = 0.38;
  if (u < H) {
    const q = 1 - Math.min(1, u / 0.2);
    return { pos: k / 2, lift: 0, sx: 1 + 0.1 * q, sy: 1 - 0.14 * q };
  }
  const h = (u - H) / (1 - H);
  const e = h * h * (3 - 2 * h);
  const arc = Math.sin(Math.PI * h);
  // Bigger jump when landing on a downbeat, small skip on the "y".
  const onBeat = (k - 1 + (offbeat ? 1 : 0)) % 2 === 0 ? 1 : 0.55;
  return { pos: (k - e) / 2, lift: arc * onBeat, sx: 1 - 0.04 * arc, sy: 1 + 0.08 * arc };
}

export class Stage {
  readonly root: HTMLDivElement;
  private flagSlot: HTMLDivElement;
  private label: HTMLDivElement;
  private countRow: HTMLDivElement;
  private tokensEl: HTMLDivElement;
  private stampEl: HTMLDivElement;
  private keycap: HTMLDivElement;
  private pad: HTMLDivElement;
  private judgeEl: HTMLDivElement;
  private judgeMain: HTMLElement;
  private judgeSub: HTMLElement;
  private comboEl: HTMLDivElement;
  private comboNum: HTMLElement;
  private milestone: HTMLDivElement;
  private miniJudge: HTMLDivElement;
  private dj: HTMLDivElement;
  private sectionName: HTMLElement;
  private scoreNum: HTMLElement;
  private tokens = new Map<ChallengeOption, Token>();
  private moodTimer = 0;
  private lastBeat = -1;
  private hush = false;
  private feverAt = 30;

  constructor(
    host: HTMLElement,
    public pack: ContentPack,
    private fx: Particles,
    private reduced: boolean,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'game screen hidden';
    this.root.innerHTML = `
      <div class="halo" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="hud">
        <div class="pill section-pill"><span class="note">♪</span><span class="section-name"></span></div>
        <div class="pill score-pill"><span class="score-num">0</span></div>
      </div>
      <button class="btn-pause" type="button" aria-label="Pausa"><i></i><i></i></button>
      <div class="dj" aria-hidden="true"><div class="dj-body">${PLANET_SVG}</div><div class="dj-shadow"></div></div>
      <div class="combo"><b class="combo-num">0</b><span>COMBO</span></div>
      <div class="milestone"></div>
      <div class="flag-stage"><div class="flag-slot"></div></div>
      <div class="count-row" aria-hidden="true"><span>1</span><span>2</span><span>3</span><span>4</span></div>
      <div class="label-anchor"><div class="flag-label"></div></div>
      <div class="lane" aria-hidden="true">
        <div class="track"></div>
        ${[-2, -1, 1, 2, 3].map((k) => `<i class="dot" style="--k:${k}"></i>`).join('')}
        <div class="pad"><i></i></div>
      </div>
      <div class="tokens"></div>
      <div class="stamp">${STAMP_SVG}</div>
      <div class="judge" role="status" aria-live="polite"><b></b><span></span></div>
      <div class="mini-judge" aria-hidden="true"></div>
      <div class="fever-badge" aria-hidden="true">FEVER <b>×2</b></div>
      <div class="keycap"><span>${inputWord('ESPACIO')}</span></div>
      <div class="banners"></div>`;
    host.appendChild(this.root);
    const q = <T extends Element>(s: string): T => this.root.querySelector(s) as T;
    this.flagSlot = q('.flag-slot');
    this.label = q('.flag-label');
    this.countRow = q('.count-row');
    this.tokensEl = q('.tokens');
    this.stampEl = q('.stamp');
    this.keycap = q('.keycap');
    this.pad = q('.pad');
    this.judgeEl = q('.judge');
    this.judgeMain = q('.judge b');
    this.judgeSub = q('.judge span');
    this.comboEl = q('.combo');
    this.comboNum = q('.combo-num');
    this.milestone = q('.milestone');
    this.miniJudge = q('.mini-judge');
    this.dj = q('.dj');
    this.sectionName = q('.section-name');
    this.scoreNum = q('.score-num');
    q<HTMLButtonElement>('.btn-pause').addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      this.onPause();
    });
  }

  onPause: () => void = () => {};

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  reset(): void {
    for (const t of this.tokens.values()) t.el.remove();
    this.tokens.clear();
    this.flagSlot.innerHTML = '';
    this.setLabel('', 'hint');
    this.hideCount();
    this.root.querySelector('.banners')!.innerHTML = '';
    this.judgeEl.className = 'judge';
    this.setCombo(0, true);
    this.setScore(0);
    this.fx.clear();
    this.root.classList.remove('hush', 'fever-mode');
    document.body.classList.remove('fever-mode');
    this.hush = false;
  }

  setSection(state: GameState): void {
    this.root.dataset.section = state;
    const name = SECTION_NAMES[state];
    if (name) {
      this.sectionName.textContent = name;
      this.sectionName.parentElement!.animate([{ transform: 'scale(.6)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
    }
  }

  /** Override the HUD pill text (Beat Tour: stage + concert). */
  setPill(text: string): void {
    this.sectionName.textContent = text;
  }

  // ------------------------------------------------------------------ per frame

  render(now: number, engine: RhythmEngine): void {
    const info = engine.beatInfo(now);
    const root = document.documentElement;
    if (info) {
      const phase = info.beat - Math.floor(info.beat);
      const pulse = Math.exp(-phase * 5);
      root.style.setProperty('--pulse', pulse.toFixed(3));
      const gb = Math.floor(info.globalBeat + 1e-6);
      if (gb !== this.lastBeat) {
        this.lastBeat = gb;
        this.root.dataset.parity = gb % 2 ? 'odd' : 'even';
      }
      const hush = !!info.sp.phrase.dropBeats?.includes(Math.floor(info.beat));
      if (hush !== this.hush) {
        this.hush = hush;
        this.root.classList.toggle('hush', hush);
      }
    } else root.style.setProperty('--pulse', '0');

    for (const c of engine.challenges) {
      for (const o of c.options) {
        const b = (o.time - now) / o.beatDur;
        let tok = this.tokens.get(o);
        if (b > 3.7 || b < -2.3) {
          if (tok && !tok.detached && b < -2.3) {
            tok.el.remove();
            tok.detached = true;
          }
          continue;
        }
        if (!tok) {
          tok = this.makeToken(o);
          this.tokens.set(o, tok);
        }
        if (tok.detached) continue;
        const h = hop(b, this.reduced, o.offbeat);
        const x = L.padX + L.spacing * h.pos;
        const y = L.laneY - HOP_HEIGHT * h.lift;
        const near = Math.max(0, 1 - Math.abs(b) / 0.6);
        const s = 0.88 + 0.22 * near;
        const op = b > 3.2 ? (3.7 - b) / 0.5 : b < -1.5 ? Math.max(0, (b + 2.3) / 0.8) : 1;
        tok.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(s * h.sx).toFixed(3)}, ${(s * h.sy).toFixed(3)})`;
        tok.el.style.opacity = op.toFixed(3);
      }
    }
    for (const [o, tok] of this.tokens) {
      if (now - o.time > 4) {
        tok.el.remove();
        this.tokens.delete(o);
      }
    }
  }

  private makeToken(o: ChallengeOption): Token {
    const el = document.createElement('div');
    el.className = 'token';
    const tk = document.createElement('div');
    if (o.kind === 'drum') {
      tk.className = `tk drum${o.offbeat ? ' off' : ''}${o.bell ? ' bell' : ''}${o.challenge.spec.ghost ? ' ghost' : ''}`;
      tk.innerHTML = `<span class="drum-face">${o.offbeat ? 'y' : ''}</span>`;
    } else {
      // All names of one flag share a tint, so consecutive flags read as groups.
      const label = o.item ? this.pack.answerLabel(o.item) : '';
      // Long names (SRI JAYAWARDENAPURA KOTTE…) shrink to fit the lane.
      tk.className = `tk c${o.challenge.id % 5}${label.length > 15 ? ' len-xl' : label.length > 10 ? ' len-l' : ''}`;
      if (o.correct && o.challenge.spec.glowCorrect) tk.classList.add('glow');
      tk.innerHTML = `<span class="tk-flag"></span><span class="tk-name">${o.item ? this.pack.answerLabel(o.item) : ''}</span><span class="tk-ink">★</span>`;
    }
    el.appendChild(tk);
    el.style.opacity = '0';
    this.tokensEl.appendChild(el);
    return { el, tk, detached: false };
  }

  // ------------------------------------------------------------------ flags

  showFlag(targets: LearningItem[], hint: boolean): void {
    this.hideCount();
    const group = document.createElement('div');
    group.className = `flag-group n${targets.length}`;
    for (const t of targets) group.appendChild(this.flagCard(t));
    this.swapFlag(group);
    this.setLabel(hint ? targets.map((t) => this.pack.answerLabel(t)).join(' + ') : '', 'hint');
  }

  showTeach(item: LearningItem): void {
    this.hideCount();
    const group = document.createElement('div');
    group.className = 'flag-group n1 teach';
    group.appendChild(this.flagCard(item));
    this.swapFlag(group);
    this.setLabel(this.pack.answerLabel(item), 'teach');
    speak(this.pack.spoken(item));
    this.fx.burst(L.flagX, L.flagY, { n: 10, shape: 'star', speed: 520, size: 16 });
  }

  /** Flash: the flag flips to a "?" card. The eyes stay, peeking. */
  coverFlag(): void {
    this.flagSlot.querySelectorAll<HTMLElement>('.flag-group:not(.leaving) .flag-card').forEach((card) => {
      if (card.querySelector('.cover')) return;
      card.classList.add('covered');
      const c = document.createElement('div');
      c.className = 'cover';
      c.textContent = '?';
      card.appendChild(c);
      c.animate([{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0)' }], { duration: this.reduced ? 1 : 180, easing: 'ease-out' });
    });
    this.setLabel('', 'hint');
  }

  clearFlag(): void {
    this.swapFlag(null);
    this.setLabel('', 'hint');
    this.hideCount();
  }

  private flagCard(item: LearningItem): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'flag-card';
    const caption = this.pack.promptCaption?.(item);
    card.innerHTML = `<div class="flag-art">${this.pack.renderPrompt(item)}</div>${caption ? `<div class="prompt-caption${caption.length > 14 ? ' long' : ''}">${caption}</div>` : ''}<div class="eyes"><i><b></b></i><i><b></b></i></div>`;
    return card;
  }

  private swapFlag(group: HTMLDivElement | null): void {
    this.flagSlot.querySelectorAll<HTMLElement>('.flag-group:not(.leaving)').forEach((old) => {
      old.classList.add('leaving');
      const a = old.animate([{ transform: 'scale(1) rotate(0)', opacity: 1 }, { transform: 'translateY(60px) scale(.2) rotate(25deg)', opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      a.onfinish = () => old.remove();
    });
    if (group) {
      this.flagSlot.appendChild(group);
      group.animate(
        [
          { transform: 'scale(0) rotate(-18deg)' },
          { transform: 'scale(1.14) rotate(4deg)', offset: 0.6 },
          { transform: 'scale(1) rotate(0)' },
        ],
        { duration: this.reduced ? 1 : 380, easing: 'cubic-bezier(.2,.9,.3,1.2)' },
      );
    }
  }

  private setLabel(text: string, mode: 'hint' | 'teach'): void {
    this.label.className = `flag-label ${mode}${text ? ' show' : ''}${text.length > 16 ? ' long' : ''}`;
    this.label.textContent = text;
    if (text) {
      this.label.animate(
        [
          { transform: 'translateY(-50%) scale(.3) rotate(-8deg)', opacity: 0 },
          { transform: 'translateY(-50%) scale(1.1) rotate(2deg)', opacity: 1, offset: 0.6 },
          { transform: 'translateY(-50%) scale(1) rotate(-2deg)', opacity: 1 },
        ],
        { duration: 320, delay: mode === 'teach' ? 140 : 0, easing: 'ease-out', fill: 'backwards' },
      );
    }
  }

  cue(kind: CueKind): void {
    if (kind === 'reveal' || this.reduced) return;
    const g = this.flagSlot.querySelector<HTMLElement>('.flag-group:not(.leaving)');
    if (!g) return;
    g.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg) scale(1.06)', offset: 0.3 }, { transform: 'rotate(0)' }], { duration: 180, easing: 'ease-out' });
  }

  /** The flag bobs to every drum you land: it is dancing with you. */
  private flagBob(): void {
    if (this.reduced) return;
    const g = this.flagSlot.querySelector<HTMLElement>('.flag-group:not(.leaving)');
    g?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07, .93) translateY(8px)', offset: 0.25 }, { transform: 'scale(1)' }], { duration: 170, easing: 'ease-out' });
  }

  showCount(n: number): void {
    this.countRow.classList.add('show');
    const spans = this.countRow.querySelectorAll('span');
    spans.forEach((s, i) => s.classList.toggle('on', i === n - 1));
    const on = spans[n - 1];
    on?.animate([{ transform: 'scale(1.7) translateY(-10px)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  }

  private hideCount(): void {
    this.countRow.classList.remove('show');
  }

  // ------------------------------------------------------------------ text

  showText(text: string, sub: string | undefined, style: TextStyle, durSec: number): void {
    const host = this.root.querySelector('.banners')!;
    if (style !== 'top') host.querySelectorAll('.banner:not(.top)').forEach((b) => b.remove());
    else host.querySelectorAll('.banner.top').forEach((b) => b.remove());
    const el = document.createElement('div');
    el.className = `banner ${style}`;
    el.innerHTML = `<h1></h1>${sub ? '<p></p>' : ''}`;
    el.querySelector('h1')!.textContent = inputWord(text);
    if (sub) el.querySelector('p')!.textContent = inputWord(sub);
    host.appendChild(el);
    const inMs = style === 'top' ? 260 : 420;
    const total = Math.max(inMs + 300, durSec * 1000);
    const from = style === 'top' ? 'translate(-50%, -30px) scale(.8)' : 'translate(-50%, -50%) scale(2.2) rotate(-8deg)';
    const mid = style === 'top' ? 'translate(-50%, 0) scale(1)' : 'translate(-50%, -50%) scale(1) rotate(-3deg)';
    const out = style === 'top' ? 'translate(-50%, -20px) scale(.95)' : 'translate(-50%, -60%) scale(.9) rotate(-3deg)';
    const a = el.animate(
      [
        { transform: from, opacity: 0 },
        { transform: mid, opacity: 1, offset: Math.min(0.4, inMs / total) },
        { transform: mid, opacity: 1, offset: 0.88 },
        { transform: out, opacity: 0 },
      ],
      { duration: total, easing: 'cubic-bezier(.2,.9,.3,1.1)', fill: 'forwards' },
    );
    a.onfinish = () => el.remove();
  }

  // ------------------------------------------------------------------ feedback

  stamp(): void {
    if (!this.reduced) {
      this.stampEl.animate(
        [
          { transform: 'translate(-50%, 0) scale(1)' },
          { transform: 'translate(-50%, 112px) scale(1.06, .9)', offset: 0.3 },
          { transform: 'translate(-50%, 112px) scale(1.06, .9)', offset: 0.45 },
          { transform: 'translate(-50%, 0) scale(1)' },
        ],
        { duration: 210, easing: 'ease-out' },
      );
    }
    this.keycap.animate([{ transform: 'translate(-50%, 0)' }, { transform: 'translate(-50%, 8px)', offset: 0.3 }, { transform: 'translate(-50%, 0)' }], { duration: 180 });
    this.keycap.classList.add('down');
    window.setTimeout(() => this.keycap.classList.remove('down'), 120);
  }

  feedback(j: Judgement): void {
    if (j.kind === 'whiff') return;
    const o = j.option;
    const tok = o ? this.tokens.get(o) : undefined;

    if (j.drum) {
      this.drumFeedback(j, tok);
      return;
    }

    if (j.grade !== 'miss') {
      const perfect = j.grade === 'perfect';
      const sub = perfect || j.side === 'center' ? '' : j.side === 'early' ? 'early' : 'late';
      this.judgeText(perfect ? 'PERFECT!' : 'GOOD', sub, perfect ? 'perfect' : 'good');
      this.pad.animate([{ transform: 'translate(-50%,-50%) scale(1.25)', filter: 'brightness(1.4)' }, { transform: 'translate(-50%,-50%) scale(1)', filter: 'none' }], { duration: 260, easing: 'ease-out' });
      this.fx.burst(L.padX, L.laneY - 20, perfect ? { n: 18, shape: 'star', speed: 640, size: 18 } : { n: 8, shape: 'dot', speed: 380, size: 12 });
      this.flagReact(perfect ? 'perfect' : 'good');
      if (tok) this.tokenHit(tok, perfect);
      if (perfect && !this.reduced) this.root.animate([{ transform: 'scale(1.006)' }, { transform: 'scale(1)' }], { duration: 160 });
      return;
    }

    switch (j.errorKind) {
      case 'knowledge':
        this.judgeText('¡ESE NO!', '', 'wrong');
        if (tok) this.tokenWrong(tok);
        this.flagReact('huh');
        break;
      case 'rhythm':
        this.judgeText(j.side === 'early' ? 'EARLY!' : 'LATE!', 'casi…', 'miss');
        if (tok) this.tokenLate(tok);
        this.flagReact('huh');
        break;
      case 'noResponse':
        if (tok && o?.item) this.tokenReveal(tok, o.item);
        if (!j.silent) {
          this.judgeText('¡SE ESCAPÓ!', '', 'miss');
          this.flagReact('dizzy');
        }
        break;
      default:
        this.judgeText('¡UPS!', 'fuera de ritmo', 'miss');
        this.flagReact('huh');
    }
  }

  /** Drums get a small, quick read-out so country hits keep the big moment. */
  private drumFeedback(j: Judgement, tok: Token | undefined): void {
    const hit = j.grade !== 'miss';
    const label = j.grade === 'perfect' ? 'PERFECT' : j.grade === 'good' ? (j.side === 'early' ? 'GOOD · early' : j.side === 'late' ? 'GOOD · late' : 'GOOD') : j.side === 'early' && j.kind === 'hit' ? 'EARLY' : 'MISS';
    this.miniJudge.textContent = label;
    this.miniJudge.className = `mini-judge ${j.grade}`;
    this.miniJudge.getAnimations().forEach((a) => a.cancel());
    this.miniJudge.animate(
      [
        { transform: 'translate(-50%, 0) scale(.6)', opacity: 0 },
        { transform: 'translate(-50%, -8px) scale(1.1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -26px) scale(1)', opacity: 0 },
      ],
      { duration: 420, easing: 'ease-out', fill: 'forwards' },
    );
    if (hit) {
      this.pad.animate([{ transform: 'translate(-50%,-50%) scale(1.12)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 160, easing: 'ease-out' });
      this.fx.burst(L.padX, L.laneY - 10, { n: j.grade === 'perfect' ? 7 : 4, shape: 'dot', speed: 360, size: 10, life: 0.45 });
      this.flagBob();
      if (tok) {
        tok.detached = true;
        tok.el.style.opacity = '1';
        tok.tk.animate(
          [
            { transform: 'scale(1)', opacity: 1 },
            { transform: 'scale(1.5, .7)', opacity: 1, offset: 0.2 },
            { transform: 'scale(1.9)', opacity: 0 },
          ],
          { duration: 260, easing: 'ease-out', fill: 'forwards' },
        );
      }
    } else if (tok) tok.tk.classList.add('missed');
  }

  private judgeText(main: string, sub: string, cls: string): void {
    this.judgeEl.className = `judge show ${cls}`;
    this.judgeMain.textContent = main;
    this.judgeSub.textContent = sub;
    this.judgeEl.getAnimations().forEach((a) => a.cancel());
    this.judgeEl.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.4) rotate(-10deg)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.15) rotate(3deg)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%,-50%) scale(1) rotate(-2deg)', opacity: 1, offset: 0.4 },
        { transform: 'translate(-50%,-80%) scale(1) rotate(-2deg)', opacity: 0 },
      ],
      { duration: 780, easing: 'ease-out', fill: 'forwards' },
    );
  }

  private flagReact(kind: 'perfect' | 'good' | 'huh' | 'dizzy'): void {
    const slot = this.flagSlot;
    if (!slot.querySelector('.flag-group:not(.leaving)')) return;
    slot.dataset.mood = kind === 'perfect' || kind === 'good' ? 'happy' : kind;
    window.clearTimeout(this.moodTimer);
    this.moodTimer = window.setTimeout(() => (slot.dataset.mood = ''), kind === 'dizzy' ? 900 : 520);
    if (this.reduced) {
      slot.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 200 });
      return;
    }
    const frames: Keyframe[] =
      kind === 'perfect'
        ? [{ transform: 'scale(1)' }, { transform: 'scale(1.3) rotate(-3deg)', offset: 0.35 }, { transform: 'scale(1)' }]
        : kind === 'good'
          ? [{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: 0.4 }, { transform: 'scale(1)' }]
          : kind === 'huh'
            ? [{ transform: 'rotate(0)' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(7deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(0)' }]
            : [{ transform: 'rotateY(0) rotate(0)' }, { transform: 'rotateY(360deg) rotate(-12deg)', offset: 0.7 }, { transform: 'rotateY(360deg) rotate(0)' }];
    slot.animate(frames, { duration: kind === 'perfect' ? 320 : kind === 'dizzy' ? 700 : 320, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }

  private tokenHit(tok: Token, perfect: boolean): void {
    tok.detached = true;
    tok.el.style.opacity = '1';
    tok.tk.classList.add('stamped', perfect ? 'perfect' : 'good');
    tok.tk.animate(
      [
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(8px) scale(1.2, .8)', offset: 0.12 },
        { transform: 'translateY(-30px) scale(1.12)', offset: 0.45 },
        { transform: 'translateY(-130px) scale(.8)', opacity: 0 },
      ],
      { duration: 650, easing: 'ease-out', fill: 'forwards' },
    );
  }

  private tokenWrong(tok: Token): void {
    tok.tk.classList.add('wrong');
    tok.tk.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px) rotate(-6deg)' }, { transform: 'translateX(9px) rotate(5deg)' }, { transform: 'translateX(0)' }], { duration: 260 });
  }

  private tokenLate(tok: Token): void {
    tok.tk.classList.add('late');
    tok.tk.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-8deg) scale(.95)' }, { transform: 'rotate(0)' }], { duration: 240 });
  }

  /** The name you let pass shows its flag: a free mini-lesson, no text needed. */
  private tokenReveal(tok: Token, item: LearningItem): void {
    tok.tk.classList.add('reveal');
    tok.tk.querySelector('.tk-flag')!.innerHTML = this.pack.renderPrompt(item);
    tok.tk.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' });
  }

  // ------------------------------------------------------------------ combo & score

  setCombo(n: number, quiet = false): void {
    const prev = Number(this.comboNum.textContent) || 0;
    this.comboNum.textContent = String(n);
    this.comboEl.classList.toggle('show', n >= 2);
    this.dj.classList.toggle('groovy', n >= Math.round(this.feverAt * 0.54));
    this.dj.classList.toggle('fever', n >= this.feverAt);
    this.root.classList.toggle('fever', n >= this.feverAt);
    if (quiet) return;
    if (n > prev && n >= 2) {
      this.comboNum.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.3,1.6,.5,1)' });
      const m = MILESTONES[n];
      if (m) {
        this.milestone.textContent = m;
        this.milestone.animate(
          [
            { transform: 'translate(-50%,-50%) scale(.3) rotate(-12deg)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(1.1) rotate(6deg)', opacity: 1, offset: 0.2 },
            { transform: 'translate(-50%,-50%) scale(1) rotate(6deg)', opacity: 1, offset: 0.75 },
            { transform: 'translate(-50%,-90%) scale(1) rotate(6deg)', opacity: 0 },
          ],
          { duration: 1100, easing: 'ease-out' },
        );
        this.fx.burst(L.djX, L.djY + 30, { n: 26, shape: 'rect', speed: 700, size: 16, colors: PARTY });
      }
    } else if (n === 0 && prev >= 5) {
      this.comboEl.classList.add('lost');
      this.dj.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(16px) rotate(-8deg)' }, { transform: 'translateY(0)' }], { duration: 420 });
      window.setTimeout(() => this.comboEl.classList.remove('lost'), 400);
    }
  }

  setFever(on: boolean): void {
    this.root.classList.toggle('fever-mode', on);
    document.body.classList.toggle('fever-mode', on);
    if (on) {
      this.showText('FEVER!', 'puntos ×2', 'big', 1.1);
      this.fx.burst(L.flagX, L.flagY, { n: 50, shape: 'star', speed: 1000, size: 22 });
      this.fx.rain(60);
    }
  }

  streak(n: number): void {
    this.milestone.textContent = `★ ${n} PERFECT`;
    this.milestone.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.75 },
        { transform: 'translate(-50%,-90%) scale(1)', opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-out' },
    );
  }

  setFeverAt(n: number): void {
    this.feverAt = n;
  }

  setScore(n: number): void {
    this.scoreNum.textContent = n.toLocaleString('es-ES');
  }

  confetti(): void {
    this.fx.rain(70);
  }

  finale(bigWin: boolean): void {
    this.fx.rain(bigWin ? 160 : 90);
    this.fx.burst(L.flagX, L.flagY, { n: 40, shape: 'star', speed: 900, size: 22 });
    this.dj.animate([{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(360deg) scale(1.3)' }, { transform: 'rotate(360deg) scale(1)' }], { duration: 900, easing: 'ease-out' });
  }
}
