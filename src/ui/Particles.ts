type Shape = 'star' | 'dot' | 'rect';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: Shape;
  rot: number;
  vr: number;
  g: number;
}

export const PARTY = ['#FF5D8F', '#FFD23F', '#16C2A3', '#4FB3FF', '#A98BFF', '#FF8C42', '#FFFFFF'];

/** Tiny canvas particle system in stage coordinates (1600x900). */
export class Particles {
  private c: CanvasRenderingContext2D;
  private ps: P[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private reduced: boolean,
  ) {
    this.c = canvas.getContext('2d')!;
  }

  resize(scale: number): void {
    const k = Math.min(2, window.devicePixelRatio || 1) * scale;
    this.canvas.width = Math.round(1600 * k);
    this.canvas.height = Math.round(900 * k);
    this.c.setTransform(k, 0, 0, k, 0, 0);
  }

  burst(x: number, y: number, o: { n: number; colors?: string[]; speed?: number; shape?: Shape; size?: number; life?: number; gravity?: number; spread?: number; angle?: number }): void {
    const n = this.reduced ? Math.ceil(o.n / 3) : o.n;
    const colors = o.colors ?? PARTY;
    for (let i = 0; i < n; i++) {
      const spread = o.spread ?? Math.PI * 2;
      const a = (o.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * spread;
      const sp = (o.speed ?? 500) * (0.45 + Math.random() * 0.75);
      const life = (o.life ?? 0.7) * (0.7 + Math.random() * 0.5);
      this.ps.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: (o.size ?? 14) * (0.6 + Math.random() * 0.7),
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: o.shape ?? 'star',
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        g: o.gravity ?? 900,
      });
    }
  }

  rain(n: number): void {
    const count = this.reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const life = 2 + Math.random() * 1.5;
      this.ps.push({
        x: Math.random() * 1600,
        y: -40 - Math.random() * 300,
        vx: (Math.random() - 0.5) * 120,
        vy: 180 + Math.random() * 260,
        life,
        max: life,
        size: 12 + Math.random() * 12,
        color: PARTY[Math.floor(Math.random() * PARTY.length)],
        shape: Math.random() < 0.7 ? 'rect' : 'star',
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
        g: 120,
      });
    }
  }

  clear(): void {
    this.ps.length = 0;
  }

  update(dt: number): void {
    const c = this.c;
    c.clearRect(0, 0, 1600, 900);
    if (!this.ps.length) return;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.ps.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.vx *= 1 - 1.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const k = p.life / p.max;
      c.save();
      c.globalAlpha = Math.min(1, k * 2);
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.color;
      c.strokeStyle = '#241643';
      c.lineWidth = 3;
      const s = p.size * (0.5 + 0.5 * k);
      if (p.shape === 'dot') {
        c.beginPath();
        c.arc(0, 0, s / 2, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      } else if (p.shape === 'rect') {
        c.fillRect(-s / 2, -s / 4, s, s / 2);
      } else {
        star(c, s);
        c.fill();
        c.stroke();
      }
      c.restore();
    }
  }
}

function star(c: CanvasRenderingContext2D, s: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? s / 2 : s / 4.4;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
}
