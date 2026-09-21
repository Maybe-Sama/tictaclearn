export interface DebugInfo {
  state: string;
  paused: boolean;
  bpm: number | null;
  songTime: number;
  beat: number | null;
  phrase: string;
  expected: number | null;
  lastDelta: number | null;
  latency: { base: number; output: number };
  offset: number;
  combo: number;
  extra?: string;
}

/** ?debug=1 overlay. Keys: N = skip section, [ / ] = input offset -/+5 ms. */
export class DebugPanel {
  private el: HTMLPreElement;
  private last = 0;

  constructor() {
    this.el = document.createElement('pre');
    this.el.className = 'debug';
    document.body.appendChild(this.el);
  }

  update(d: DebugInfo): void {
    const now = performance.now();
    if (now - this.last < 80) return;
    this.last = now;
    const f = (v: number | null, n = 3): string => (v === null ? '—' : v.toFixed(n));
    this.el.textContent = [
      `state      ${d.state}${d.paused ? ' (paused)' : ''}`,
      `bpm        ${d.bpm ?? '—'}`,
      `songTime   ${f(d.songTime)} s`,
      `beat       ${f(d.beat, 2)}`,
      `phrase     ${d.phrase}`,
      `expectedHit ${f(d.expected)} s`,
      `lastDelta  ${d.lastDelta === null ? '—' : `${d.lastDelta >= 0 ? '+' : ''}${d.lastDelta.toFixed(0)} ms`}`,
      `latency    base ${(d.latency.base * 1000).toFixed(1)} / out ${(d.latency.output * 1000).toFixed(1)} ms`,
      `inputOffset ${d.offset} ms   [ / ]`,
      `combo      ${d.combo}`,
      d.extra ?? '',
      `N = skip section`,
    ].join('\n');
  }
}
