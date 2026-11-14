// Procedural arena: dusk sky, stone arches, banners, bobbing crowd, sand floor, vignette.
import { shade } from './rig';

export const W = 960, H = 480, FLOOR = 392;

const rngOf = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

function off(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  return [cv, cv.getContext('2d')!];
}

export class Stage {
  private back: HTMLCanvasElement;
  private floor: HTMLCanvasElement;
  private crowd: { x: number; y: number; col: string; skin: string; ph: number; row: number }[] = [];

  constructor() {
    // static background (sky, wall, arches, banners)
    const [b, c] = off(W + 200, 330);
    const g = c.createLinearGradient(0, 0, 0, 330);
    g.addColorStop(0, '#2b2142'); g.addColorStop(0.45, '#7a4a5c'); g.addColorStop(1, '#d28a52');
    c.fillStyle = g; c.fillRect(0, 0, W + 200, 330);
    // sun glow
    const rg = c.createRadialGradient(240, 70, 10, 240, 70, 260);
    rg.addColorStop(0, 'rgba(255,214,140,.65)'); rg.addColorStop(1, 'rgba(255,214,140,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W + 200, 330);
    // upper stone tier with arches
    c.fillStyle = '#8a6b52'; c.fillRect(0, 60, W + 200, 70);
    c.fillStyle = '#a58466'; c.fillRect(0, 56, W + 200, 8);
    for (let x = 10; x < W + 200; x += 70) {
      c.fillStyle = '#1b1218'; c.beginPath(); c.moveTo(x, 130); c.lineTo(x, 92); c.arc(x + 26, 92, 26, Math.PI, 0); c.lineTo(x + 52, 130); c.fill();
      c.fillStyle = '#6e523f'; c.fillRect(x - 6, 62, 6, 68);
    }
    // banners
    const cols = ['#9a3b30', '#2f4d7a', '#b58a2d'];
    for (let i = 0; i < 7; i++) {
      const x = 90 + i * 150; c.fillStyle = cols[i % 3]; c.strokeStyle = '#1d1511'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, 64); c.lineTo(x + 26, 64); c.lineTo(x + 26, 118); c.lineTo(x + 13, 108); c.lineTo(x, 118); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#f1e6d0'; c.beginPath(); c.arc(x + 13, 84, 5, 0, 7); c.fill();
    }
    // stands body
    const sg = c.createLinearGradient(0, 130, 0, 330);
    sg.addColorStop(0, '#5a3f33'); sg.addColorStop(1, '#3a2a24');
    c.fillStyle = sg; c.fillRect(0, 130, W + 200, 200);
    for (let y = 150; y < 330; y += 36) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(0, y, W + 200, 4); }
    this.back = b;

    // crowd members
    const r = rngOf(7);
    const tun = ['#b8412f', '#d8c9a6', '#3f6aa0', '#c9a23a', '#6a8f4f', '#8c5a9a', '#e0d3b8', '#a85a3a'];
    const skin = ['#e3b78f', '#c98d5f', '#a86a42', '#f0cfae', '#8a5634'];
    for (let row = 0; row < 4; row++) for (let i = 0; i < 46; i++) {
      this.crowd.push({ x: i * 24 + (row % 2) * 12 + r() * 6, y: 168 + row * 36, col: tun[Math.floor(r() * tun.length)], skin: skin[Math.floor(r() * skin.length)], ph: r() * 6.28, row });
    }

    // sand floor texture
    const [f, fc] = off(W + 1800, H - 300);
    const fg = fc.createLinearGradient(0, 0, 0, H - 300);
    fg.addColorStop(0, '#c99c5e'); fg.addColorStop(0.35, '#dcb676'); fg.addColorStop(1, '#bf9459');
    fc.fillStyle = fg; fc.fillRect(0, 0, W + 1800, H - 300);
    const rr = rngOf(99);
    for (let i = 0; i < 5200; i++) { fc.fillStyle = rr() < 0.5 ? 'rgba(120,80,40,.16)' : 'rgba(255,240,200,.14)'; fc.fillRect(rr() * (W + 1800), rr() * (H - 300), 1 + rr() * 2.5, 1 + rr()); }
    // footprints / rake lines
    fc.strokeStyle = 'rgba(110,75,40,.18)'; fc.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) { const y = 12 + i * 8; fc.beginPath(); fc.moveTo(0, y); for (let x = 0; x < W + 1800; x += 40) fc.lineTo(x, y + Math.sin(x * 0.02 + i) * 2); fc.stroke(); }
    this.floor = f;
  }

  /** Background + crowd, drawn in screen space with mild parallax. */
  drawBack(c: CanvasRenderingContext2D, camX: number, t: number, excite: number) {
    const px = -((camX - W / 2) * 0.08) - 100;
    c.drawImage(this.back, px, 0);
    for (const p of this.crowd) {
      const bob = Math.sin(t * (2 + excite * 3) + p.ph) * (1.5 + excite * 3);
      const up = excite > 0.25 && Math.sin(t * 5 + p.ph * 2) > 0.2;
      const x = p.x + px * (0.9 + p.row * 0.03), y = p.y + bob;
      c.fillStyle = shade(p.col, -p.row * 10); c.fillRect(x - 7, y, 14, 22);
      c.fillStyle = p.skin; c.beginPath(); c.arc(x, y - 6, 7, 0, 7); c.fill();
      c.strokeStyle = p.skin; c.lineWidth = 3; c.lineCap = 'round';
      if (up) { c.beginPath(); c.moveTo(x - 6, y + 4); c.lineTo(x - 11, y - 14); c.moveTo(x + 6, y + 4); c.lineTo(x + 11, y - 14); c.stroke(); }
    }
    // arena wall with rail
    const wg = c.createLinearGradient(0, 292, 0, 330);
    wg.addColorStop(0, '#6b5040'); wg.addColorStop(1, '#3a2a22');
    c.fillStyle = wg; c.fillRect(0, 292, W, 38);
    c.fillStyle = '#8a6b52'; c.fillRect(0, 288, W, 6);
    c.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < W; x += 60) c.fillRect(x, 294, 3, 36);
    // gate
    c.fillStyle = '#17110e'; c.beginPath(); c.moveTo(W / 2 - 60 + (px + 100) * 0.4, 330); c.lineTo(W / 2 - 60 + (px + 100) * 0.4, 306); c.arc(W / 2 + (px + 100) * 0.4, 306, 60, Math.PI, 0); c.lineTo(W / 2 + 60 + (px + 100) * 0.4, 330); c.fill();
  }

  /** Sand, in world space (call inside the camera transform). */
  drawFloor(c: CanvasRenderingContext2D) {
    c.drawImage(this.floor, -400, 300);
    c.fillStyle = 'rgba(0,0,0,.16)'; c.fillRect(-400, 300, W + 1800, 6); // wall contact shadow
  }

  /** Storm over the arena for infamous challengers: the sky darkens, a blood moon rises, lightning flashes. */
  storm(c: CanvasRenderingContext2D, dark: number, bolt: number, t: number) {
    const g = c.createLinearGradient(0, 0, 0, 330);
    g.addColorStop(0, `rgba(6,1,12,${0.86 * dark})`); g.addColorStop(1, `rgba(46,6,14,${0.66 * dark})`);
    c.fillStyle = g; c.fillRect(0, 0, W, 330);
    const moon = c.createRadialGradient(240, 70, 4, 240, 70, 190);
    moon.addColorStop(0, `rgba(255,80,60,${0.95 * dark})`); moon.addColorStop(0.12, `rgba(210,30,30,${0.7 * dark})`); moon.addColorStop(1, 'rgba(120,0,10,0)');
    c.fillStyle = moon; c.fillRect(0, 0, W, 330);
    c.fillStyle = `rgba(20,2,6,${0.55 * dark})`;
    for (let i = 0; i < 6; i++) { const x = ((t * 14 + i * 190) % (W + 300)) - 150; c.beginPath(); c.ellipse(x, 30 + (i % 3) * 26, 130, 22, 0, 0, 7); c.fill(); }
    if (bolt > 0.05) {
      c.fillStyle = `rgba(235,225,255,${0.42 * bolt})`; c.fillRect(0, 0, W, 330);
      c.strokeStyle = `rgba(255,255,255,${bolt})`; c.lineWidth = 3; c.beginPath();
      let x = 520 + (Math.floor(t) % 5) * 60, y = 0; c.moveTo(x, y);
      while (y < 200) { x += (Math.sin(y * 12.9898 + Math.floor(t * 3)) * 28); y += 24; c.lineTo(x, y); }
      c.stroke();
    }
  }

  vignette(c: CanvasRenderingContext2D) {
    const g = c.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 600);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,5,10,.55)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
}
