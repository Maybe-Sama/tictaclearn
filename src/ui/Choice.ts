export interface ChoiceItem {
  id: string;
  title: string;
  sub?: string;
  /** Inline markup for the illustration (a flag, an icon…). */
  art?: string;
  color?: string;
  badge?: string;
}

/** One step of the "how do you want to play?" flow: a title and big cards. */
export class ChoiceScreen {
  readonly root: HTMLDivElement;
  onPick: (id: string) => void = () => {};
  onBack: () => void = () => {};
  private items: ChoiceItem[] = [];
  private focus = 0;

  constructor(host: HTMLElement, cls: string) {
    this.root = document.createElement('div');
    this.root.className = `hub choice ${cls} screen hidden`;
    host.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t) return;
      e.stopPropagation();
      (t as HTMLButtonElement).blur?.();
      if (t.dataset.act === 'back') this.onBack();
      else this.onPick(t.dataset.id!);
    });
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  open(o: { title: string; sub?: string; items: ChoiceItem[]; back?: string; hint?: string; selected?: string }): void {
    this.items = o.items;
    this.focus = Math.max(0, o.items.findIndex((i) => i.id === o.selected));
    this.root.innerHTML = `
      <div class="hub-head">
        <button type="button" class="hub-back" data-act="back">‹ ${o.back ?? 'ATRÁS'}</button>
        <h2>${o.title}${o.sub ? `<small>${o.sub}</small>` : ''}</h2>
        <span class="hub-spacer"></span>
      </div>
      <div class="choice-cards">
        ${o.items
          .map(
            (i, k) => `<button type="button" class="choice-card${i.id === o.selected ? ' on' : ''}${k === this.focus ? ' focus' : ''}" data-act="pick" data-id="${i.id}" style="--cc:${i.color ?? 'var(--cream)'}">
              ${i.art ? `<span class="cc-art">${i.art}</span>` : ''}
              <b>${i.title}</b>
              ${i.sub ? `<span class="cc-sub">${i.sub}</span>` : ''}
              ${i.badge ? `<span class="cc-badge">${i.badge}</span>` : ''}
            </button>`,
          )
          .join('')}
      </div>
      ${o.hint ? `<p class="hub-hint">${o.hint}</p>` : ''}`;
  }

  move(d: number): void {
    if (!this.items.length) return;
    this.focus = (this.focus + d + this.items.length) % this.items.length;
    this.root.querySelectorAll('.choice-card').forEach((c, i) => c.classList.toggle('focus', i === this.focus));
  }

  confirm(): void {
    const item = this.items[this.focus];
    if (item) this.onPick(item.id);
  }
}
