import { CONTINENTS } from '../content/countries';
import type { ContentPack } from '../content/types';
import type { Progress } from '../game/Progress';
import { concertUnlocked, stageUnlocked, type ConcertDef, type StageDef } from '../game/Tour';

const stars = (n: number): string => `<span class="stars" aria-label="${n} de 3 estrellas">${'★'.repeat(n)}<i>${'★'.repeat(3 - n)}</i></span>`;

/** BEAT TOUR map: stages as tabs, concerts as a grid of stops. */
export class TourScreen {
  readonly root: HTMLDivElement;
  onBack: () => void = () => {};
  onPlay: (c: ConcertDef) => void = () => {};
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
      if (act === 'back') this.onBack();
      else if (act === 'stage') this.selectStage(Number(t.dataset.i));
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
    if (stageIdx !== undefined) this.stageIdx = stageIdx;
    else {
      // Land on the furthest unlocked stage, on its first concert without stars.
      let s = 0;
      for (let i = 0; i < stages.length; i++) if (stageUnlocked(stages, progress, pack.id, i)) s = i;
      this.stageIdx = s;
    }
    const st = stages[this.stageIdx];
    this.focus = focus ?? Math.max(0, st.concerts.findIndex((c) => !progress.concert(pack.id, c.id)?.passed && concertUnlocked(stages, progress, pack.id, c)));
    this.render();
  }

  selectStage(i: number): void {
    if (!stageUnlocked(this.stages, this.progress, this.pack.id, i)) return;
    this.stageIdx = i;
    this.focus = 0;
    this.render();
  }

  move(dx: number, dy: number): void {
    if (dy) {
      const i = this.stageIdx + dy;
      if (i >= 0 && i < this.stages.length) this.selectStage(i);
      return;
    }
    const n = this.stages[this.stageIdx].concerts.length;
    this.focus = Math.max(0, Math.min(n - 1, this.focus + dx));
    this.render();
  }

  confirm(): void {
    const c = this.stages[this.stageIdx]?.concerts[this.focus];
    if (c && concertUnlocked(this.stages, this.progress, this.pack.id, c)) this.onPlay(c);
  }

  private render(): void {
    const { pack, progress, stages } = this;
    const all = stages.flatMap((s) => s.concerts.map((c) => c.id));
    const total = progress.totalStars(pack.id, all);
    const stage = stages[this.stageIdx];
    const tabs = stages
      .map((s, i) => {
        const open = stageUnlocked(stages, progress, pack.id, i);
        const got = progress.totalStars(pack.id, s.concerts.map((c) => c.id));
        return `<button type="button" class="stage-tab${i === this.stageIdx ? ' on' : ''}${open ? '' : ' locked'}" data-act="stage" data-i="${i}" style="--sc:${s.color}" ${open ? '' : 'aria-disabled="true"'}>
          <b>${i + 1}</b><span>${s.name}</span><small>${open ? `★ ${got}/${s.concerts.length * 3}` : '🔒'}</small></button>`;
      })
      .join('');
    const grid = stage.concerts
      .map((c, i) => {
        const open = concertUnlocked(stages, progress, pack.id, c);
        const rec = progress.concert(pack.id, c.id);
        const flags = (c.newIds.length ? c.newIds : c.poolIds).slice(0, 5).map((id) => pack.renderPrompt(pack.byId(id))).join('');
        return `<button type="button" class="stop${c.final ? ' final' : ''}${open ? '' : ' locked'}${rec?.passed ? ' done' : ''}${i === this.focus ? ' focus' : ''}" data-act="concert" data-i="${i}" style="--sc:${stage.color}" ${open ? '' : 'aria-disabled="true"'}>
          <span class="stop-num">${c.final ? '♛' : open ? i + 1 : '🔒'}</span>
          <span class="stop-title">${c.theme ?? c.title}</span>
          ${stars(rec?.stars ?? 0)}
          <span class="stop-flags">${flags}</span>
        </button>`;
      })
      .join('');
    this.root.innerHTML = `
      <div class="hub-head">
        <button type="button" class="hub-back" data-act="back">‹ MENÚ</button>
        <h2>BEAT TOUR <small>${pack.subtitle}</small></h2>
        <div class="hub-stars">★ ${total}<small>/${all.length * 3}</small></div>
      </div>
      <div class="stage-tabs">${tabs}</div>
      <div class="stage-name" style="--sc:${stage.color}">${stage.name}<small>${stage.itemIds.length} ${pack.noun}</small></div>
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
      } else if (act === 'play') this.play();
    });
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  open(pack: ContentPack, progress: Progress): void {
    if (this.pack !== pack) this.selected.clear();
    this.pack = pack;
    this.progress = progress;
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
        <button type="button" class="hub-back" data-act="back">‹ MENÚ</button>
        <h2>BEAT LIBRE <small>${pack.subtitle}</small></h2>
        <div class="legend"><i class="m-nuevo"></i>nuevo <i class="m-aprendiendo"></i>aprendiendo <i class="m-dominado"></i>dominado</div>
      </div>
      <div class="stage-tabs">${tabs}</div>
      <div class="free-tools">
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
