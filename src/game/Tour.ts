import { CONTINENTS } from '../content/countries';
import type { ContentPack } from '../content/types';
import type { GrooveId } from '../rhythm/types';
import type { Tier } from './Difficulty';

/**
 * BEAT TOUR: a world tour. Each continent is a stage, each level a concert.
 * Concerts introduce 4-5 countries (in familiarity order) plus a review of
 * earlier ones; the last concert of a stage is a "Gran Final" over the whole
 * stage. Stage 7 (Gira Mundial) is built from look-alike clusters.
 *
 * Difficulty ramps with tour position p (0..1): tempo, rhythm template tier,
 * and which mechanics are allowed. Knowledge decides passing; rhythm only
 * adds points and the third star.
 *
 * Each concert also has an archetype: the tour position sets the difficulty,
 * the archetype sets the character — which mechanics open up and how the body
 * is spent. See docs/DESIGN-ARCHETYPES.md §2.
 */
export type ArchetypeId = 'escuela' | 'carrera' | 'eco' | 'memoria' | 'desfile' | 'jefe';

export interface ConcertParams {
  archetype: ArchetypeId;
  bpm: number;
  groove: GrooveId;
  maxTier: Tier;
  quick: boolean;
  flash: boolean;
  double: boolean;
  ghost: number;
  /** Can this concert place HOLD tokens? */
  hold: boolean;
  /** Can this concert call out echo rounds? */
  echo: boolean;
  /** Beats of body after the introductions; the archetype spends them. */
  budget: number;
}

export interface ConcertDef {
  id: string;
  stage: StageDef;
  index: number;
  title: string;
  /** Countries introduced (taught) in this concert. */
  newIds: string[];
  /** Fixed pool for finals / themed concerts (empty = new + review). */
  poolIds: string[];
  final: boolean;
  theme?: string;
  params: ConcertParams;
}

export interface StageDef {
  id: string;
  index: number;
  name: string;
  color: string;
  itemIds: string[];
  concerts: ConcertDef[];
}

/**
 * Authored archetype order, one row per stage, finals excluded (§3.2). Hand
 * written on purpose: a modulo formula puts the wrong concert in the wrong
 * place and nobody notices.
 */
const ARCHETYPES: Record<string, ArchetypeId[]> = {
  europa: ['escuela', 'escuela', 'eco', 'escuela', 'carrera', 'escuela', 'desfile', 'eco', 'carrera'],
  sudamerica: ['escuela', 'memoria', 'desfile'],
  norteamerica: ['escuela', 'carrera', 'escuela', 'eco', 'memoria'],
  africa: ['escuela', 'eco', 'escuela', 'carrera', 'escuela', 'memoria', 'escuela', 'desfile', 'escuela', 'carrera', 'eco'],
  asia: ['escuela', 'desfile', 'escuela', 'memoria', 'escuela', 'carrera', 'escuela', 'eco', 'escuela', 'memoria'],
  oceania: ['escuela', 'carrera', 'memoria'],
  mundo: ['memoria', 'carrera', 'eco', 'desfile', 'memoria', 'carrera', 'desfile', 'eco', 'memoria', 'carrera', 'desfile', 'eco'],
};

/** Keeps the variety rule alive when a content pack yields a longer stage. */
const SPILLOVER: ArchetypeId[] = ['escuela', 'eco', 'escuela', 'carrera', 'memoria', 'escuela', 'desfile'];

/** Pure: (stage, position) → archetype. The last concert of a stage is always the boss. */
export function archetypeFor(stageId: string, index: number, final: boolean, newCount: number): ArchetypeId {
  if (final) return 'jefe';
  const row = ARCHETYPES[stageId];
  const a = row && index < row.length ? row[index] : SPILLOVER[index % SPILLOVER.length];
  // ESCUELA is the archetype that introduces countries: without new ones it has nothing to do.
  return a === 'escuela' && newCount === 0 ? 'eco' : a;
}

/**
 * Tempo bias per archetype: the fantasy sets the pulse (§3.4). The design asked
 * for JEFE +2 and it gets it from `final ? 2 : 0` below — adding it twice would
 * push the last concerts past 120 BPM, where the reading gap of `quick` stops
 * being fair.
 */
const BPM_BIAS: Record<ArchetypeId, number> = { escuela: 0, carrera: 4, eco: -2, memoria: 0, desfile: -4, jefe: 0 };

const STAGE_GROOVE: Record<string, GrooveId> = { europa: 'easy', sudamerica: 'new', norteamerica: 'mix', africa: 'dembow', asia: 'mix', oceania: 'new', mundo: 'final' };

function params(p: number, groove: GrooveId, arch: ArchetypeId, newCount: number): ConcertParams {
  const final = arch === 'jefe';
  const tier: Tier = p < 0.18 ? 0 : p < 0.5 ? 1 : 2;
  return {
    archetype: arch,
    bpm: 98 + Math.round(18 * p) + (final ? 2 : 0) + BPM_BIAS[arch],
    groove: final ? 'final' : groove,
    // ESCUELA stays calm (it is where countries are learned); the boss opens everything.
    maxTier: arch === 'escuela' ? (Math.min(1, tier) as Tier) : arch === 'jefe' ? 2 : tier,
    quick: arch === 'carrera' || (p >= 0.25 && arch === 'jefe'),
    flash: arch === 'memoria' || (p >= 0.4 && arch === 'jefe'),
    double: p >= 0.55 && (arch === 'desfile' || arch === 'jefe'),
    ghost: arch === 'memoria' ? 0.6 : arch === 'jefe' ? 0.2 : 0,
    hold: arch === 'desfile' || arch === 'jefe' || arch === 'memoria',
    echo: arch === 'eco' || arch === 'jefe',
    // A concert that teaches spends most of its beats presenting; one that does not, plays.
    budget: newCount ? 48 : 96,
  };
}

/** Chunks of 4 first (gentle start), then 5; a tiny leftover merges into the previous chunk. */
function chunk(ids: string[]): string[][] {
  const out: string[][] = [];
  let i = 0;
  while (i < ids.length) {
    const size = out.length < 2 ? 4 : 5;
    out.push(ids.slice(i, i + size));
    i += size;
  }
  if (out.length > 1 && out[out.length - 1].length < 3) out[out.length - 2].push(...out.pop()!);
  return out;
}

export function buildTour(pack: ContentPack): StageDef[] {
  const has = new Set(pack.items.map((i) => i.id));
  const stages: StageDef[] = [];
  const total = CONTINENTS.length + 1;

  CONTINENTS.forEach((c, si) => {
    const itemIds = pack.items.filter((i) => i.continent === c.id).map((i) => i.id);
    const stage: StageDef = { id: c.id, index: si, name: c.name, color: c.color, itemIds, concerts: [] };
    const chunks = chunk(itemIds);
    const n = chunks.length + 1;
    chunks.forEach((ids, k) => {
      const p = Math.min(1, (si + k / n) / total);
      const arch = archetypeFor(c.id, k, false, ids.length);
      stage.concerts.push({ id: `${c.id}-${k + 1}`, stage, index: k, title: `CONCIERTO ${k + 1}`, newIds: ids, poolIds: [], final: false, params: params(p, STAGE_GROOVE[c.id], arch, ids.length) });
    });
    const pf = Math.min(1, (si + 0.95) / total);
    stage.concerts.push({ id: `${c.id}-final`, stage, index: chunks.length, title: 'GRAN FINAL', newIds: [], poolIds: itemIds, final: true, params: params(pf, STAGE_GROOVE[c.id], 'jefe', 0) });
    stages.push(stage);
  });

  // Stage 7: the whole world, one look-alike cluster per concert, then everything.
  const world: StageDef = { id: 'mundo', index: CONTINENTS.length, name: 'GIRA MUNDIAL', color: '#A98BFF', itemIds: pack.items.map((i) => i.id), concerts: [] };
  const clusters = pack.clusters.map((c) => ({ ...c, ids: c.ids.filter((id) => has.has(id)) })).filter((c) => c.ids.length >= 4);
  clusters.forEach((cl, k) => {
    const p = Math.min(1, (CONTINENTS.length + k / (clusters.length + 1)) / total);
    world.concerts.push({ id: `mundo-${k + 1}`, stage: world, index: k, title: cl.name, theme: cl.name, newIds: [], poolIds: cl.ids, final: false, params: params(p, 'final', archetypeFor('mundo', k, false, 0), 0) });
  });
  world.concerts.push({ id: 'mundo-final', stage: world, index: clusters.length, title: 'GRAN FINAL MUNDIAL', newIds: [], poolIds: world.itemIds, final: true, params: params(1, 'final', 'jefe', 0) });
  stages.push(world);
  return stages;
}

// ------------------------------------------------------------------ navigation

export function nextConcert(c: ConcertDef): ConcertDef | null {
  return c.stage.concerts[c.index + 1] ?? null;
}

/** Stars earned: pass by knowledge; the 3rd star also needs rhythm. */
export function starsFor(accuracy: number, timingPct: number): { stars: number; passed: boolean } {
  const passed = accuracy >= 0.7;
  if (!passed) return { stars: 0, passed };
  if (accuracy >= 0.9 && timingPct >= 80) return { stars: 3, passed };
  if (accuracy >= 0.9) return { stars: 2, passed };
  return { stars: 1, passed };
}
