// Parametric humanoid rig, drawn front-on (3/4 toward the viewer) so the whole body is visible:
// both arms, both legs, face and gear. Everything comes from joint angles; no external art.
// Angles are degrees from straight down, positive toward the opponent (+x in local space).
import type { ClassId, FighterSpec, WeaponDef, Zone, ZoneTier } from '../sim/types';

export const OUT = '#1d1511';
const D2R = Math.PI / 180;

export interface Pose {
  lean: number;   // torso lean toward the opponent
  head: number;   // head tilt
  x: number;      // body offset toward the opponent (px)
  drop: number;   // extra crouch (px, lowers hips)
  wU: number; wL: number;   // weapon arm: upper, forearm
  sU: number; sL: number;   // off (shield) arm
  fU: number; fL: number;   // lead leg thigh, shin
  bU: number; bL: number;   // rear leg thigh, shin
}

export const IDLE: Pose = { lean: 5, head: 0, x: 0, drop: 0, wU: 30, wL: 62, sU: -8, sL: 28, fU: 16, fL: 4, bU: -16, bL: -4 };

const K = ['lean', 'head', 'x', 'drop', 'wU', 'wL', 'sU', 'sL', 'fU', 'fL', 'bU', 'bL'] as const;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function mix(a: Pose, b: Pose, t: number): Pose {
  const o = { ...a };
  for (const k of K) o[k] = lerp(a[k], b[k], t);
  return o;
}
export const pose = (p: Partial<Pose>): Pose => ({ ...IDLE, ...p });

export interface Look {
  skin: string; hair: string; main: string; trim: string; metal: string; cloth: string;
  helm: ClassId;
}
const BASE: Record<ClassId, { main: string; trim: string; metal: string }> = {
  murmillo: { main: '#35598a', trim: '#d4af4a', metal: '#b88b4a' },
  thraex: { main: '#9a4636', trim: '#e0cc8a', metal: '#aab4bd' },
  hoplomachus: { main: '#4a7a48', trim: '#e6c878', metal: '#c68f40' },
  retiarius: { main: '#6a5694', trim: '#d6dde3', metal: '#8f9aa5' },
  dimachaerus: { main: '#b0862c', trim: '#2a2119', metal: '#d3dae0' },
  brute: { main: '#76563a', trim: '#c4513a', metal: '#7d858c' },
};
const SKINS = ['#e3b78f', '#c98d5f', '#a86a42', '#f0cfae', '#8a5634'];
const HAIR = ['#2a1b12', '#5b3a1f', '#1a1a1a', '#8a6a3a', '#c9b07a'];
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

export function shade(hex: string, amt: number) {
  let r: number, g: number, b: number;
  if (hex.startsWith('#')) { const n = parseInt(hex.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  else { const m = hex.match(/\d+/g)!.map(Number); r = m[0]; g = m[1]; b = m[2]; }
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function lookFor(spec: FighterSpec, side: 0 | 1): Look {
  const b = BASE[spec.classId];
  const h = hash(spec.name);
  return {
    skin: SKINS[h % SKINS.length], hair: HAIR[(h >>> 3) % HAIR.length],
    main: spec.boss ? '#4a0d12' : side === 1 ? shade(b.main, -22) : b.main, trim: spec.boss ? '#c0161c' : b.trim, metal: spec.boss ? '#3d3438' : b.metal,
    cloth: spec.boss ? '#2a0a0c' : side === 1 ? '#6b2f2a' : '#d9cdb0',
    helm: spec.classId,
  };
}

export interface DrawState {
  spec: FighterSpec;
  look: Look;
  pose: Pose;
  tiers: Record<Zone, ZoneTier>;
  carried: Partial<Record<Zone, number>>;  // zones that start injured (bandaged)
  armed: boolean;
  flash: number;       // 0..1 white hit flash
  fall: number;        // 0..1 death fall
  stunned: boolean;
  snared: boolean;
  t: number;           // seconds, for idle wobble
  trimGold: boolean;   // upgraded armor shows gold trim
  netArm: boolean;     // net in off hand (retiarius)
  severed: Partial<Record<Zone, boolean>>; // limbs cut clean off
  marks: Mark[];       // cuts and bruises picked up this fight
  bloody: boolean;     // blade is bloodied
}

export interface Mark { zone: Zone; kind: 'cut' | 'bruise'; t: number; o: number; a: number; s: number }

export interface Tip { x: number; y: number; hx: number; hy: number }

// ---- helpers ---------------------------------------------------------------------------
const pt = (x: number, y: number, a: number, l: number): [number, number] => [x + Math.sin(a * D2R) * l, y + Math.cos(a * D2R) * l];

function stroke(c: CanvasRenderingContext2D, pts: [number, number][], w: number, col: string, hi?: string) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = OUT; c.lineWidth = w + 4;
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
  c.strokeStyle = col; c.lineWidth = w;
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
  if (hi) { // flat highlight stripe for volume
    c.strokeStyle = hi; c.lineWidth = Math.max(2, w * 0.28);
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0] + w * 0.18, p[1]) : c.moveTo(p[0] + w * 0.18, p[1]))); c.stroke();
  }
}

function bandage(c: CanvasRenderingContext2D, x: number, y: number, a: number, w: number) {
  c.save(); c.translate(x, y); c.rotate(-a * D2R);
  c.fillStyle = '#e8dfc9'; c.strokeStyle = OUT; c.lineWidth = 1.5;
  c.beginPath(); c.rect(-w / 2, -3.5, w, 7); c.fill(); c.stroke();
  c.strokeStyle = '#b9ad92'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(-w / 4, -3.5); c.lineTo(-w / 4 - 2, 3.5); c.moveTo(w / 4, -3.5); c.lineTo(w / 4 - 2, 3.5); c.stroke();
  c.restore();
}

function drawMark(c: CanvasRenderingContext2D, m: Mark, x: number, y: number) {
  c.save(); c.translate(x, y); c.rotate(m.a); c.lineCap = 'round';
  if (m.kind === 'bruise') {
    const r = 5 * m.s;
    c.fillStyle = 'rgba(118,66,138,.55)'; c.beginPath(); c.ellipse(0, 0, r * 1.35, r, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(176,160,66,.4)'; c.beginPath(); c.ellipse(1, 1, r * 0.8, r * 0.55, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(80,36,96,.4)'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0, r * 1.35, r, 0, 0, 7); c.stroke();
  } else {
    const L = 6.5 * m.s;
    c.strokeStyle = '#4e0f0a'; c.lineWidth = 3.4; c.beginPath(); c.moveTo(-L, -0.5); c.lineTo(L, 0.8); c.stroke();
    c.strokeStyle = '#d8392b'; c.lineWidth = 1.7; c.beginPath(); c.moveTo(-L, -0.5); c.lineTo(L, 0.8); c.stroke();
    c.strokeStyle = '#b52a20'; c.lineWidth = 1.7; c.beginPath(); c.moveTo(L * 0.35, 1); c.lineTo(L * 0.35 + 0.6, 1 + 7 * m.s); c.stroke();
    c.fillStyle = '#b52a20'; c.beginPath(); c.arc(L * 0.35 + 0.6, 1 + 7.5 * m.s, 1.5, 0, 7); c.fill();
  }
  c.restore();
}
/** Draw this zone's marks along a two-segment limb (o -> e -> h); maxT limits to skin that is not armored. */
function limbMarks(c: CanvasRenderingContext2D, s: DrawState, zone: Zone, o: [number, number], e: [number, number], h: [number, number], maxT = 1) {
  for (const m of s.marks) {
    if (m.zone !== zone || m.t > maxT) continue;
    const u = m.t < 0.5 ? m.t * 2 : (m.t - 0.5) * 2, a = m.t < 0.5 ? o : e, b = m.t < 0.5 ? e : h;
    drawMark(c, m, a[0] + (b[0] - a[0]) * u + m.o * 3, a[1] + (b[1] - a[1]) * u);
  }
}

/** Raw end of a severed limb: red flesh with a bone core. */
function stump(c: CanvasRenderingContext2D, x: number, y: number) {
  c.fillStyle = '#8e1b14'; c.strokeStyle = '#3a0907'; c.lineWidth = 2;
  c.beginPath(); c.arc(x, y, 6.2, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#f1ead6'; c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill();
  c.fillStyle = '#ff5a48'; c.beginPath(); c.arc(x - 2, y - 2, 1.4, 0, 7); c.fill();
  c.strokeStyle = '#a5231a'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + 1, y + 5); c.lineTo(x + 1.6, y + 15); c.stroke();
}
/** Compound fracture: a bloody gash with jagged bone sticking out. */
function breakGore(c: CanvasRenderingContext2D, x: number, y: number) {
  c.fillStyle = '#7a1410'; c.strokeStyle = '#3a0907'; c.lineWidth = 2;
  c.beginPath(); c.ellipse(x, y, 7, 5, 0.4, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#f4eddc'; c.strokeStyle = '#6a604c'; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(x - 2, y + 1); c.lineTo(x + 3, y - 10); c.lineTo(x + 5, y - 6); c.lineTo(x + 8, y - 12); c.lineTo(x + 7, y - 2); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x - 8, y - 7); c.lineTo(x - 3, y - 4); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#a5231a'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x + 0.8, y + 14); c.stroke();
}
function guts(c: CanvasRenderingContext2D) {
  c.fillStyle = '#4e0b09'; c.strokeStyle = '#2a0504'; c.lineWidth = 2;
  c.beginPath(); c.ellipse(1, -17, 11, 8, 0.15, 0, 7); c.fill(); c.stroke(); // torn belly
  const loops: [number, number, number, number, number, number][] = [[-7, -15, -14, -2, -9, 16], [1, -13, 10, 2, 2, 20], [6, -16, 16, -4, 12, 12]];
  for (const [x0, y0, cx, cy, x1, y1] of loops) {
    c.lineCap = 'round';
    c.strokeStyle = '#4a0b17'; c.lineWidth = 8; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); c.stroke();
    c.strokeStyle = '#d97b8f'; c.lineWidth = 5.2; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); c.stroke();
    c.strokeStyle = '#f2adb8'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x0 + 1, y0); c.quadraticCurveTo(cx + 1.5, cy, x1 + 1, y1); c.stroke();
  }
  c.fillStyle = '#c4616f'; for (const [x, y] of [[-9, 16], [2, 20], [12, 12]]) { c.beginPath(); c.arc(x, y, 3.4, 0, 7); c.fill(); }
}
function brains(c: CanvasRenderingContext2D) {
  c.fillStyle = '#6e110e'; c.strokeStyle = '#2a0504'; c.lineWidth = 1.8;
  c.beginPath(); c.ellipse(3, -10, 10, 6, -0.25, 0, 7); c.fill(); c.stroke(); // cracked skull
  const lumps: [number, number, number][] = [[-1, -12, 4.4], [5, -14, 4.8], [10, -10, 3.8], [3, -9, 3.6]];
  c.fillStyle = '#dca4ae'; c.strokeStyle = '#a45a68'; c.lineWidth = 1;
  for (const [x, y, r] of lumps) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); }
  c.strokeStyle = '#b86f7c'; c.lineWidth = 0.9;
  for (const [x, y, r] of lumps) { c.beginPath(); c.arc(x, y, r * 0.55, 0.4, 3.2); c.stroke(); }
  c.fillStyle = '#f4eddc'; c.strokeStyle = '#6a604c'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(-6, -8); c.lineTo(-3, -16); c.lineTo(0, -9); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(12, -6); c.lineTo(14, -14); c.lineTo(9, -8); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#a5231a'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(7, -5); c.quadraticCurveTo(9, 2, 8, 11); c.stroke();
}

const hurtZone = (s: DrawState, z: Zone) => s.tiers[z] !== 'ok' || (s.carried[z] ?? 0) > 0;

// ---- weapons ---------------------------------------------------------------------------
function drawWeapon(c: CanvasRenderingContext2D, w: WeaponDef, hx: number, hy: number, ang: number, look: Look, flipSecond = false): Tip {
  c.save(); c.translate(hx, hy);
  c.rotate(Math.PI - ang * D2R); // local -y now points along the weapon direction (sin a, cos a)
  let tipLen = 40;
  const wood = '#6b4a2e';
  const line = (x0: number, y0: number, x1: number, y1: number, wd: number, col: string) => {
    c.strokeStyle = OUT; c.lineWidth = wd + 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.strokeStyle = col; c.lineWidth = wd; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  };
  const name = w.name;
  if (name.includes('Gladius')) {
    tipLen = 46; line(0, 6, 0, -4, 4, '#5a3a22'); line(-7, -4, 7, -4, 3, look.trim); line(0, -4, 0, -44, 5, '#dfe5ea');
  } else if (name.includes('Scimitar')) {
    tipLen = 46;
    line(0, 6, 0, -3, 4, '#5a3a22'); line(-6, -3, 6, -3, 3, look.trim);
    c.strokeStyle = OUT; c.lineWidth = 8; c.beginPath(); c.moveTo(0, -3); c.quadraticCurveTo(10, -26, -4, -46); c.stroke();
    c.strokeStyle = '#dfe5ea'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, -3); c.quadraticCurveTo(10, -26, -4, -46); c.stroke();
  } else if (name.includes('Spear')) {
    tipLen = 120; line(0, 26, 0, -100, 4, wood); c.fillStyle = '#dfe5ea'; c.strokeStyle = OUT; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -122); c.lineTo(6, -100); c.lineTo(0, -96); c.lineTo(-6, -100); c.closePath(); c.fill(); c.stroke();
  } else if (name.includes('Trident')) {
    tipLen = 100; line(0, 24, 0, -84, 4, wood);
    for (const dx of [-8, 0, 8]) line(dx, -84, dx, dx === 0 ? -104 : -98, 3, '#dfe5ea');
    line(-8, -84, 8, -84, 3, '#dfe5ea');
  } else if (name.includes('Twin')) {
    tipLen = 38; line(0, 5, 0, -3, 4, '#5a3a22'); line(-5, -3, 5, -3, 3, look.trim); line(0, -3, flipSecond ? -3 : 3, -38, 4, '#dfe5ea');
  } else if (name.includes('Axe')) {
    tipLen = 84; line(0, 24, 0, -70, 5, wood);
    c.fillStyle = '#c9d0d6'; c.strokeStyle = OUT; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(0, -78); c.quadraticCurveTo(26, -76, 24, -48); c.quadraticCurveTo(10, -58, 0, -50); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0, -78); c.lineTo(-7, -84); c.lineTo(0, -50); c.closePath(); c.fill(); c.stroke();
  }
  c.restore();
  return { x: hx + Math.sin(ang * D2R) * tipLen, y: hy + Math.cos(ang * D2R) * tipLen, hx, hy };
}

// Shields are seen face-on: you see the front of the shield held at the off hand.
function drawShield(c: CanvasRenderingContext2D, kind: string, hx: number, hy: number, ang: number, look: Look) {
  c.save(); c.translate(hx - 7, hy - 6); c.rotate((ang - 80) * 0.22 * D2R);
  c.strokeStyle = OUT; c.lineWidth = 3; c.lineJoin = 'round';
  if (kind.includes('Large')) { // scutum: tall curved rectangle with spine and boss
    c.fillStyle = shade(look.main, 10);
    c.beginPath(); c.roundRect(-14, -32, 28, 66, 9); c.fill(); c.stroke();
    c.fillStyle = look.trim; c.fillRect(-2.5, -30, 5, 62); c.strokeStyle = OUT; c.lineWidth = 1.5; c.strokeRect(-2.5, -30, 5, 62);
    c.fillStyle = look.trim; c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill(); c.stroke();
    c.strokeStyle = shade(look.main, 40); c.lineWidth = 2; c.beginPath(); c.roundRect(-10, -28, 20, 58, 6); c.stroke();
  } else if (kind.includes('Small')) { // parma: small round disc
    c.fillStyle = shade(look.main, 18);
    c.beginPath(); c.arc(0, 0, 20, 0, 7); c.fill(); c.stroke();
    c.strokeStyle = look.trim; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 14, 0, 7); c.stroke();
    c.fillStyle = look.trim; c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 6, 0, 7); c.fill(); c.stroke();
  } else { // hoplon: big round bronze with rim and emblem
    c.fillStyle = '#b88b4a';
    c.beginPath(); c.arc(0, 0, 25, 0, 7); c.fill(); c.stroke();
    c.strokeStyle = look.trim; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 19, 0, 7); c.stroke();
    c.fillStyle = look.main; c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fill(); c.stroke();
    c.fillStyle = look.trim; for (let k = 0; k < 6; k++) { const a = k * 1.047; c.beginPath(); c.arc(Math.cos(a) * 17, Math.sin(a) * 17, 2, 0, 7); c.fill(); }
  }
  c.restore();
}

// ---- head ----------------------------------------------------------------------------------
function drawHead(c: CanvasRenderingContext2D, s: DrawState, hx: number, hy: number, tilt: number) {
  const L = s.look;
  c.save(); c.translate(hx, hy); c.rotate(tilt * D2R);
  c.lineJoin = 'round';
  const flash = s.flash > 0.4;
  // neck
  c.fillStyle = shade(L.skin, -20); c.strokeStyle = OUT; c.lineWidth = 2;
  c.fillRect(-5, 8, 10, 9); c.strokeRect(-5, 8, 10, 9);
  // face
  c.fillStyle = flash ? '#fff' : L.skin;
  c.beginPath(); c.ellipse(0, 0, 12, 13.5, 0, 0, 7); c.fill(); c.stroke();
  // ears
  c.beginPath(); c.ellipse(-12, 1, 2.5, 4, 0, 0, 7); c.ellipse(12, 1, 2.5, 4, 0, 0, 7); c.fill(); c.stroke();

  const helmed = ['murmillo', 'thraex', 'hoplomachus'].includes(L.helm);
  const hm = L.metal;
  if (!helmed) {
    c.fillStyle = L.hair;
    c.beginPath(); c.ellipse(0, -6, 13, 9, 0, Math.PI, 7); c.lineTo(11, -2); c.quadraticCurveTo(0, -9, -11, -2); c.closePath(); c.fill(); c.stroke();
    if (L.helm === 'dimachaerus') { for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(k * 5, -13); c.lineTo(k * 6.5, -22); c.lineTo(k * 5 + 4, -13); c.fill(); } }
    c.fillStyle = L.helm === 'retiarius' ? L.main : L.trim; c.fillRect(-12.5, -6.5, 25, 4); c.strokeRect(-12.5, -6.5, 25, 4); // headband
  }
  // eyes, brows, nose, mouth (looking toward the opponent: slight +x shift)
  c.fillStyle = '#fff'; c.strokeStyle = OUT; c.lineWidth = 1;
  c.beginPath(); c.ellipse(-4.5, -1, 3, 2.3, 0, 0, 7); c.ellipse(4.5, -1, 3, 2.3, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#1d1511'; c.beginPath(); c.arc(-3.6, -1, 1.5, 0, 7); c.arc(5.4, -1, 1.5, 0, 7); c.fill();
  c.strokeStyle = shade(L.hair, -10); c.lineWidth = 2; c.beginPath(); c.moveTo(-8, -5); c.lineTo(-2, -4); c.moveTo(2, -4); c.lineTo(8, -5.5); c.stroke();
  c.strokeStyle = shade(L.skin, -45); c.lineWidth = 1.5; c.beginPath(); c.moveTo(1, 0); c.lineTo(2.5, 5); c.lineTo(-0.5, 5.5); c.stroke();
  c.strokeStyle = s.stunned ? '#7a2a20' : '#6b3a2a'; c.lineWidth = 1.8; c.beginPath();
  if (s.stunned || s.flash > 0.3) c.ellipse(1, 8.8, 3, 2, 0, 0, 7); else { c.moveTo(-3.5, 8.5); c.lineTo(4.5, 8.2); }
  c.stroke();
  if (L.helm === 'brute') { // beard
    c.fillStyle = L.hair; c.beginPath(); c.moveTo(-11, 3); c.quadraticCurveTo(-12, 16, 0, 19); c.quadraticCurveTo(12, 16, 11, 3); c.quadraticCurveTo(0, 9, -11, 3); c.fill(); c.stroke();
    c.strokeStyle = '#a2452f'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(6, -9); c.lineTo(9, 0); c.stroke(); // scar
  }
  if (helmed) {
    c.strokeStyle = OUT; c.lineWidth = 2.5;
    c.fillStyle = flash ? '#fff' : hm;
    c.beginPath(); c.ellipse(0, -3, 14, 12, 0, Math.PI, 7); c.lineTo(14, 4); c.lineTo(10, 12); c.lineTo(7, 4); c.lineTo(-7, 4); c.lineTo(-10, 12); c.lineTo(-14, 4); c.closePath(); c.fill(); c.stroke(); // dome + cheek guards
    c.fillStyle = shade(hm, 35); c.beginPath(); c.ellipse(-4, -9, 6, 3, -0.5, 0, 7); c.fill(); // shine
    c.fillStyle = shade(hm, -30); c.fillRect(-13, -5, 26, 4); c.strokeRect(-13, -5, 26, 4); // brim
    if (L.helm === 'murmillo') { // grilled visor + tall fin crest
      c.strokeStyle = OUT; c.lineWidth = 1.5; c.fillStyle = shade(hm, -45);
      c.beginPath(); c.roundRect(-9, -2, 18, 11, 3); c.fill(); c.stroke();
      for (let k = -6; k <= 6; k += 4) { c.beginPath(); c.moveTo(k, -1); c.lineTo(k, 8); c.stroke(); }
      c.fillStyle = L.main; c.strokeStyle = OUT; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(-4, -14); c.quadraticCurveTo(-3, -34, 3, -34); c.quadraticCurveTo(7, -26, 4, -14); c.closePath(); c.fill(); c.stroke();
    } else if (L.helm === 'thraex') { // wide brim, visor, griffin crest
      c.fillStyle = shade(hm, -20); c.beginPath(); c.ellipse(0, -4, 18, 4, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = shade(hm, -45); c.beginPath(); c.roundRect(-8, -1, 16, 10, 3); c.fill(); c.stroke();
      c.strokeStyle = OUT; c.lineWidth = 1.5; for (let k = -4; k <= 4; k += 4) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, 8); c.stroke(); }
      c.fillStyle = L.trim; c.strokeStyle = OUT; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(-3, -14); c.quadraticCurveTo(-2, -32, 9, -30); c.lineTo(6, -25); c.lineTo(12, -22); c.quadraticCurveTo(3, -22, 3, -14); c.closePath(); c.fill(); c.stroke();
    } else { // hoplomachus: nose guard + horsehair plume
      c.fillStyle = shade(hm, -35); c.beginPath(); c.moveTo(-3, -3); c.lineTo(3, -3); c.lineTo(2.5, 9); c.lineTo(-2.5, 9); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = L.main; c.strokeStyle = OUT; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(-3, -14); c.quadraticCurveTo(-4, -34, -16, -26); c.quadraticCurveTo(-22, -16, -16, -2); c.lineTo(-10, -4); c.quadraticCurveTo(-12, -16, 3, -14); c.closePath(); c.fill(); c.stroke();
    }
  }
  for (const m of s.marks) if (m.zone === 'head') drawMark(c, m, m.o * 8, -7 + m.t * 15);
  if (s.tiers.head === 'disabled') brains(c);
  if (s.tiers.head !== 'ok' || (s.carried.head ?? 0) > 0) bandage(c, 0, -10, 0, 28);
  if (s.stunned) { c.fillStyle = '#ffe27a'; for (let i = 0; i < 3; i++) { const a = s.t * 6 + i * 2.1; c.beginPath(); c.arc(Math.cos(a) * 15, -24 + Math.sin(a) * 4, 2.8, 0, 7); c.fill(); } }
  c.restore();
}

// ---- main draw ---------------------------------------------------------------------------
/** Draws at local origin (feet center, floor y=0). Caller sets translate/scale for facing. Returns the weapon tip in local coords. */
export function drawFighter(c: CanvasRenderingContext2D, s: DrawState): Tip | null {
  const P = s.pose, L = s.look, sp = s.spec;
  const TH = 30, SH = 30, TORSO = 46, UA = 24, FA = 22, SHW = 20, HIPW = 9;
  const legH = (u: number, l: number) => TH * Math.cos(u * D2R) + SH * Math.cos(l * D2R);
  const frontDead = s.tiers.legL === 'disabled', backDead = s.tiers.legR === 'disabled';
  let fU = P.fU, fL = P.fL, bU = P.bU, bL = P.bL;
  if (frontDead) { fU = 8; fL = -20; }
  if (backDead) { bU = -8; bL = -30; }
  const hip = Math.max(legH(fU, fL), legH(bU, bL)) - P.drop - (frontDead && backDead ? 26 : 0);
  const hx = P.x, hy = -hip;
  const lean = P.lean * D2R;
  c.save();
  if (s.fall > 0) c.rotate(-s.fall * 82 * D2R);
  c.lineCap = 'round';
  const flash = s.flash > 0.4;
  const skinC = flash ? '#fff' : L.skin;
  const skinD = shade(L.skin, -26);

  // legs
  const drawLeg = (u: number, l: number, side: -1 | 1, zone: Zone, dead: boolean) => {
    const o: [number, number] = [hx + side * HIPW, hy];
    const sev = !!s.severed[zone];
    const k = pt(o[0], o[1], u, sev ? TH * 0.7 : TH), f = pt(k[0], k[1], l, SH);
    const col = side === 1 ? skinC : (flash ? '#fff' : skinD);
    stroke(c, sev ? [o, k] : [o, k, f], 11, col, side === 1 ? shade(L.skin, 18) : undefined);
    if (!sev && sp.armor[zone] >= 6) stroke(c, [pt(k[0], k[1], l, 3), pt(k[0], k[1], l, SH - 7)], 12, shade(L.metal, side === 1 ? 0 : -35)); // greave
    limbMarks(c, s, zone, o, k, f, sev || sp.armor[zone] >= 6 ? 0.45 : 1);
    if (!sev && !dead && hurtZone(s, zone)) bandage(c, (o[0] + k[0]) / 2, (o[1] + k[1]) / 2, u, 13);
    if (sev) { stump(c, k[0], k[1]); return; }
    if (dead) breakGore(c, k[0], k[1]);
    c.fillStyle = '#4a3322'; c.strokeStyle = OUT; c.lineWidth = 2;
    c.beginPath(); c.ellipse(f[0] + 3, f[1] - 1, 10, 5, 0, 0, 7); c.fill(); c.stroke(); // boot
    c.strokeStyle = '#6a4a30'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(f[0] - 4, f[1] - 4); c.lineTo(f[0] + 6, f[1] - 4); c.stroke();
  };
  drawLeg(bU, bL, -1, 'legR', backDead);
  drawLeg(fU, fL, 1, 'legL', frontDead);

  // torso frame
  const along: [number, number] = [Math.sin(lean), -Math.cos(lean)];
  const perp: [number, number] = [Math.cos(lean), Math.sin(lean)];
  const at = (a: number, p: number): [number, number] => [hx + along[0] * a + perp[0] * p, hy + along[1] * a + perp[1] * p];

  // skirt (pteruges) behind the torso
  c.save(); c.translate(hx, hy); c.rotate(lean);
  for (let k = -3; k <= 3; k++) {
    const x0 = k * 4.6;
    c.fillStyle = k % 2 ? shade(L.main, -12) : L.main; c.strokeStyle = OUT; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(x0 - 2.6, -2); c.lineTo(x0 + 2.6, -2); c.lineTo(x0 + 3.4 + k * 0.7, 19); c.lineTo(x0 - 3.4 + k * 0.7, 19); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = L.trim; c.fillRect(x0 - 2, 16, 4, 2.5);
  }
  c.restore();

  const drawArm = (isW: boolean) => {
    const u = isW ? P.wU : P.sU, l = isW ? P.wL : P.sL;
    const zone: Zone = isW ? 'armW' : 'armS';
    const dis = s.tiers[zone] === 'disabled';
    const uu = dis ? (isW ? 12 : -12) : u, ll = dis ? (isW ? 18 : -14) : l;
    const o = at(TORSO - 7, isW ? SHW : -SHW);
    const e = pt(o[0], o[1], uu, UA), h = pt(e[0], e[1], ll, FA);
    return { o, e, h, uu, ll, dis, zone };
  };
  const arms = { w: drawArm(true), s: drawArm(false) };

  // off arm (behind torso)
  const paintArm = (a: ReturnType<typeof drawArm>, _isW: boolean) => {
    const sev = !!s.severed[a.zone];
    stroke(c, sev ? [a.o, a.e] : [a.o, a.e, a.h], 10, skinC, shade(L.skin, 18));
    if (!sev && sp.armor[a.zone] >= 10) stroke(c, [pt(a.e[0], a.e[1], a.ll, 2), pt(a.e[0], a.e[1], a.ll, FA - 3)], 11, _isW ? L.metal : shade(L.metal, -30)); // bracer
    limbMarks(c, s, a.zone, a.o, a.e, a.h, sev || sp.armor[a.zone] >= 10 ? 0.45 : 1);
    if (!sev && !a.dis && hurtZone(s, a.zone)) bandage(c, (a.o[0] + a.e[0]) / 2, (a.o[1] + a.e[1]) / 2, a.uu, 12);
    if (sev) { stump(c, a.e[0], a.e[1]); return; }
    if (a.dis) breakGore(c, a.e[0], a.e[1]);
    c.fillStyle = skinC; c.beginPath(); c.arc(a.h[0], a.h[1], 4.8, 0, 7); c.fill(); // hand blends into the forearm, no outline ring
  };
  // torso
  c.save(); c.translate(hx, hy); c.rotate(lean);
  const bodyC = flash ? '#fff' : skinC;
  c.fillStyle = bodyC; c.strokeStyle = OUT; c.lineWidth = 2.5; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-11, 2); c.lineTo(11, 2); c.lineTo(SHW, -TORSO + 8); c.quadraticCurveTo(0, -TORSO + 1, -SHW, -TORSO + 8); c.closePath(); c.fill(); c.stroke();
  const plated = sp.armor.torso >= 15;
  if (plated) { // cuirass
    c.fillStyle = flash ? '#fff' : L.metal;
    c.beginPath(); c.moveTo(-10, -3); c.lineTo(10, -3); c.lineTo(SHW - 1, -TORSO + 9); c.quadraticCurveTo(0, -TORSO + 3, -SHW + 1, -TORSO + 9); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = shade(L.metal, 50); c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(0, -TORSO + 8); c.lineTo(0, -4); c.moveTo(-14, -TORSO + 16); c.quadraticCurveTo(-6, -TORSO + 22, -1, -TORSO + 17); c.moveTo(14, -TORSO + 16); c.quadraticCurveTo(6, -TORSO + 22, 1, -TORSO + 17); c.stroke();
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-8, -10 - k * 6); c.lineTo(8, -10 - k * 6); c.stroke(); }
    c.fillStyle = s.trimGold ? '#e8c35a' : L.trim; c.strokeStyle = OUT; c.lineWidth = 1.5; c.beginPath(); c.arc(0, -TORSO / 2 - 4, 3.5, 0, 7); c.fill(); c.stroke();
  } else { // bare chest with harness
    c.strokeStyle = shade(L.skin, -50); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(0, -TORSO + 8); c.lineTo(0, -6); for (let k = 0; k < 3; k++) { c.moveTo(-5, -12 - k * 6); c.lineTo(5, -12 - k * 6); } c.stroke();
    c.beginPath(); c.moveTo(-12, -TORSO + 14); c.quadraticCurveTo(-5, -TORSO + 22, 0, -TORSO + 17); c.moveTo(12, -TORSO + 14); c.quadraticCurveTo(5, -TORSO + 22, 0, -TORSO + 17); c.stroke();
    c.strokeStyle = '#3a2718'; c.lineWidth = 4; c.beginPath(); c.moveTo(-15, -TORSO + 10); c.lineTo(11, -4); c.moveTo(15, -TORSO + 10); c.lineTo(-11, -4); c.stroke();
    c.fillStyle = L.trim; c.strokeStyle = OUT; c.lineWidth = 1.5; c.beginPath(); c.arc(0, -TORSO / 2 - 2, 3, 0, 7); c.fill(); c.stroke();
  }
  c.fillStyle = s.trimGold ? '#e8c35a' : L.trim; c.strokeStyle = OUT; c.lineWidth = 1.8; // belt
  c.fillRect(-12, -4, 24, 6); c.strokeRect(-12, -4, 24, 6);
  c.fillStyle = L.metal; c.fillRect(-3, -4, 6, 6); c.strokeRect(-3, -4, 6, 6);
  if (!plated) for (const m of s.marks) if (m.zone === 'torso') drawMark(c, m, m.o * 13, -8 - m.t * 32);
  if (s.tiers.torso === 'disabled') guts(c);
  if (hurtZone(s, 'torso')) bandage(c, 0, -22, 0, 26);
  // shoulder pads (both sides)
  const pad = (x: number, big: boolean) => {
    c.fillStyle = sp.classId === 'brute' ? '#8a6a48' : L.metal; c.strokeStyle = OUT; c.lineWidth = 2;
    c.beginPath(); c.ellipse(x, -TORSO + 8, big ? 13 : 9, big ? 9 : 7, 0, 0, 7); c.fill(); c.stroke();
    if (sp.classId === 'brute') { c.strokeStyle = '#c9b89a'; c.lineWidth = 2; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + k * 3, -TORSO + 3); c.lineTo(x + k * 3 - 1, -TORSO + 12); c.stroke(); } }
  };
  if (plated || sp.classId === 'brute') { pad(SHW - 2, false); pad(-(SHW - 2), false); }
  if (sp.classId === 'retiarius') { // galerus: tall flared shoulder guard on the off side
    c.fillStyle = L.metal; c.strokeStyle = OUT; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(-SHW - 8, -TORSO + 14); c.quadraticCurveTo(-SHW - 6, -TORSO - 8, -SHW + 6, -TORSO - 4); c.lineTo(-SHW + 8, -TORSO + 10); c.closePath(); c.fill(); c.stroke();
  }
  c.restore();

  paintArm(arms.s, false); // off arm drawn over the torso so it is always visible
  // shield on the off hand, in front of the torso
  if (!arms.s.dis && sp.shield) drawShield(c, sp.shield.name, arms.s.h[0], arms.s.h[1], P.sL, L);
  if (s.netArm && !arms.s.dis) {
    const h = arms.s.h;
    c.strokeStyle = '#d8cdb0'; c.lineWidth = 1.5; c.fillStyle = 'rgba(216,205,176,.28)';
    c.beginPath(); c.arc(h[0] - 2, h[1] + 3, 11, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(h[0] - 12, h[1] + 3); c.lineTo(h[0] + 8, h[1] + 3); c.moveTo(h[0] - 2, h[1] - 7); c.lineTo(h[0] - 2, h[1] + 13); c.stroke();
  }

  // head
  const neck = at(TORSO + 1, 0);
  drawHead(c, s, neck[0] + 1, neck[1] - 8, P.head + P.lean * 0.5);

  // weapon arm (front-most)
  paintArm(arms.w, true);
  let tip: Tip | null = null;
  const w = arms.w;
  if (s.armed && !w.dis) {
    const ang = w.ll + (sp.weapon.name.includes('Spear') || sp.weapon.name.includes('Trident') ? 0 : -8);
    tip = drawWeapon(c, sp.weapon, w.h[0], w.h[1], ang, L);
    if (s.bloody && sp.weapon.edged) { // blood smeared along the last stretch of the blade
      const dx = tip.x - tip.hx, dy = tip.y - tip.hy, len = Math.hypot(dx, dy) || 1;
      c.strokeStyle = 'rgba(160,30,24,.85)'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(tip.x - (dx / len) * 20, tip.y - (dy / len) * 20); c.lineTo(tip.x, tip.y); c.stroke();
    }
    if (sp.weapon.dual && !arms.s.dis) drawWeapon(c, sp.weapon, arms.s.h[0], arms.s.h[1], P.sL - 6, L, true);
  }
  c.restore();
  if (s.fall > 0) return null;
  return tip;
}

export { drawWeapon };
