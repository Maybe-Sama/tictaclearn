import type { ArchetypeId } from './Tour';

/**
 * Every word the player reads about an archetype, in one place: the map badge,
 * the rule under the map, the concert subtitle and the banner its mechanic gets
 * the first time it shows up. See docs/ARCHETYPE-ROLLOUT.md §1.
 *
 * Two rules hold for all of it:
 *
 * 1. The visible label is not the internal id. The game already shouts
 *    "¡RÁFAGA!" and "¡FLASH!" on screen, so the badge says the same word — two
 *    names for one thing is the cheapest mistake to avoid. And nothing says
 *    "escuela": it would be the only classroom word in the game, on 18 of 60
 *    nodes.
 * 2. No text names the subject. There are two packs (`banderas`, `capitales`),
 *    so a line like "una bandera por compás" is a lie in half the game. Either
 *    `pack.noun` goes in, or the noun is left out — which is usually shorter.
 */
export interface ArchetypeCopy {
  /** Map badge, at most 8 characters. */
  badge: string;
  /** One-line rule shown under the map for the focused concert, at most 40. */
  rule: string;
  /** Subtitle of the concert title card. */
  sub: string;
  /** Banner the first time its mechanic appears; null for the two that introduce nothing. */
  banner: { text: string; sub: string } | null;
  /** Suffix of the CSS class on the map node (`arch-eco`…), named after the badge. */
  css: string;
}

export const ARCHETYPE_COPY: Record<ArchetypeId, ArchetypeCopy> = {
  escuela: {
    badge: 'NUEVOS',
    rule: 'dos nuevas, y las tocas enseguida',
    sub: 'NUEVOS · de dos en dos',
    // On purpose: it introduces no mechanic, and a banner that announces nothing
    // teaches the player to ignore banners — the very asset that protects ECO and HOLD.
    banner: null,
    css: 'nuevos',
  },
  carrera: {
    badge: 'RÁFAGA',
    rule: 'una por compás, sin tiempo a dudar',
    sub: 'RÁFAGA · una por compás',
    banner: { text: '¡RÁFAGA!', sub: 'una por compás' },
    css: 'rafaga',
  },
  eco: {
    badge: 'ECO',
    rule: 'la banda toca, tú lo devuelves',
    sub: 'ECO · repite el patrón',
    banner: { text: '¡ECO!', sub: 'escucha… y repítelo' },
    css: 'eco',
  },
  memoria: {
    badge: 'FLASH',
    rule: 'se tapa a media frase; sigue el pulso',
    sub: 'FLASH · se tapa a media frase',
    banner: { text: '¡FLASH!', sub: 'memorízala rápido' },
    css: 'flash',
  },
  desfile: {
    badge: 'DESFILE',
    rule: 'notas largas: pulsa y no sueltes',
    sub: 'DESFILE · sostén la nota larga',
    banner: { text: '¡SOSTÉN!', sub: 'mantén ESPACIO mientras cruza' },
    css: 'desfile',
  },
  jefe: {
    badge: 'JEFE',
    rule: 'todo lo de esta zona, del tirón',
    sub: 'JEFE · todo junto',
    // The riser of its title card is the strongest cue in the game; a banner would steal from it.
    banner: null,
    css: 'jefe',
  },
};
