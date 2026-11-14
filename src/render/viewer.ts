// Viewer: plays back a FightResult. It never runs sim logic; it only reads the event log + track.
import { ACTIONS, type ActionDef } from '../data/actions';
import { CLASSES } from '../data/classes';
import { ZONES, type FightEvent, type FightResult, type FighterSpec, type WeaponDef, type Zone, type ZoneTier } from '../sim/types';
import { poseFor, type Dur } from './anim';
import { Commentator } from './commentary';
import { drawFighter, drawWeapon, lookFor, type Look, type Mark, type Pose, type Tip } from './rig';
import { FLOOR, H, Stage, W } from './stage';

const PX = 21;
const ZONE_Y: Record<Zone, number> = { head: -122, torso: -84, armW: -88, armS: -88, legL: -34, legR: -34 };
const ZONE_NAME: Record<Zone, string> = { head: 'head', torso: 'torso', armW: 'weapon arm', armS: 'shield arm', legL: 'left leg', legR: 'right leg' };

interface FS {
  act: ActionDef | null; start: number; hitAt: number; stunUntil: number; snareUntil: number; bleedUntil: number;
  armed: boolean; deadAt: number; yieldAt: number; trail: { x: number; y: number; t: number }[]; look: Look; dur: Dur;
  marks: Mark[]; bloody: boolean; lastCut: Zone; severed: Partial<Record<Zone, boolean>>; slowUntil: number;
  sm?: Pose; moveUntil: number; moveDir: 1 | -1; seq: number;   // smoothed pose, and a short walk hold so steps do not flicker to idle
}
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: 'dust' | 'spark' | 'burst' | 'drop' | 'blood' | 'gore'; size: number; color: string }
interface Fx { life: number; x: number; y: number; text: string; color: string }
interface Banner { life: number; text: string; color: string }
interface Prop { x: number; y: number; vy: number; rot: number; spin: number; w: WeaponDef; look: Look; landed: boolean; limb?: { leg: boolean } }
interface Gib { x: number; y: number; color: string; s: number; r: number; bone: boolean }
interface Net { i: 0 | 1; t0: number; ok: boolean | null }

const tierOf = (hp: number, max: number): ZoneTier => (hp <= 0 ? 'disabled' : hp / max > 0.66 ? 'ok' : hp / max > 0.33 ? 'hurt' : 'crippled');
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Viewer {
  private c: CanvasRenderingContext2D;
  private stage = new Stage();
  private r!: FightResult;
  private specs!: [FighterSpec, FighterSpec];
  private tick = 0;
  private acc = 0;
  private last = 0;
  private time = 0;
  speed = 1;
  private evIdx = 0;
  private hold = 0;
  private shake = 0;
  private flash: [number, number] = [0, 0];
  private excite = 0;
  private fs!: [FS, FS];
  private hp!: [Record<Zone, number>, Record<Zone, number>];
  private tiers!: [Record<Zone, ZoneTier>, Record<Zone, ZoneTier>];
  private parts: Part[] = [];
  private fx: Fx[] = [];
  private banners: Banner[] = [];
  private props: Prop[] = [];
  private nets: Net[] = [];
  private stains: { x: number; y: number; r: number; a: number }[] = [];
  private gibs: Gib[] = [];
  private cam = { x: W / 2, z: 1 };
  private ended = false;
  private warned = false;
  private frameDt = 0.016;
  private cm!: Commentator;
  private introDone = false;
  private dark = 0;   // storm intensity for infamous challengers
  private bolt = 0;   // lightning flash
  private boss = -1;  // which fighter is the infamous challenger
  private after = 0; // animation time (ticks) that keeps running after the fight ends
  onLog: (line: string, cls?: string) => void = () => {};
  onHud: () => void = () => {};
  onEnd: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = W; canvas.height = H;
    this.c = canvas.getContext('2d')!;
    requestAnimationFrame((t) => this.loop(t));
  }

  get hpNow() { return this.hp; }
  get tiersNow() { return this.tiers; }
  get maxHp() { return this.r.maxHp; }
  get el() { return this.canvas; }

  load(r: FightResult, specs: [FighterSpec, FighterSpec]) {
    this.r = r; this.specs = specs;
    this.tick = 0; this.acc = 0; this.evIdx = 0; this.hold = 0; this.shake = 0; this.excite = 0; this.ended = false; this.after = 0;
    this.parts = []; this.fx = []; this.banners = [{ life: 1.6, text: 'FIGHT!', color: '#ffd24a' }]; this.props = []; this.nets = []; this.stains = []; this.gibs = [];
    this.flash = [0, 0];
    const mk = (i: 0 | 1): FS => ({ act: null, start: -99, hitAt: -99, stunUntil: -1, snareUntil: -1, bleedUntil: -1, armed: true, deadAt: -1, yieldAt: -1, trail: [], look: lookFor(specs[i], i), dur: { su: 1, ac: 1, rc: 1 }, marks: carriedMarks(specs[i]), bloody: false, lastCut: 'torso', severed: {}, slowUntil: -1, moveUntil: -1, moveDir: 1, seq: 0 });
    this.fs = [mk(0), mk(1)];
    const start = (i: 0 | 1) => {
      const o = { ...r.maxHp[i] };
      for (const z of ZONES) o[z] = Math.max(1, o[z] - (specs[i].carriedHpLoss?.[z] ?? 0));
      return o;
    };
    this.hp = [start(0), start(1)];
    const tiers = (i: 0 | 1) => Object.fromEntries(ZONES.map((z) => [z, tierOf(this.hp[i][z], r.maxHp[i][z])])) as Record<Zone, ZoneTier>;
    this.tiers = [tiers(0), tiers(1)];
    this.boss = specs[0].boss ? 0 : specs[1].boss ? 1 : -1; this.dark = 0; this.bolt = 0;
    this.cm = new Commentator(specs, r.seed, r.maxHp); this.introDone = false;
    this.cam = { x: W / 2, z: 1 };
    this.onHud();
  }

  // ---- loop ------------------------------------------------------------------------------
  private loop(t: number) {
    requestAnimationFrame((n) => this.loop(n)); // schedule first so one bad frame cannot stop playback
    const dt = Math.min(0.08, (t - this.last) / 1000 || 0);
    this.last = t; this.time += dt; this.frameDt = dt || 0.016;
    if (this.boss >= 0) { this.dark = Math.min(1, this.dark + dt * 0.7); if (this.dark > 0.9 && Math.random() < dt * 0.3) this.bolt = 1; } else this.dark = 0;
    this.bolt = Math.max(0, this.bolt - dt * 3);
    if (this.r) {
      if (this.hold > 0) this.hold -= dt;
      else if (this.ended) this.after += dt * 20;
      else if (!this.ended) {
        this.acc += dt * 20 * this.speed;
        const steps = Math.floor(this.acc); this.acc -= steps;
        for (let i = 0; i < steps && !this.ended && this.hold <= 0; i++) this.step();
      }
      this.updateFx(dt);
      try { this.draw(); } catch (e) { this.c.setTransform(1, 0, 0, 1, 0, 0); this.c.globalAlpha = 1; if (!this.warned) { this.warned = true; console.error(e); } }
    }
  }

  private step() {
    if (!this.introDone) { this.introDone = true; for (const l of this.cm.intro()) this.onLog(l.text, l.cls); }
    const ev = this.r.events;
    while (this.evIdx < ev.length && ev[this.evIdx].tick <= this.tick) this.apply(ev[this.evIdx++]);
    this.tick++;
    if (this.tick >= this.r.ticks && !this.ended) {
      while (this.evIdx < ev.length) this.apply(ev[this.evIdx++]); // final death/yield/cap events share the last tick
      this.ended = true; this.onEnd();
    }
  }

  private fast() { return this.speed > 8; }
  private now() { return this.tick + (this.hold > 0 ? 0 : this.acc) + this.after; }
  private pos(i: 0 | 1, n = this.now()): number {
    const tr = this.r.track!;
    if (!tr.length) return 20 * PX + 40;
    const a = clamp(Math.floor(n), 0, tr.length - 1), b = Math.min(a + 1, tr.length - 1);
    return (tr[a][i] + (tr[b][i] - tr[a][i]) * (n - a)) * PX + 40;
  }

  // ---- events ----------------------------------------------------------------------------
  private banner(text: string, color = '#ffd24a') { this.banners.push({ life: 1.3, text, color }); }

  private impact(victim: 0 | 1, attacker: 0 | 1, zone: Zone, kind: 'hit' | 'crit' | 'blocked') {
    if (this.fast()) return;
    const vx = this.pos(victim), dir = this.pos(attacker) < vx ? -1 : 1, y = FLOOR + ZONE_Y[zone];
    const x = vx + dir * 12;
    this.parts.push({ x, y, vx: 0, vy: 0, life: 0.22, max: 0.22, kind: 'burst', size: kind === 'crit' ? 46 : kind === 'blocked' ? 26 : 32, color: kind === 'blocked' ? '#cfe6ff' : '#fff2c0' });
    const n = kind === 'crit' ? 14 : 8;
    for (let k = 0; k < n; k++) {
      const a = (Math.random() - 0.5) * 2.4 + (dir > 0 ? 0 : Math.PI), s = 140 + Math.random() * 220;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.35, max: 0.35, kind: 'spark', size: 2 + Math.random() * 2, color: kind === 'blocked' ? '#e8f4ff' : kind === 'crit' ? '#ffd24a' : '#ff9a4a' });
    }
  }

  private apply(e: FightEvent) {
    const a = e.actor, d = (1 - a) as 0 | 1;
    if (e.hp) { this.hp = [{ ...e.hp[0] }, { ...e.hp[1] }]; this.onHud(); }
    const victimOfChange = d; // a counter is emitted by the defender, so the victim is always the other fighter
    if (e.zoneStateChanges) {
      for (const c of e.zoneStateChanges) {
        this.tiers[victimOfChange][c.zone] = c.tier;
        if (c.tier === 'disabled' && c.zone !== 'torso' && c.zone !== 'head') {
          this.banner(`${ZONE_NAME[c.zone].toUpperCase()} DISABLED`, '#ff8a6a');
          this.maim(victimOfChange, c.zone, e);
          if (c.zone === 'armW' && this.fs[victimOfChange].armed) this.dropWeapon(victimOfChange);
        }
      }
      this.onHud();
    }
    const n = this.specs[a].name;
    const now = this.tick;
    switch (e.result) {
      case 'start': {
        const def = ACTIONS[e.action!];
        const m = def.weaponSpeed ? this.specs[a].weapon.speed : 1;
        this.fs[a].act = def; this.fs[a].start = now; if (def.attack) this.fs[a].seq++;
        this.fs[a].dur = { su: Math.max(1, Math.round(def.startup * m)), ac: def.active, rc: Math.round(def.recovery * m) };
        if (['advance', 'retreat', 'dodge'].includes(def.id) && !this.fast()) this.dust(a, def.id === 'dodge' ? 5 : 2);
        if (def.id === 'advance' || def.id === 'retreat') { this.fs[a].moveUntil = now + 6; this.fs[a].moveDir = def.id === 'advance' ? 1 : -1; }
        if (e.action === 'net') this.nets.push({ i: a, t0: now, ok: null });
        break;
      }
      case 'hit': case 'crit': case 'blocked': {
        const z = e.targetZone ?? 'torso';
        this.fs[d].hitAt = now;
        this.flash[d] = 1;
        this.shake = Math.max(this.shake, e.result === 'crit' ? 9 : e.result === 'blocked' ? 2 : 4.5);
        this.hold = e.result === 'crit' ? 0.13 : e.result === 'blocked' ? 0.035 : 0.065;
        this.excite = Math.min(1, this.excite + (e.result === 'crit' ? 0.5 : 0.18));
        this.impact(d, a, z, e.result);
        if (e.result !== 'blocked') this.wound(a, d, z, e);
        if (!this.fast()) this.fx.push({ life: 0.9, x: this.pos(d), y: FLOOR + ZONE_Y[z] - 26, text: `${Math.round(e.damage ?? 0)}`, color: e.result === 'blocked' ? '#9ec3e6' : e.result === 'crit' ? '#ffd24a' : '#ff7a5a' });
        if (e.result === 'crit') this.banner('CRITICAL!', '#ffd24a');
        for (const s of e.statuses ?? []) {
          if (s === 'stun') this.fs[d].stunUntil = now + 10;
          if (s === 'snare') { this.fs[d].snareUntil = now + 80; const nt = this.nets.find((x) => x.i === a && x.ok === null); if (nt) nt.ok = true; }
          if (s === 'bleed') this.fs[d].bleedUntil = now + 100;
          if (s === 'slow') this.fs[d].slowUntil = now + 40;
        }
        break;
      }
      case 'whiff': { const nt = this.nets.find((x) => x.i === a && x.ok === null); if (nt && e.action === 'net') nt.ok = false; break; }
      case 'dodged': break;
      case 'countered':
        this.fs[d].hitAt = now; this.flash[d] = 1; this.shake = 7; this.hold = 0.1; this.banner('COUNTER!', '#ffb04a');
        this.impact(d, a, 'torso', 'crit'); this.fs[d].act = null; break;
      case 'yield':
        this.fs[a].yieldAt = now; if (this.fs[a].armed) this.dropWeapon(a);
        this.banner(`${n.toUpperCase()} YIELDS`, '#ffffff'); break;
      case 'death':
        this.fs[a].deadAt = now; this.shake = 8; this.hold = 0.15; this.excite = 1;
        this.banner('FALLEN', '#ff8a6a'); this.stains.push({ x: this.pos(a), y: FLOOR + 8, r: 34, a: 0.55 }); this.deathGore(a); break;
      case 'cap': break;
      default: break;
    }
    for (const l of this.cm.line(e)) this.onLog(l.text, l.cls);
  }

  /** Leave a cut or bruise on the zone that was hit; edged weapons draw blood. */
  private wound(att: 0 | 1, vic: 0 | 1, zone: Zone, e: FightEvent) {
    const f = this.fs[vic];
    const crit = e.result === 'crit', big = (e.damage ?? 0) > 6 || crit;
    const edged = this.specs[att].weapon.edged && e.action !== 'bash' && e.action !== 'net' && this.fs[att].armed;
    const cut = edged && (crit || Math.random() < 0.72);
    if (f.marks.filter((m) => m.zone === zone).length < 5) {
      f.marks.push({ zone, kind: cut ? 'cut' : 'bruise', t: 0.12 + Math.random() * 0.78, o: Math.random() * 2 - 1, a: (Math.random() - 0.5) * 1.4 + (cut ? 0.5 : 0), s: big ? 1.3 : 0.9 });
    }
    if (!cut) return;
    f.lastCut = zone; this.fs[att].bloody = true;
    if (this.fast()) return;
    const vx = this.pos(vic), dir = this.pos(att) < vx ? -1 : 1, y = FLOOR + ZONE_Y[zone], n = crit ? 14 : big ? 9 : 5;
    for (let k = 0; k < n; k++) {
      const a = (Math.random() - 0.5) * 2.2 + (dir > 0 ? 0 : Math.PI), s = 90 + Math.random() * 230;
      this.parts.push({ x: vx + dir * 10, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, life: 1.2, max: 1.2, kind: 'blood', size: 1.6 + Math.random() * 2.2, color: Math.random() < 0.5 ? '#b3261c' : '#8e1b14' });
    }
  }

  private chunks(x: number, y: number, n: number, colors: string[], size: [number, number], power = 1, bone = false) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = (90 + Math.random() * 260) * power;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 140, life: 1.6, max: 1.6, kind: 'gore', size: size[0] + Math.random() * (size[1] - size[0]), color: bone ? '#f1ead6' : colors[Math.floor(Math.random() * colors.length)] });
    }
  }

  /** A limb is destroyed: cut clean off by edged weapons, otherwise snapped with bone showing. */
  private maim(i: 0 | 1, zone: Zone, e: FightEvent) {
    const att = (1 - i) as 0 | 1, f = this.fs[i];
    const edged = this.specs[att].weapon.edged && e.action !== 'bash' && e.action !== 'net' && this.fs[att].armed;
    const x = this.pos(i), y = FLOOR + ZONE_Y[zone];
    const sever = edged && (e.result === 'crit' || Math.random() < 0.65);
    if (sever) {
      f.severed[zone] = true;
      this.props.push({ x: x + 12, y, vy: -220, rot: 10, spin: 480, w: this.specs[i].weapon, look: f.look, landed: false, limb: { leg: zone === 'legL' || zone === 'legR' } });
    }
    if (this.fast()) return;
    this.chunks(x, y, sever ? 10 : 7, ['#8e1b14', '#b3261c'], [2.5, 5]);
    this.chunks(x, y, sever ? 6 : 8, [], [2, 4], 1, true); // bone splinters
    this.shake = Math.max(this.shake, 8);
  }

  /** The killing blow: guts or brains and bone fragments spill across the sand. */
  private deathGore(i: 0 | 1) {
    if (this.fast()) return;
    const x = this.pos(i), t = this.tiers[i];
    if (t.torso === 'disabled') {
      this.chunks(x, FLOOR - 70, 18, ['#d97b8f', '#c4616f', '#8e1b14'], [3, 6.5], 1.1);
      this.chunks(x, FLOOR - 70, 8, [], [2, 4], 1, true);
    }
    if (t.head === 'disabled') {
      this.chunks(x, FLOOR - 115, 14, ['#dca4ae', '#c98893', '#8e1b14'], [2.5, 5.5], 1.2);
      this.chunks(x, FLOOR - 115, 10, [], [2, 4.5], 1.2, true);
    }
    if (t.torso !== 'disabled' && t.head !== 'disabled') this.chunks(x, FLOOR - 80, 8, ['#8e1b14', '#b3261c'], [2.5, 5]);
  }

  private dropWeapon(i: 0 | 1) {
    const f = this.fs[i]; f.armed = false;
    this.props.push({ x: this.pos(i) + 18, y: FLOOR - 70, vy: -120, rot: 20, spin: 360, w: this.specs[i].weapon, look: f.look, landed: false });
  }

  private dust(i: 0 | 1, n: number) {
    const x = this.pos(i), dir = this.pos((1 - i) as 0 | 1) > x ? -1 : 1;
    for (let k = 0; k < n; k++) this.parts.push({ x: x + dir * 8, y: FLOOR - 2, vx: dir * (30 + Math.random() * 50), vy: -20 - Math.random() * 40, life: 0.5, max: 0.5, kind: 'dust', size: 5 + Math.random() * 6, color: '#d9bd8a' });
  }

  private updateFx(dt: number) {
    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === 'blood') {
        p.vy += 700 * dt;
        if (p.vy > 0 && p.y >= FLOOR - 2) { p.life = 0; if (this.stains.length < 140) this.stains.push({ x: p.x, y: FLOOR + Math.random() * 26 - 8, r: 2 + Math.random() * 4.5, a: 0.55 }); }
      }
      if (p.kind === 'gore') {
        p.vy += 760 * dt;
        if (p.vy > 0 && p.y >= FLOOR - 2) {
          p.life = 0;
          if (this.gibs.length < 90) this.gibs.push({ x: p.x, y: FLOOR + Math.random() * 24 - 6, color: p.color, s: p.size, r: Math.random() * 3, bone: p.color === '#f1ead6' });
          if (this.stains.length < 160) this.stains.push({ x: p.x, y: FLOOR + Math.random() * 20 - 4, r: p.size * 1.4, a: 0.5 });
        }
      }
      if (p.kind === 'spark') p.vy += 500 * dt; if (p.kind === 'dust') p.vy *= 0.94; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.fx) f.life -= dt;
    this.fx = this.fx.filter((f) => f.life > 0);
    for (const b of this.banners) b.life -= dt;
    this.banners = this.banners.filter((b) => b.life > 0);
    this.shake = Math.max(0, this.shake - dt * 32);
    this.flash = [Math.max(0, this.flash[0] - dt * 5), Math.max(0, this.flash[1] - dt * 5)];
    this.excite = Math.max(0, this.excite - dt * 0.25);
    for (const p of this.props) if (!p.landed) { p.vy += 900 * dt; p.y += p.vy * dt; p.rot += p.spin * dt; if (p.y >= FLOOR - 6) { p.y = FLOOR - 6; p.landed = true; p.rot = 86; } }
  }

  // ---- drawing ---------------------------------------------------------------------------
  private draw() {
    const c = this.c;
    const now = this.now();
    const p0 = this.pos(0), p1 = this.pos(1);
    const sep = Math.abs(p0 - p1);
    const zt = clamp(640 / (sep + 260), 1.3, 1.75);
    const target = (p0 + p1) / 2;
    this.cam.x += (target - this.cam.x) * (1 - Math.exp(-this.frameDt * 7)); this.cam.z += (zt - this.cam.z) * (1 - Math.exp(-this.frameDt * 5));
    const sx = this.shake > 0 ? Math.sin(this.time * 71) * this.shake * 0.55 : 0, sy = this.shake > 0 ? Math.cos(this.time * 83) * this.shake * 0.55 : 0;

    c.save(); c.translate(sx, sy);
    this.stage.drawBack(c, this.cam.x, this.time, this.excite);
    if (this.dark > 0) this.stage.storm(c, this.dark, this.bolt, this.time);
    c.save();
    c.translate(W / 2, FLOOR); c.scale(this.cam.z, this.cam.z); c.translate(-this.cam.x, -FLOOR);
    this.stage.drawFloor(c);
    for (const s of this.stains) { c.fillStyle = `rgba(112,20,16,${s.a})`; c.beginPath(); c.ellipse(s.x, s.y, s.r, s.r * 0.38, 0, 0, 7); c.fill(); }
    for (const g of this.gibs) {
      c.save(); c.translate(g.x, g.y); c.rotate(g.r);
      c.fillStyle = g.color; c.strokeStyle = g.bone ? '#7a7058' : '#3a0907'; c.lineWidth = 1;
      if (g.bone) { c.beginPath(); c.moveTo(-g.s * 1.6, 0); c.lineTo(g.s * 1.6, -g.s * 0.4); c.lineTo(g.s * 1.2, g.s * 0.5); c.closePath(); c.fill(); c.stroke(); }
      else { c.beginPath(); c.ellipse(0, 0, g.s * 1.5, g.s * 0.9, 0, 0, 7); c.fill(); c.stroke(); }
      c.restore();
    }
    for (const p of this.props) {
      c.save(); c.translate(p.x, p.y);
      if (p.limb) this.drawLimbProp(c, p); else drawWeapon(c, p.w, 0, 0, p.rot, p.look);
      c.restore();
    }
    for (const i of [0, 1] as const) { c.fillStyle = this.specs[i].boss ? 'rgba(110,0,0,.5)' : 'rgba(40,20,10,.3)'; c.beginPath(); c.ellipse(this.pos(i), FLOOR + 2 + (i === 0 ? 14 : -14), 34, 8, 0, 0, 7); c.fill(); }
    const order: (0 | 1)[] = [1, 0]; // back lane first
    for (const i of order) this.drawOne(i, now);
    this.drawTrails(c, now);
    this.drawNets(c, now);
    for (const p of this.parts) this.drawPart(c, p);
    for (const f of this.fx) {
      const y = f.y - (0.9 - f.life) * 46;
      c.globalAlpha = clamp(f.life * 2, 0, 1); c.font = 'bold 24px system-ui'; c.lineWidth = 4; c.strokeStyle = '#1d1511';
      c.strokeText(f.text, f.x - 8, y); c.fillStyle = f.color; c.fillText(f.text, f.x - 8, y);
    }
    c.globalAlpha = 1;
    c.restore();
    if (this.dark > 0) { c.fillStyle = `rgba(110,8,14,${0.14 * this.dark})`; c.fillRect(0, 0, W, H); }
    this.stage.vignette(c);
    this.drawHud(c, now);
    c.restore();
  }

  private drawOne(i: 0 | 1, now: number) {
    const c = this.c, f = this.fs[i], spec = this.specs[i];
    const x = this.pos(i), facing = x <= this.pos((1 - i) as 0 | 1) ? 1 : -1;
    const age = now - f.start;
    const { su, ac, rc } = f.dur;
    const done = f.act && age >= su + ac + rc + (f.act.attack ? 2 : 0);
    const act = f.act && !done ? f.act : null;
    const dead = f.deadAt >= 0, fallAge = dead ? now - f.deadAt : -1;
    const winner = this.ended && this.r.winner === i;
    const phase = (x / PX) * 1.5;
    const holdWalk = !act && now < f.moveUntil; // keep the walk cycle between steps
    const target = poseFor({
      act: holdWalk ? ACTIONS[f.moveDir > 0 ? 'advance' : 'retreat'] : act, age, dur: f.dur, weapon: f.armed ? spec.weapon : { ...spec.weapon, name: 'Bare Hands' }, phase,
      hitAge: now - f.hitAt, stunned: now < f.stunUntil, t: this.time + i, fallAge, yielded: f.yieldAt >= 0 && !dead,
      victory: winner && !dead && f.yieldAt < 0, tiers: this.tiers[i], seq: f.seq,
    });
    // blend toward the target pose in real time: no snapping between actions (fast during the strike itself)
    const striking = !!act && act.attack && age >= f.dur.su - 1 && age < f.dur.su + Math.max(2, f.dur.ac) + 2;
    const rate = (striking ? 40 : 13) * clamp(this.speed, 1, 4);
    f.sm = f.sm ? smoothPose(f.sm, target, 1 - Math.exp(-rate * this.frameDt)) : target;
    const pose = f.sm;
    const fall = dead ? clamp(fallAge / 10, 0, 1) : 0;
    c.save();
    const lane = i === 0 ? 14 : -14;
    const sc = spec.boss ? 1.12 : 1; // infamous challengers loom larger
    c.translate(x, FLOOR + lane + (dead ? 8 * fall : 0)); c.scale(facing * sc, sc);
    const tip: Tip | null = drawFighter(c, {
      spec, look: f.look, pose, tiers: this.tiers[i], carried: spec.carriedHpLoss ?? {}, armed: f.armed, flash: this.flash[i],
      fall: fall * fall * (3 - 2 * fall), stunned: now < f.stunUntil, snared: now < f.snareUntil, t: this.time + i,
      trimGold: spec.armor.torso > CLASSES[spec.classId].armor.torso + 3, netArm: spec.classId === 'retiarius' && f.armed, marks: f.marks, bloody: f.bloody, severed: f.severed,
    });
    c.restore();
    if (tip && act && act.attack && age >= su && age <= su + Math.max(1.6, ac) + 2) {
      f.trail.push({ x: x + facing * tip.x, y: FLOOR + lane + tip.y, t: now });
    }
    f.trail = f.trail.filter((t) => now - t.t < 3.5);
    if (now < f.bleedUntil && !this.fast() && Math.random() < 0.22) this.parts.push({ x: x + (Math.random() - 0.5) * 10, y: FLOOR + lane + ZONE_Y[f.lastCut], vx: 0, vy: 25, life: 1.2, max: 1.2, kind: 'blood', size: 2 + Math.random(), color: '#a5231a' });
  }

  /** A severed arm or leg tumbling across the sand. */
  private drawLimbProp(c: CanvasRenderingContext2D, p: Prop) {
    c.rotate((p.rot * Math.PI) / 180);
    const skin = p.look.skin, len = p.limb!.leg ? 46 : 36;
    c.lineCap = 'round';
    c.strokeStyle = '#1d1511'; c.lineWidth = 15; c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(len / 2, 0); c.stroke();
    c.strokeStyle = skin; c.lineWidth = 11; c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(len / 2, 0); c.stroke();
    c.fillStyle = '#8e1b14'; c.beginPath(); c.arc(-len / 2, 0, 6.2, 0, 7); c.fill();
    c.fillStyle = '#f1ead6'; c.beginPath(); c.arc(-len / 2, 0, 2.6, 0, 7); c.fill();
    if (p.limb!.leg) { c.fillStyle = '#4a3322'; c.beginPath(); c.ellipse(len / 2 + 3, 0, 8, 5.5, 0, 0, 7); c.fill(); }
  }

  private drawTrails(c: CanvasRenderingContext2D, now: number) {
    for (const f of this.fs) {
      if (f.trail.length < 2) continue;
      for (let k = 1; k < f.trail.length; k++) {
        const a = f.trail[k - 1], b = f.trail[k], age = (now - b.t) / 3.5;
        if (Math.hypot(a.x - b.x, a.y - b.y) > 110) continue;
        c.strokeStyle = `rgba(235,245,255,${(1 - age) * 0.8})`; c.lineWidth = 7 * (1 - age) + 1; c.lineCap = 'round';
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
    }
  }

  private drawNets(c: CanvasRenderingContext2D, now: number) {
    for (const n of this.nets) {
      const age = now - n.t0 - this.fs[n.i].dur.su;
      if (age < 0 || age > 6) continue;
      const t = age / 5, from = this.pos(n.i), to = this.pos((1 - n.i) as 0 | 1);
      const x = from + (to - from) * clamp(t, 0, 1), y = FLOOR - 100 + 40 * t, r = 12 + 30 * t;
      this.mesh(c, x, y, r, 0.75);
    }
    this.nets = this.nets.filter((n) => now - n.t0 < 20);
    for (const i of [0, 1] as const) if (now < this.fs[i].snareUntil) this.mesh(c, this.pos(i), FLOOR - 62, 52, 0.6);
  }

  private mesh(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
    c.save(); c.translate(x, y); c.strokeStyle = `rgba(230,220,190,${a})`; c.fillStyle = `rgba(230,220,190,${a * 0.18})`; c.lineWidth = 1.6;
    c.beginPath(); c.ellipse(0, 0, r * 0.8, r, 0, 0, 7); c.fill(); c.stroke();
    c.beginPath();
    for (let k = -3; k <= 3; k++) { c.moveTo(k * r * 0.25, -r); c.lineTo(k * r * 0.25, r); c.moveTo(-r * 0.8, k * r * 0.3); c.lineTo(r * 0.8, k * r * 0.3); }
    c.stroke(); c.restore();
  }

  private drawPart(c: CanvasRenderingContext2D, p: Part) {
    const t = p.life / p.max;
    if (p.kind === 'burst') {
      c.save(); c.translate(p.x, p.y); c.globalAlpha = t; c.fillStyle = p.color;
      const R = p.size * (1.3 - t * 0.5);
      c.beginPath(); for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.283, rr = k % 2 ? R * 0.4 : R; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill();
      c.restore(); c.globalAlpha = 1; return;
    }
    c.globalAlpha = t * (p.kind === 'dust' ? 0.55 : 1); c.fillStyle = p.color;
    if (p.kind === 'spark') { c.strokeStyle = p.color; c.lineWidth = p.size; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); c.stroke(); }
    else { c.beginPath(); c.arc(p.x, p.y, p.size * (p.kind === 'dust' ? 1.4 - t * 0.6 : 1), 0, 7); c.fill(); }
    c.globalAlpha = 1;
  }

  /** Big blood-red name with dripping letters, for infamous challengers. */
  private bloodyName(c: CanvasRenderingContext2D, text: string, x: number, y: number) {
    c.font = "bold 31px system-ui"; c.lineWidth = 6; c.lineJoin = 'round'; c.strokeStyle = '#2a0000';
    c.strokeText(text, x, y); c.fillStyle = '#e01616'; c.fillText(text, x, y);
    const w = c.measureText(text).width, left = c.textAlign === 'left' ? x : x - w;
    for (let k = 0; k < 7; k++) {
      const dx = left + ((k * 0.137 + 0.08) % 1) * w, len = 4 + ((k * 7) % 9) + Math.sin(this.time * 1.6 + k * 1.7) * 2;
      c.strokeStyle = '#b30f0f'; c.lineWidth = 2.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(dx, y + 1); c.lineTo(dx, y + 2 + len); c.stroke();
      c.fillStyle = '#b30f0f'; c.beginPath(); c.arc(dx, y + 3 + len, 2.4, 0, 7); c.fill();
    }
  }

  // ---- HUD -------------------------------------------------------------------------------
  private drawHud(c: CanvasRenderingContext2D, now: number) {
    const k = clamp(640 / Math.max(300, this.canvas.clientWidth || W), 1, 2.1), Wv = W / k;
    c.save(); c.scale(k, k);
    const bw = Math.min(340, Wv / 2 - 26);
    for (const i of [0, 1] as const) {
      const spec = this.specs[i], hp = this.hp[i], mx = this.r.maxHp[i];
      const x0 = i === 0 ? 18 : Wv - 18 - bw, dir = i === 0 ? 1 : -1;
      const pct = clamp(hp.torso / mx.torso, 0, 1), hpct = clamp(hp.head / mx.head, 0, 1);
      c.fillStyle = 'rgba(15,10,8,.72)'; c.beginPath(); c.roundRect(x0 - 8, 10, bw + 16, 74, 10); c.fill();
      c.textAlign = i === 0 ? 'left' : 'right';
      if (spec.boss) this.bloodyName(c, spec.name, i === 0 ? x0 : x0 + bw, 38);
      else { c.fillStyle = '#f1e6d0'; c.font = 'bold 15px system-ui'; c.fillText(spec.name, i === 0 ? x0 : x0 + bw, 28); }
      c.fillStyle = '#a8977c'; c.font = '11px system-ui';
      if (!spec.boss) c.fillText(`${CLASSES[spec.classId].label} · Lv ${spec.level}`, i === 0 ? x0 : x0 + bw, 41);
      c.fillStyle = '#120e0a'; c.fillRect(x0, 47, bw, 13);
      const col = pct > 0.5 ? '#6aa65a' : pct > 0.25 ? '#d9a441' : '#c4513a';
      const w = bw * pct, bx = i === 0 ? x0 : x0 + bw - w;
      c.fillStyle = col; c.fillRect(bx, 47, w, 13);
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(bx, 47, w, 4);
      c.strokeStyle = '#4a3b2c'; c.lineWidth = 1.5; c.strokeRect(x0, 47, bw, 13);
      c.fillStyle = '#120e0a'; c.fillRect(x0, 63, bw, 6);
      const hw = bw * hpct; c.fillStyle = '#c4a24a'; c.fillRect(i === 0 ? x0 : x0 + bw - hw, 63, hw, 6);
      ZONES.forEach((z, k) => {
        const t = this.tiers[i][z]; c.fillStyle = t === 'ok' ? '#6aa65a' : t === 'hurt' ? '#d9a441' : t === 'crippled' ? '#c4513a' : '#000';
        c.strokeStyle = '#4a3b2c'; c.lineWidth = 1; const px = i === 0 ? x0 + k * 14 : x0 + bw - 11 - k * 14;
        c.fillRect(px, 72, 11, 7); c.strokeRect(px, 72, 11, 7);
      });
      let sx = i === 0 ? x0 + 100 : x0 + bw - 100;
      c.font = 'bold 11px system-ui';
      const chip = (txt: string, bg: string) => {
        const cw = c.measureText(txt).width + 10, rx = i === 0 ? sx : sx - cw;
        c.fillStyle = bg; c.beginPath(); c.roundRect(rx, 71, cw, 11, 5); c.fill();
        c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(txt, rx + 5, 80); sx += dir * (cw + 4);
      };
      if (now < this.fs[i].stunUntil) chip('STUNNED', '#8a6a1f');
      if (now < this.fs[i].snareUntil) chip('NETTED', '#4a6a8a');
      if (now < this.fs[i].slowUntil) chip('HOBBLED', '#6a5a2a');
      if (now < this.fs[i].bleedUntil) chip('BLEEDING', '#8a2f25');
    }
    c.textAlign = 'center'; c.fillStyle = '#f1e6d0'; c.font = 'bold 22px system-ui';
    const secs = Math.floor(now / 20);
    c.fillText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, Wv / 2, 36);
    for (const [k, b] of this.banners.entries()) {
      const by = 200 + k * 50;
      c.globalAlpha = clamp(b.life * 2.5, 0, 1); c.font = "bold 40px system-ui"; c.lineWidth = 7; c.strokeStyle = '#1d1511'; c.lineJoin = 'round';
      c.strokeText(b.text, Wv / 2, by); c.fillStyle = b.color; c.fillText(b.text, Wv / 2, by);
      c.globalAlpha = 1;
    }
    if (this.ended) {
      const w = this.r.winner;
      const txt = w === null ? 'DRAW' : `${this.specs[w].name} WINS`;
      const sub = this.r.method === 'death' ? 'by death' : this.r.method === 'yield' ? 'by yield' : 'on time';
      c.fillStyle = 'rgba(10,6,4,.55)'; c.fillRect(0, 98, Wv, 64);
      c.font = 'bold 34px system-ui'; c.lineWidth = 6; c.strokeStyle = '#1d1511'; c.strokeText(txt, Wv / 2, 138); c.fillStyle = "#ffd24a"; c.fillText(txt, Wv / 2, 138);
      c.font = '13px system-ui'; c.fillStyle = '#cdbd9f'; c.fillText(sub, Wv / 2, 156);
    }
    c.textAlign = 'left';
    c.restore();
  }
}

const carriedMarks = (sp: FighterSpec): Mark[] =>
  ZONES.filter((z) => (sp.carriedHpLoss?.[z] ?? 0) > 0).map((z) => ({ zone: z, kind: 'bruise' as const, t: 0.5, o: 0, a: 0.3, s: 1.2 }));

const POSE_KEYS = ['lean', 'head', 'x', 'drop', 'wU', 'wL', 'sU', 'sL', 'fU', 'fL', 'bU', 'bL'] as const;
function smoothPose(a: Pose, b: Pose, k: number): Pose {
  const o = { ...b };
  for (const key of POSE_KEYS) o[key] = a[key] + (b[key] - a[key]) * k;
  return o;
}
