// A canvas that hosts an illustrated scene with clickable hotspots (hover glow, tap to enter).
import { SH, SW, type Spot } from '../render/scenes';

export class SceneCanvas {
  readonly el = document.createElement('canvas');
  private c: CanvasRenderingContext2D;
  private running = false;
  private t = 0;
  private last = 0;
  hover: string | null = null;
  spots: Spot[] = [];
  draw: (c: CanvasRenderingContext2D, t: number, hover: string | null) => void = () => {};
  onClick: (id: string) => void = () => {};

  constructor() {
    this.el.width = SW; this.el.height = SH;
    this.el.style.cssText = 'width:100%;height:auto;display:block;border-radius:12px;touch-action:manipulation;box-shadow:0 8px 30px rgba(0,0,0,.5);background:#1a1410';
    this.c = this.el.getContext('2d')!;
    this.el.addEventListener('pointermove', (e) => this.setHover(this.hit(e)));
    this.el.addEventListener('pointerleave', () => this.setHover(null));
    this.el.addEventListener('click', (e) => { const id = this.hit(e); if (id) this.onClick(id); });
  }

  private hit(e: MouseEvent): string | null {
    const r = this.el.getBoundingClientRect();
    const x = ((e.clientX - r.left) * SW) / r.width, y = ((e.clientY - r.top) * SH) / r.height;
    // smaller spots win, so a prop inside a big building stays clickable
    let best: Spot | null = null;
    for (const s of this.spots) if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h && (!best || s.w * s.h < best.w * best.h)) best = s;
    return best?.id ?? null;
  }
  private setHover(id: string | null) { this.hover = id; this.el.style.cursor = id ? 'pointer' : 'default'; }

  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now();
    requestAnimationFrame((n) => this.loop(n));
  }
  stop() { this.running = false; this.hover = null; this.spots = []; this.onClick = () => {}; }

  private loop(now: number) {
    if (!this.running) return;
    requestAnimationFrame((n) => this.loop(n));
    this.t += Math.min(0.05, (now - this.last) / 1000); this.last = now;
    try { this.c.save(); this.draw(this.c, this.t, this.hover); this.c.restore(); }
    catch (e) { this.c.restore(); this.c.setTransform(1, 0, 0, 1, 0, 0); this.c.globalAlpha = 1; console.error(e); }
  }
}
