import { CONTINENTS } from '../content/countries';
import type { ContentPack } from '../content/types';
import type { Progress } from '../game/Progress';
import type { ConcertDef, StageDef } from '../game/Tour';

const shuffled = <T>(a: T[]): T[] => [...a].sort(() => Math.random() - 0.5);

const stars = (n: number): string => `<span class="stars" aria-label="${n} de 3 estrellas">${'★'.repeat(n)}<i>${'★'.repeat(3 - n)}</i></span>`;

/** BEAT TOUR: first pick the part of the world, then the concert. Nothing is locked. */
export class TourScreen {
  readonly root: HTMLDivElement;
  onBack: () => void = () => {};
  onPlay: (c: ConcertDef) => void = () => {};
  view: 'worlds' | 'concerts' = 'worlds';
  private stageIdx = 0;
  private focus = 0;
  private stages: StageDef[] = [];
  private pack!: ContentPack;
  private progress!: Progress;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hub tour screen hidden';
    host.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t) return;
      e.stopPropagation();
      (t as HTMLButtonElement).blur?.();
      const act = t.dataset.act;
      if (act === 'back') this.back();
      else if (act === 'stage') this.openStage(Number(t.dataset.i));
      else if (act === 'concert') {
        this.focus = Number(t.dataset.i);
        this.confirm();
      }
    });
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  open(pack: ContentPack, stages: StageDef[], progress: Progress, stageIdx?: number, focus?: number): void {
    this.pack = pack;
    this.stages = stages;
    this.progress = progress;
    if (stageIdx === undefined) {
      this.view = 'worlds';
    } else {
      this.view = 'concerts';
      this.stageIdx = stageIdx;
      this.focus = focus ?? 0;
    }
    this.render();
  }

  /** Back goes worlds -> caller, concerts -> worlds. */
  back(): void {
    if (this.view === 'concerts') {
      this.view = 'worlds';
      this.render();
    } else this.onBack();
  }

  private openStage(i: number): void {
    this.stageIdx = i;
    this.view = 'concerts';
    const st = this.stages[i];
    this.focus = Math.max(0, st.concerts.findIndex((c) => !this.progress.concert(this.pack.id, c.id)?.passed));
    this.render();
  }

  move(dx: number, dy: number): void {
    const d = dx || dy;
    if (this.view === 'worlds') {
      this.focus = Math.max(0, Math.min(this.stages.length - 1, this.focus + d));
    } else {
      this.focus = Math.max(0, Math.min(this.stages[this.stageIdx].concerts.length - 1, this.focus + d));
    }
    this.render();
  }

  confirm(): void {
    if (this.view === 'worlds') {
      this.openStage(this.focus);
      return;
    }
    const c = this.stages[this.stageIdx]?.concerts[this.focus];
    if (c) this.onPlay(c);
  }

  private head(title: string, back: string): string {
    const all = this.stages.flatMap((s) => s.concerts.map((c) => c.id));
    const total = this.progress.totalStars(this.pack.id, all);
    return `<div class="hub-head">
        <button type="button" class="hub-back" data-act="back">‹ ${back}</button>
        <h2>${title}<small>${this.pack.subtitle}</small></h2>
        <div class="hub-stars">★ ${total}<small>/${all.length * 3}</small></div>
      </div>`;
  }

  private render(): void {
    const { pack, progress, stages } = this;
    if (this.view === 'worlds') {
      const cards = stages
        .map((s, i) => {
          const got = progress.totalStars(pack.id, s.concerts.map((c) => c.id));
          const done = s.concerts.filter((c) => progress.concert(pack.id, c.id)?.passed).length;
          const flags = s.itemIds.slice(0, 6).map((id) => pack.renderPrompt(pack.byId(id))).join('');
          return `<button type="button" class="world-card${i === this.focus ? ' focus' : ''}" data-act="stage" data-i="${i}" style="--sc:${s.color}">
            <span class="wc-top"><b>${s.name}</b><small>${s.itemIds.length} ${pack.noun}</small></span>
            <span class="wc-flags">${flags}</span>
            <span class="wc-foot"><span class="stars">★ ${got}<i>/${s.concerts.length * 3}</i></span><small>${done}/${s.concerts.length} conciertos</small></span>
          </button>`;
        })
        .join('');
      this.root.innerHTML = `${this.head('ELIGE ZONA', 'ATRÁS')}
        <div class="world-cards">${cards}</div>
        <p class="hub-hint">Puedes empezar por donde quieras. Cada concierto enseña países nuevos y repasa los anteriores.</p>`;
      return;
    }
    const stage = stages[this.stageIdx];
    const grid = stage.concerts
      .map((c, i) => {
        const rec = progress.concert(pack.id, c.id);
        const flags = (c.newIds.length ? c.newIds : c.poolIds).slice(0, 5).map((id) => pack.renderPrompt(pack.byId(id))).join('');
        return `<button type="button" class="stop${c.final ? ' final' : ''}${rec?.passed ? ' done' : ''}${i === this.focus ? ' focus' : ''}" data-act="concert" data-i="${i}" style="--sc:${stage.color}">
          <span class="stop-num">${c.final ? '♛' : i + 1}</span>
          <span class="stop-title">${c.theme ?? c.title}</span>
          ${stars(rec?.stars ?? 0)}
          <span class="stop-flags">${flags}</span>
        </button>`;
      })
      .join('');
    this.root.innerHTML = `${this.head(stage.name, 'ZONAS')}
      <div class="stops">${grid}</div>
      <p class="hub-hint">Supera cada concierto reconociendo el 70 %. La 3.ª estrella necesita, además, ir a ritmo.</p>`;
  }
}

/** BEAT LIBRE: pick a continent or single countries. Tiles show mastery. */
export class FreeScreen {
  readonly root: HTMLDivElement;
  onBack: () => void = () => {};
  onPlay: (ids: string[]) => void = () => {};
  private selected = new Set<string>();
  private filter = 'europa';
  private difficulty = '';
  private pack!: ContentPack;
  private progress!: Progress;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hub free screen hidden';
    host.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t) return;
      e.stopPropagation();
      (t as HTMLButtonElement).blur?.();
      const act = t.dataset.act;
      if (act === 'back') this.onBack();
      else if (act === 'filter') {
        this.filter = t.dataset.id!;
        this.render();
      } else if (act === 'pick') {
        const id = t.dataset.id!;
        if (this.selected.has(id)) this.selected.delete(id);
        else this.selected.add(id);
        t.classList.toggle('sel');
        this.renderFooter();
      } else if (act === 'all') {
        this.visible().forEach((i) => this.selected.add(i));
        this.render();
      } else if (act === 'weak') {
        this.selected.clear();
        this.weakest().forEach((i) => this.selected.add(i));
        this.render();
      } else if (act === 'clear') {
        this.selected.clear();
        this.render();
      } else if (act === 'random') {
        this.selected.clear();
        shuffled(this.pack.items.map((i) => i.id))
          .slice(0, 10)
          .forEach((id) => this.selected.add(id));
        this.render();
      } else if (act === 'randomHere') {
        this.selected.clear();
        shuffled(this.visible()).slice(0, 10).forEach((id) => this.selected.add(id));
        this.render();
      } else if (act === 'play') this.play();
    });
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  open(pack: ContentPack, progress: Progress, difficulty = ''): void {
    if (this.pack !== pack) this.selected.clear();
    this.pack = pack;
    this.progress = progress;
    this.difficulty = difficulty;
    this.render();
  }

  play(): void {
    if (this.selected.size >= 3) this.onPlay([...this.selected]);
  }

  private visible(): string[] {
    return this.pack.items.filter((i) => i.continent === this.filter).map((i) => i.id);
  }

  /** Up to 12 practised-but-shaky countries, most urgent first. */
  private weakest(): string[] {
    return this.pack.items
      .map((i) => i.id)
      .filter((id) => this.progress.level(this.pack.id, id) === 'aprendiendo')
      .sort((a, b) => this.progress.urgency(this.pack.id, a) - this.progress.urgency(this.pack.id, b))
      .slice(0, 12);
  }

  private render(): void {
    const { pack, progress } = this;
    const tabs = CONTINENTS.map((c) => `<button type="button" class="stage-tab slim${c.id === this.filter ? ' on' : ''}" data-act="filter" data-id="${c.id}" style="--sc:${c.color}"><span>${c.name}</span></button>`).join('');
    const tiles = pack.items
      .filter((i) => i.continent === this.filter)
      .map((i) => {
        const lvl = progress.level(pack.id, i.id);
        const sub = pack.promptCaption ? `<em>${pack.answerLabel(i)}</em>` : '';
        return `<button type="button" class="pick m-${lvl}${this.selected.has(i.id) ? ' sel' : ''}" data-act="pick" data-id="${i.id}" title="${i.country}">
          <span class="pick-flag">${pack.renderPrompt(i)}</span><span class="pick-name">${i.country}</span>${sub}<i class="pick-check">✓</i></button>`;
      })
      .join('');
    const weakCount = this.weakest().length;
    this.root.innerHTML = `
      <div class="hub-head">
        <button type="button" class="hub-back" data-act="back">‹ ATRÁS</button>
        <h2>BEAT LIBRE <small>${pack.subtitle}${this.difficulty ? ` · ${this.difficulty}` : ''}</small></h2>
        <div class="legend"><i class="m-nuevo"></i>nuevo <i class="m-aprendiendo"></i>aprendiendo <i class="m-dominado"></i>dominado</div>
      </div>
      <div class="stage-tabs">${tabs}</div>
      <div class="free-tools">
        <button type="button" class="chip hot" data-act="random">🎲 ALEATORIO (10 del mundo)</button>
        <button type="button" class="chip" data-act="randomHere">🎲 10 DE ${CONTINENTS.find((c) => c.id === this.filter)!.name}</button>
        <button type="button" class="chip" data-act="all">+ TODO ${CONTINENTS.find((c) => c.id === this.filter)!.name}</button>
        <button type="button" class="chip" data-act="weak" ${weakCount ? '' : 'disabled'}>LOS QUE FALLO (${weakCount})</button>
        <button type="button" class="chip" data-act="clear">LIMPIAR</button>
      </div>
      <div class="picks">${tiles}</div>
      <div class="free-foot"></div>`;
    this.renderFooter();
  }

  private renderFooter(): void {
    const n = this.selected.size;
    this.root.querySelector('.free-foot')!.innerHTML = `<span>${n} seleccionad${n === 1 ? 'o' : 'os'}${n < 3 ? ' · elige al menos 3' : ''}</span>
      <button type="button" class="btn-free-play" data-act="play" ${n >= 3 ? '' : 'disabled'}>JUGAR</button>`;
  }
}
