// Main-menu cover art: two randomly generated gladiators locked in a close-up clash under a blood-red storm sky.
import { makeSpec } from '../data/classes';
import { CLASS_IDS, ZONES, type FighterSpec, type Zone } from '../sim/types';
import { drawFighter, lookFor, pose, type DrawState, type Mark, type Pose } from './rig';
import { H, Stage, W } from './stage';

const S = 3.0;          // close-up scale
const GROUND = 592;      // feet line, below the frame: the camera is cropped tight on the clash

const LUNGE: Pose = pose({ wU: 84, wL: 90, lean: 16, x: 16, drop: 8, fU: 44, fL: 12, bU: -32, bL: -8, sU: 18, sL: 66, head: 4 });
const CHOP: Pose = pose({ wU: 150, wL: 168, lean: 8, x: 8, drop: 6, fU: 38, fL: 10, bU: -30, bL: -6, sU: 40, sL: 82 });
const BRACE: Pose = pose({ wU: 72, wL: 90, lean: 6, x: 2, drop: 10, fU: 30, fL: 8, bU: -28, bL: -4, sU: 62, sL: 98 });

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; hot: boolean }
interface Ember { x: number; y: number; v: number; ph: number; s: number }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class Splash {
  readonly el = document.createElement('canvas');
  private c: CanvasRenderingContext2D;
  private stage = new Stage();
  private specs!: [FighterSpec, FighterSpec];
  private poses!: [Pose, Pose];
  private marks!: [Mark[], Mark[]];
  private sparks: Spark[] = [];
  private embers: Ember[] = [];
  private running = false;
  private t = 0;
  private last = 0;
  private bolt = 0;
  private flash = 0;

  constructor() {
    this.el.width = W; this.el.height = H;
    this.el.style.cssText = 'width:100%;height:auto;border-radius:10px;display:block;box-shadow:0 8px 40px rgba(120,0,10,.45)';
    this.c = this.el.getContext('2d')!;
    for (let i = 0; i < 46; i++) this.embers.push({ x: rnd(0, W), y: rnd(0, H), v: rnd(14, 46), ph: rnd(0, 6.28), s: rnd(1, 2.8) });
    this.reroll();
  }

  /** Pick two new random gladiators for the cover. */
  reroll() {
    const a = pick(CLASS_IDS);
    let b = pick(CLASS_IDS);
    while (b === a) b = pick(CLASS_IDS);
    const nm = () => Math.random().toString(36).slice(2, 8);
    this.specs = [makeSpec(a, 4, nm()), makeSpec(b, 4, nm())];
    this.poses = [pick([LUNGE, CHOP]), this.specs[1].shield ? BRACE : LUNGE];
    this.marks = [this.makeMarks(), this.makeMarks()];
    this.sparks = [];
  }

  private makeMarks(): Mark[] {
    const out: Mark[] = [];
    for (let i = 0; i < 7; i++) {
      const zone: Zone = pick(ZONES);
      out.push({ zone, kind: Math.random() < 0.7 ? 'cut' : 'bruise', t: rnd(0.15, 0.85), o: rnd(-1, 1), a: rnd(-0.7, 0.9), s: rnd(1, 1.5) });
    }
    return out;
  }

  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now();
    requestAnimationFrame((n) => this.loop(n));
  }
  stop() { this.running = false; }

  private loop(now: number) {
    if (!this.running) return;
    requestAnimationFrame((n) => this.loop(n));
    const dt = Math.min(0.06, (now - this.last) / 1000); this.last = now; this.t += dt;
    try { this.update(dt); this.draw(); } catch (e) { this.c.setTransform(1, 0, 0, 1, 0, 0); this.c.globalAlpha = 1; console.error(e); }
  }

  private update(dt: number) {
    this.flash = Math.max(0, this.flash - dt * 4);
    this.bolt = Math.max(0, this.bolt - dt * 2.4);
    if (Math.random() < dt * 0.22) this.bolt = 1;
    const cx = W / 2, cy = 292;
    if (Math.random() < dt * 14) {
      const a = rnd(-Math.PI, 0), s = rnd(120, 420);
      this.sparks.push({ x: cx + rnd(-14, 14), y: cy + rnd(-12, 12), vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rnd(0.35, 0.9), hot: Math.random() < 0.6 });
    }
    if (Math.random() < dt * 1.3) this.flash = 1;
    for (const p of this.sparks) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt; }
    this.sparks = this.sparks.filter((p) => p.life < p.max);
    for (const e of this.embers) { e.y -= e.v * dt; e.x += Math.sin(this.t * 1.3 + e.ph) * 12 * dt; if (e.y < -10) { e.y = H + 10; e.x = rnd(0, W); } }
  }

  private state(i: 0 | 1): DrawState {
    const spec = this.specs[i];
    const tiers = Object.fromEntries(ZONES.map((z) => [z, 'ok'])) as DrawState['tiers'];
    const sway = Math.sin(this.t * 1.6 + i * 1.3);
    const p = { ...this.poses[i] };
    p.x += sway * 4; p.lean += sway * 1.6; p.wU += Math.sin(this.t * 2.1 + i) * 3; p.wL += Math.sin(this.t * 2.1 + i) * 2;
    return {
      spec, look: lookFor(spec, i), pose: p, tiers, carried: {}, armed: true, flash: this.flash * 0.0, fall: 0, stunned: false,
      snared: false, t: this.t + i, trimGold: true, netArm: spec.classId === 'retiarius', severed: {}, marks: this.marks[i], bloody: true,
    };
  }

  private draw() {
    const c = this.c, t = this.t;
    c.save();
    // slow push-in, like a camera drifting toward the clash
    const z = 1.015 + 0.012 * Math.sin(t * 0.6);
    c.translate(W / 2, 330); c.scale(z, z); c.translate(-W / 2, -330);

    this.stage.drawBack(c, W / 2, t, 0.9);
    this.stage.storm(c, 1, this.bolt, t);
    this.stage.drawFloor(c);
    // blood-red glow and rays behind the clash
    const cx = W / 2, cy = 292;
    const g = c.createRadialGradient(cx, cy, 10, cx, cy, 460);
    g.addColorStop(0, 'rgba(255,90,60,.55)'); g.addColorStop(0.35, 'rgba(160,20,24,.28)'); g.addColorStop(1, 'rgba(60,0,8,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save(); c.translate(cx, cy); c.rotate(t * 0.04);
    for (let k = 0; k < 14; k++) { c.rotate((Math.PI * 2) / 14); c.fillStyle = 'rgba(255,120,80,.07)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(520, -26); c.lineTo(520, 26); c.closePath(); c.fill(); }
    c.restore();

    // the two gladiators, big and close
    const xs: [number, number] = [W / 2 - 205, W / 2 + 205];
    let tips: ({ x: number; y: number } | null)[] = [null, null];
    for (const i of [0, 1] as const) {
      c.fillStyle = 'rgba(30,5,5,.55)'; c.beginPath(); c.ellipse(xs[i], GROUND - 6, 110, 20, 0, 0, 7); c.fill();
      c.save(); c.translate(xs[i], GROUND); c.scale(i === 0 ? S : -S, S);
      const tip = drawFighter(c, this.state(i as 0 | 1));
      c.restore();
      if (tip) tips[i] = { x: xs[i] + (i === 0 ? 1 : -1) * tip.x * S, y: GROUND + tip.y * S };
    }

    // sparks and a flash where the steel meets
    const hit = tips[0] && tips[1] ? { x: (tips[0].x + tips[1].x) / 2, y: (tips[0].y + tips[1].y) / 2 } : { x: cx, y: cy };
    const fl = 0.55 + 0.45 * Math.sin(t * 17) ** 2 + this.flash * 0.6;
    const gl = c.createRadialGradient(hit.x, hit.y, 2, hit.x, hit.y, 90 * fl);
    gl.addColorStop(0, 'rgba(255,255,235,.95)'); gl.addColorStop(0.3, 'rgba(255,190,90,.55)'); gl.addColorStop(1, 'rgba(255,90,30,0)');
    c.fillStyle = gl; c.beginPath(); c.arc(hit.x, hit.y, 90 * fl, 0, 7); c.fill();
    c.fillStyle = '#fff6d8'; c.beginPath();
    for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.283 + t * 2, r = (k % 2 ? 12 : 34) * fl; c.lineTo(hit.x + Math.cos(a) * r, hit.y + Math.sin(a) * r); }
    c.closePath(); c.fill();
    for (const p of this.sparks) {
      const a = 1 - p.life / p.max;
      c.strokeStyle = p.hot ? `rgba(255,${190 + (a * 50) | 0},90,${a})` : `rgba(255,255,230,${a})`; c.lineWidth = 2.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); c.stroke();
    }
    c.restore();

    // embers drifting up through the frame
    for (const e of this.embers) { c.fillStyle = `rgba(255,${120 + ((Math.sin(t * 4 + e.ph) + 1) * 40) | 0},60,${0.45 + 0.3 * Math.sin(t * 3 + e.ph)})`; c.beginPath(); c.arc(e.x, e.y, e.s, 0, 7); c.fill(); }

    this.stage.vignette(c); this.stage.vignette(c);
    const lg = c.createLinearGradient(0, 0, 0, 190); lg.addColorStop(0, 'rgba(0,0,0,.7)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = lg; c.fillRect(0, 0, W, 190);
    this.title(c, t);
  }

  private titleCache?: HTMLCanvasElement;

  private buildTitle() {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = 190;
    const c = cv.getContext('2d')!;
    c.textAlign = 'center'; c.lineJoin = 'round';
    const line = (text: string, y: number, size: number) => {
      c.font = `900 ${size}px Impact, "Arial Black", system-ui`; c.lineWidth = size * 0.13; c.strokeStyle = '#1a0000';
      c.shadowColor = 'rgba(230,20,20,.7)'; c.shadowBlur = 22; c.strokeText(text, W / 2, y); c.shadowBlur = 0;
      const gr = c.createLinearGradient(0, y - size, 0, y + 4);
      gr.addColorStop(0, '#ff3a2a'); gr.addColorStop(0.55, '#d01414'); gr.addColorStop(1, '#7a0606');
      c.fillStyle = gr; c.fillText(text, W / 2, y);
      c.save(); c.beginPath(); c.rect(0, y - size, W, size * 0.3); c.clip(); c.fillStyle = 'rgba(255,200,180,.25)'; c.fillText(text, W / 2, y); c.restore();
    };
    line('ROMEO ULTIMATE FIGHTING', 62, 56);
    line('AUTOCHESS THING', 122, 56);
    c.font = '700 22px system-ui'; c.fillStyle = '#e8c9a0'; c.letterSpacing = '12px';
    c.fillText("AK'S  A  BITCH  BOY", W / 2, 156);
    this.titleCache = cv;
  }

  /** Big blood-red title with dripping letters. The static part is cached; only the drips animate. */
  private title(c: CanvasRenderingContext2D, t: number) {
    if (!this.titleCache) this.buildTitle();
    c.drawImage(this.titleCache!, 0, 0);
    c.font = '900 56px Impact, "Arial Black", system-ui';
    const w = c.measureText('AUTOCHESS THING').width, left = W / 2 - w / 2;
    for (let k = 0; k < 10; k++) {
      const x = left + ((k * 0.1137 + 0.05) % 1) * w, len = 8 + ((k * 13) % 18) + Math.sin(t * 1.4 + k * 1.9) * 3;
      c.strokeStyle = '#a80c0c'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, 118); c.lineTo(x, 124 + len); c.stroke();
      c.fillStyle = '#a80c0c'; c.beginPath(); c.arc(x, 126 + len, 4, 0, 7); c.fill();
    }
    c.textAlign = 'left';
  }
}
