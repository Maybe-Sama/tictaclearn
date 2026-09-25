/**
 * Two stage compositions. The stage is a fixed design canvas scaled to fit
 * the viewport; which canvas we use depends on the viewport's shape.
 * Landscape 1600x900 (desktop, tablets, phones sideways) and
 * portrait 900x1600 (phones upright).
 */
export interface Layout {
  portrait: boolean;
  w: number;
  h: number;
  /** Hit pad (where tokens land). */
  padX: number;
  laneY: number;
  /** Pixels per beat on the lane. */
  spacing: number;
  flagX: number;
  flagY: number;
  djX: number;
  djY: number;
}

const LANDSCAPE: Layout = { portrait: false, w: 1600, h: 900, padX: 560, laneY: 712, spacing: 250, flagX: 560, flagY: 312, djX: 1390, djY: 196 };
const PORTRAIT: Layout = { portrait: true, w: 900, h: 1600, padX: 230, laneY: 1150, spacing: 205, flagX: 450, flagY: 560, djX: 750, djY: 240 };

/** Current layout (mutated in place so every module sees the same values). */
export const L: Layout = { ...LANDSCAPE };

/** Portrait when the viewport is clearly taller than wide. */
export function pickLayout(vw: number, vh: number): Layout {
  return vw / vh < 0.9 ? PORTRAIT : LANDSCAPE;
}

/** Applies a layout: CSS variables on the stage + body class. Returns true if it changed. */
export function applyLayout(next: Layout, stage: HTMLElement): boolean {
  const changed = next.portrait !== L.portrait || stage.style.getPropertyValue('--sw') === '';
  Object.assign(L, next);
  const vars: Record<string, number> = {
    '--sw': L.w,
    '--sh': L.h,
    '--pad-x': L.padX,
    '--lane-y': L.laneY,
    '--spacing': L.spacing,
    '--flag-x': L.flagX,
    '--flag-y': L.flagY,
    '--dj-x': L.djX,
    '--dj-y': L.djY,
  };
  for (const [k, v] of Object.entries(vars)) stage.style.setProperty(k, `${v}px`);
  document.body.classList.toggle('portrait', L.portrait);
  return changed;
}

/** Touch-first device (phones/tablets): swap keyboard wording for touch wording. */
export const TOUCH = window.matchMedia('(pointer: coarse)').matches;

export function inputWord(text: string): string {
  if (!TOUCH) return text;
  // "mantén ESPACIO" first: the generic rule would turn it into "mantén TOCA".
  return text.replace(/mantén ESPACIO/g, 'mantén el dedo').replace(/ESPACIO/g, 'TOCA');
}
