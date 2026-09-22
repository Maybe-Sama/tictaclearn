import { COUNTRIES, FLAG_CLUSTERS, lookalikes } from './countries';
import type { ContentPack, LearningItem } from './types';

/**
 * Flag artwork: the MIT-licensed `flag-icons` set (4:3 SVGs), bundled with
 * the game as static files. No network dependency at runtime.
 */
const FLAG_URLS = import.meta.glob('../../node_modules/flag-icons/flags/4x3/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byCode = new Map<string, string>();
for (const [path, url] of Object.entries(FLAG_URLS)) byCode.set(path.slice(path.lastIndexOf('/') + 1, -4), url);

export const flagUrl = (code: string): string => byCode.get(code) ?? '';

export const renderFlag = (code: string): string => `<img class="flag-img" src="${flagUrl(code)}" alt="" draggable="false" decoding="async">`;

/** Warm the browser cache so a flag never pops in late on its beat. */
const warmed = new Set<string>();
export function preloadFlags(codes: string[]): void {
  for (const c of codes) {
    if (warmed.has(c) || !byCode.has(c)) continue;
    warmed.add(c);
    const img = new Image();
    img.decoding = 'async';
    img.src = flagUrl(c);
  }
}

/** Teaching waves of the quick-play "Beat 1" (kept stable across packs). */
const BEAT1_GROUPS: Record<string, number> = { es: 1, jp: 1, fr: 1, it: 1, de: 2, pt: 2, gb: 2, br: 2 };

export const FLAG_ITEMS: LearningItem[] = COUNTRIES.map((c) => ({
  id: c.id,
  country: c.name,
  flagAsset: c.id,
  difficulty: c.difficulty,
  group: BEAT1_GROUPS[c.id] ?? 3,
  continent: c.continent,
  lookalikes: lookalikes(FLAG_CLUSTERS, c.id),
}));

export const FLAGS_PACK: ContentPack = {
  id: 'flags',
  title: 'WORLD BEAT',
  subtitle: 'Banderas',
  items: FLAG_ITEMS,
  clusters: FLAG_CLUSTERS,
  levels: {
    1: { name: 'BEAT 1', items: ['es', 'jp', 'fr', 'it', 'de', 'pt', 'gb', 'br'] },
    2: { name: 'BEAT 2 · GEMELAS', items: ['it', 'mx', 'ie', 'de', 'be', 'fr', 'nl', 'pl', 'id'], intro: 'twins', mixTitle: 'MIX GEMELAS', mixSub: 'no te fíes del color', finalSub: 'gemelas a ciegas' },
  },
  noun: 'banderas',
  answerNoun: 'país',
  rule: 'Golpea los tambores… y el país de la bandera',
  renderPrompt: (item) => renderFlag(item.flagAsset),
  answerLabel: (item) => item.country,
  spoken: (item) => item.country,
  byId: (id) => byId(FLAG_ITEMS, id),
};

export function byId(items: LearningItem[], id: string): LearningItem {
  const it = items.find((i) => i.id === id);
  if (!it) throw new Error(`Unknown item ${id}`);
  return it;
}
