import { CONTINENTS } from '../content/countries';
import type { ContentPack } from '../content/types';
import type { GrooveId } from '../rhythm/types';
import type { Tier } from './Difficulty';
import type { Progress } from './Progress';

/**
 * BEAT TOUR: a world tour. Each continent is a stage, each level a concert.
 * Concerts introduce 4-5 countries (in familiarity order) plus a review of
 * earlier ones; the last concert of a stage is a "Gran Final" over the whole
 * stage. Stage 7 (Gira Mundial) is built from look-alike clusters.
 *
 * Difficulty ramps with tour position p (0..1): tempo, rhythm template tier,
 * and which mechanics are allowed. Knowledge decides passing; rhythm only
 * adds points and the third star.
 */
export interface ConcertParams {
  bpm: number;
  groove: GrooveId;
  maxTier: Tier;
  quick: boolean;
  flash: boolean;
  double: boolean;
  ghost: number;
  /** Beats of adaptive play after the introductions. */
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

const STAGE_GROOVE: Record<string, GrooveId> = { europa: 'easy', sudamerica: 'new', norteamerica: 'mix', africa: 'dembow', asia: 'mix', oceania: 'new', mundo: 'final' };

function params(p: number, groove: GrooveId, final: boolean): ConcertParams {
  return {
    bpm: 98 + Math.round(18 * p) + (final ? 2 : 0),
    groove: final ? 'final' : groove,
    maxTier: p < 0.18 ? 0 : p < 0.5 ? 1 : 2,
    quick: p >= 0.25,
    flash: p >= 0.4,
    double: p >= 0.55,
    ghost: p >= 0.8 ? 0.2 : 0,
    budget: final ? 80 : 56,
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
      stage.concerts.push({ id: `${c.id}-${k + 1}`, stage, index: k, title: `CONCIERTO ${k + 1}`, newIds: ids, poolIds: [], final: false, params: params(p, STAGE_GROOVE[c.id], false) });
    });
    const pf = Math.min(1, (si + 0.95) / total);
    stage.concerts.push({ id: `${c.id}-final`, stage, index: chunks.length, title: 'GRAN FINAL', newIds: [], poolIds: itemIds, final: true, params: params(pf, STAGE_GROOVE[c.id], true) });
    stages.push(stage);
  });

  // Stage 7: the whole world, one look-alike cluster per concert, then everything.
  const world: StageDef = { id: 'mundo', index: CONTINENTS.length, name: 'GIRA MUNDIAL', color: '#A98BFF', itemIds: pack.items.map((i) => i.id), concerts: [] };
  const clusters = pack.clusters.map((c) => ({ ...c, ids: c.ids.filter((id) => has.has(id)) })).filter((c) => c.ids.length >= 4);
  clusters.forEach((cl, k) => {
    const p = Math.min(1, (CONTINENTS.length + k / (clusters.length + 1)) / total);
    world.concerts.push({ id: `mundo-${k + 1}`, stage: world, index: k, title: cl.name, theme: cl.name, newIds: [], poolIds: cl.ids, final: false, params: params(p, 'final', false) });
  });
  world.concerts.push({ id: 'mundo-final', stage: world, index: clusters.length, title: 'GRAN FINAL MUNDIAL', newIds: [], poolIds: world.itemIds, final: true, params: { ...params(1, 'final', true), budget: 96 } });
  stages.push(world);
  return stages;
}

// ------------------------------------------------------------------ unlocking

export function stageUnlocked(stages: StageDef[], progress: Progress, subject: string, index: number): boolean {
  if (index === 0) return true;
  const passed = (s: StageDef) => s.concerts.filter((c) => progress.concert(subject, c.id)?.passed).length;
  if (index === stages.length - 1) {
    // Gira Mundial: after passing the Gran Final of 3 continents.
    return stages.slice(0, -1).filter((s) => progress.concert(subject, s.concerts[s.concerts.length - 1].id)?.passed).length >= 3;
  }
  // Next continent opens halfway through the previous one: no long waits.
  const prev = stages[index - 1];
  return stageUnlocked(stages, progress, subject, index - 1) && passed(prev) >= Math.ceil(prev.concerts.length / 2);
}

export function concertUnlocked(stages: StageDef[], progress: Progress, subject: string, c: ConcertDef): boolean {
  if (!stageUnlocked(stages, progress, subject, c.stage.index)) return false;
  if (c.index === 0) return true;
  // Themed world concerts are all open once the world is.
  if (c.stage.id === 'mundo' && !c.final) return true;
  return !!progress.concert(subject, c.stage.concerts[c.index - 1].id)?.passed;
}

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
