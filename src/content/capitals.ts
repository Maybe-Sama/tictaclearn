import { CAPITAL_CLUSTERS, COUNTRIES, lookalikes } from './countries';
import { byId, renderFlag } from './flags';
import type { ContentPack, LearningItem } from './types';

/**
 * Capitales: the flag + country name is the prompt, capitals travel on the beat.
 * Famous non-capital cities (SÍDNEY, ESTAMBUL…) ride the lane as decoys.
 * Countries whose capital is disputed are left out of this subject.
 */
const BEAT1_GROUPS: Record<string, number> = { es: 1, jp: 1, fr: 1, it: 1, de: 2, pt: 2, gb: 2, br: 2 };

export const CAPITAL_ITEMS: LearningItem[] = COUNTRIES.filter((c) => c.capital).map((c) => ({
  id: c.id,
  country: c.name,
  answer: c.capital!,
  decoys: c.decoys,
  flagAsset: c.id,
  difficulty: c.difficulty,
  group: BEAT1_GROUPS[c.id] ?? 3,
  continent: c.continent,
  lookalikes: lookalikes(CAPITAL_CLUSTERS, c.id),
}));

export const CAPITALS_PACK: ContentPack = {
  id: 'capitals',
  title: 'WORLD BEAT',
  subtitle: 'Capitales',
  items: CAPITAL_ITEMS,
  clusters: CAPITAL_CLUSTERS,
  levels: {
    1: { name: 'BEAT 1', items: ['es', 'jp', 'fr', 'it', 'de', 'pt', 'gb', 'br'] },
    2: { name: 'BEAT 2 · TRAMPAS', items: ['au', 'ca', 'tr', 'ch', 'ma', 'us', 'nl', 'in'], intro: 'traps', mixTitle: 'MIX TRAMPAS', mixSub: 'la famosa no siempre manda', finalSub: 'capitales a ciegas' },
  },
  noun: 'capitales',
  answerNoun: 'capital',
  rule: 'Golpea los tambores… y la capital del país',
  renderPrompt: (item) => renderFlag(item.flagAsset),
  promptCaption: (item) => item.country,
  answerLabel: (item) => item.answer ?? item.country,
  spoken: (item) => `${item.country}: ${item.answer ?? ''}`,
  byId: (id) => byId(CAPITAL_ITEMS, id),
};
