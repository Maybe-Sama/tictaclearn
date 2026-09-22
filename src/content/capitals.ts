import type { ContentPack, LearningItem } from './types';
import { renderFlag } from './flags';

/**
 * Capitales: the flag + country name is the prompt, capitals travel on the beat.
 * Groove 2 ("trampas") uses countries whose capital is NOT their most famous
 * city; that famous city shows up on the lane as a decoy.
 */
export const CAPITAL_ITEMS: LearningItem[] = [
  { id: 'es', country: 'ESPAÑA', answer: 'MADRID', flagAsset: 'es', difficulty: 1, group: 1 },
  { id: 'jp', country: 'JAPÓN', answer: 'TOKIO', flagAsset: 'jp', difficulty: 1, group: 1 },
  { id: 'fr', country: 'FRANCIA', answer: 'PARÍS', flagAsset: 'fr', difficulty: 1, group: 1 },
  { id: 'it', country: 'ITALIA', answer: 'ROMA', flagAsset: 'it', difficulty: 1, group: 1 },
  { id: 'de', country: 'ALEMANIA', answer: 'BERLÍN', flagAsset: 'de', difficulty: 1, group: 2 },
  { id: 'pt', country: 'PORTUGAL', answer: 'LISBOA', flagAsset: 'pt', difficulty: 1, group: 2 },
  { id: 'gb', country: 'REINO UNIDO', answer: 'LONDRES', flagAsset: 'gb', difficulty: 1, group: 2 },
  { id: 'br', country: 'BRASIL', answer: 'BRASILIA', flagAsset: 'br', difficulty: 2, group: 2 },
  // Groove 2: capitales trampa
  { id: 'au', country: 'AUSTRALIA', answer: 'CANBERRA', decoys: ['SÍDNEY', 'MELBOURNE'], flagAsset: 'au', difficulty: 3, group: 3 },
  { id: 'ca', country: 'CANADÁ', answer: 'OTTAWA', decoys: ['TORONTO', 'MONTREAL'], flagAsset: 'ca', difficulty: 3, group: 3 },
  { id: 'tr', country: 'TURQUÍA', answer: 'ANKARA', decoys: ['ESTAMBUL'], flagAsset: 'tr', difficulty: 3, group: 3 },
  { id: 'ch', country: 'SUIZA', answer: 'BERNA', decoys: ['ZÚRICH', 'GINEBRA'], flagAsset: 'ch', difficulty: 3, group: 3 },
  { id: 'ma', country: 'MARRUECOS', answer: 'RABAT', decoys: ['CASABLANCA', 'MARRAKECH'], flagAsset: 'ma', difficulty: 3, group: 3 },
  { id: 'us', country: 'EE. UU.', answer: 'WASHINGTON', decoys: ['NUEVA YORK', 'LOS ÁNGELES'], flagAsset: 'us', difficulty: 3, group: 3 },
  { id: 'nl', country: 'PAÍSES BAJOS', answer: 'ÁMSTERDAM', decoys: ['LA HAYA', 'RÓTERDAM'], flagAsset: 'nl', difficulty: 3, group: 3 },
  { id: 'in', country: 'INDIA', answer: 'NUEVA DELHI', decoys: ['BOMBAY', 'CALCUTA'], flagAsset: 'in', difficulty: 3, group: 3 },
];

export const CAPITALS_PACK: ContentPack = {
  id: 'capitals',
  title: 'WORLD BEAT',
  subtitle: 'Capitales',
  items: CAPITAL_ITEMS,
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
  byId(id) {
    const it = CAPITAL_ITEMS.find((i) => i.id === id);
    if (!it) throw new Error(`Unknown item ${id}`);
    return it;
  },
};
