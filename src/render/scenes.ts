// Illustrated game scenes: the barracks yard, the coliseum gate, the shop and the training grounds.
// Everything is drawn in code at 960x540 so the UI feels like a game, not a form.
import { CLASSES } from '../data/classes';
import type { FighterSpec, InjuryTier, Zone } from '../sim/types';
import { injuryState } from './portrait';
import { IDLE, drawFighter, lookFor, pose, shade, type Look, type Pose } from './rig';

export const SW = 960, SH = 540;
export interface Spot { id: string; x: number; y: number; w: number; h: number }

const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const flame = (c: CanvasRenderingContext2D, x: number, y: number, t: number, k = 1) => {
  const f = 1 + 0.18 * Math.sin(t * 17 + x) + 0.1 * Math.sin(t * 29 + y);
  const g = c.createRadialGradient(x, y - 8 * k, 2, x, y - 8 * k, 46 * k);
  g.addColorStop(0, 'rgba(255,190,90,.55)'); g.addColorStop(1, 'rgba(255,120,40,0)');
  c.fillStyle = g; c.fillRect(x - 50 * k, y - 60 * k, 100 * k, 100 * k);
  c.fillStyle = '#ff7a1c'; c.beginPath(); c.moveTo(x - 6 * k, y); c.quadraticCurveTo(x - 9 * k, y - 16 * k * f, x, y - 26 * k * f); c.quadraticCurveTo(x + 9 * k, y - 16 * k * f, x + 6 * k, y); c.closePath(); c.fill();
  c.fillStyle = '#ffd35a'; c.beginPath(); c.moveTo(x - 3 * k, y); c.quadraticCurveTo(x - 4 * k, y - 9 * k * f, x, y - 14 * k * f); c.quadraticCurveTo(x + 4 * k, y - 9 * k * f, x + 3 * k, y); c.closePath(); c.fill();
};
const torch = (c: CanvasRenderingContext2D, x: number, y: number, t: number, k = 1) => {
  c.fillStyle = '#3a2718'; c.fillRect(x - 3 * k, y, 6 * k, 46 * k);
  c.fillStyle = '#5a4128'; c.fillRect(x - 6 * k, y - 4 * k, 12 * k, 8 * k);
  flame(c, x, y - 4 * k, t, k);
};

// ---- characters ----------------------------------------------------------------------------
export interface CharOpts {
  pose?: Pose; t?: number; flip?: boolean; look?: Look; armed?: boolean;
  injuries?: Partial<Record<Zone, InjuryTier>>; prosthetics?: Partial<Record<Zone, boolean>>; dim?: number;
}
/** Draw a fighter standing at (x, y) = feet. Used for the player in every scene and for NPCs. */
export function drawCharacter(c: CanvasRenderingContext2D, spec: FighterSpec, x: number, y: number, scale: number, o: CharOpts = {}) {
  const t = o.t ?? 0;
  const { tiers, severed, marks } = injuryState({ injuries: o.injuries, prosthetics: o.prosthetics });
  const breathe = Math.sin(t * 2.4) * 1.2;
  const p = o.pose ?? { ...IDLE, lean: 3, drop: breathe * 0.5, wL: IDLE.wL + Math.sin(t * 2.1) * 2 };
  c.fillStyle = 'rgba(20,8,4,.4)'; c.beginPath(); c.ellipse(x, y + 4, 34 * scale, 8 * scale, 0, 0, 7); c.fill();
  c.save(); c.translate(x, y); c.scale(o.flip ? -scale : scale, scale);
  drawFighter(c, {
    spec, look: o.look ?? lookFor(spec, 0), pose: p, tiers, carried: {}, armed: o.armed ?? true, flash: 0, fall: 0, stunned: false, snared: false, t,
    trimGold: spec.armor.torso > CLASSES[spec.classId].armor.torso + 3, netArm: spec.classId === 'retiarius' && (o.armed ?? true), severed, marks, bloody: false,
  });
  c.restore();
}

// ---- icons ---------------------------------------------------------------------------------
export type IconKind = 'sword' | 'shield' | 'armor' | 'hammer' | 'leg' | 'scroll' | 'tent' | 'hourglass' | 'flag' | 'help' | 'menu' | 'coin' | 'bolt'
  | 'str' | 'agi' | 'vit' | 'end' | 'tec' | 'skull' | 'trainer' | 'coliseum' | 'shop' | 'ground';
export function icon(c: CanvasRenderingContext2D, k: IconKind, x: number, y: number, s: number) {
  c.save(); c.translate(x, y); c.scale(s / 32, s / 32); c.lineCap = 'round'; c.lineJoin = 'round';
  const ln = 2.6, dark = '#1d1511';
  const stroke = (col: string, w = ln) => { c.strokeStyle = dark; c.lineWidth = w + 2; c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
  switch (k) {
    case 'sword': c.beginPath(); c.moveTo(-9, 11); c.lineTo(10, -10); stroke('#dfe5ea', 4); c.beginPath(); c.moveTo(-11, 5); c.lineTo(-3, 13); stroke('#d4af4a', 3); c.beginPath(); c.moveTo(-9, 11); c.lineTo(-13, 15); stroke('#7a4a22', 4); break;
    case 'shield': c.beginPath(); c.moveTo(0, -13); c.quadraticCurveTo(13, -10, 12, 2); c.quadraticCurveTo(10, 12, 0, 15); c.quadraticCurveTo(-10, 12, -12, 2); c.quadraticCurveTo(-13, -10, 0, -13); c.fillStyle = '#35598a'; c.fill(); stroke('#d4af4a', 2.4); c.beginPath(); c.arc(0, 1, 3.6, 0, 7); c.fillStyle = '#d4af4a'; c.fill(); break;
    case 'armor': c.beginPath(); c.moveTo(-8, -12); c.lineTo(8, -12); c.lineTo(13, -6); c.lineTo(9, 0); c.lineTo(9, 13); c.lineTo(-9, 13); c.lineTo(-9, 0); c.lineTo(-13, -6); c.closePath(); c.fillStyle = '#aab4bd'; c.fill(); stroke('#6e7780', 2); c.beginPath(); c.moveTo(0, -12); c.lineTo(0, 13); stroke('#6e7780', 1.5); break;
    case 'hammer': c.beginPath(); c.moveTo(-9, 12); c.lineTo(5, -4); stroke('#7a4a22', 4); c.beginPath(); c.roundRect(-1, -13, 15, 9, 2); c.fillStyle = '#9aa3ab'; c.fill(); stroke('#6e7780', 2); break;
    case 'leg': c.beginPath(); c.moveTo(-2, -13); c.lineTo(-2, 4); c.lineTo(5, 13); stroke('#a8754a', 5); c.beginPath(); c.moveTo(-6, -2); c.lineTo(2, -2); stroke('#c9a23a', 2); break;
    case 'scroll': c.beginPath(); c.roundRect(-10, -12, 20, 24, 4); c.fillStyle = '#e8dcc0'; c.fill(); stroke('#8a6a3a', 2); for (const yy of [-6, -1, 4]) { c.beginPath(); c.moveTo(-6, yy); c.lineTo(6, yy); stroke('#8a6a3a', 1.6); } break;
    case 'tent': c.beginPath(); c.moveTo(-14, 12); c.lineTo(0, -12); c.lineTo(14, 12); c.closePath(); c.fillStyle = '#b8895a'; c.fill(); stroke('#6b4a2e', 2); c.beginPath(); c.moveTo(0, -12); c.lineTo(-4, 12); c.lineTo(4, 12); c.closePath(); c.fillStyle = '#3a2718'; c.fill(); break;
    case 'hourglass': c.beginPath(); c.moveTo(-9, -12); c.lineTo(9, -12); c.lineTo(1, 0); c.lineTo(9, 12); c.lineTo(-9, 12); c.lineTo(-1, 0); c.closePath(); c.fillStyle = '#e8dcc0'; c.fill(); stroke('#8a6a3a', 2); c.fillStyle = '#d9a441'; c.fillRect(-4, 6, 8, 5); break;
    case 'flag': c.beginPath(); c.moveTo(-8, 14); c.lineTo(-8, -13); stroke('#7a4a22', 3); c.beginPath(); c.moveTo(-8, -12); c.lineTo(11, -8); c.lineTo(-8, -2); c.closePath(); c.fillStyle = '#e8e8e8'; c.fill(); stroke('#8a8a8a', 1.6); break;
    case 'help': c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fillStyle = '#3a6aa0'; c.fill(); stroke('#cfe0f4', 2); c.fillStyle = '#fff'; c.font = 'bold 18px system-ui'; c.textAlign = 'center'; c.fillText('?', 0, 6.5); break;
    case 'menu': for (const yy of [-8, 0, 8]) { c.beginPath(); c.moveTo(-10, yy); c.lineTo(10, yy); stroke('#e8dcc0', 3); } break;
    case 'coin': c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fillStyle = '#e8b64e'; c.fill(); stroke('#a8741c', 2); c.beginPath(); c.arc(0, 0, 6, 0, 7); stroke('#a8741c', 1.6); break;
    case 'bolt': c.beginPath(); c.moveTo(3, -13); c.lineTo(-8, 2); c.lineTo(-1, 2); c.lineTo(-4, 13); c.lineTo(9, -4); c.lineTo(2, -4); c.closePath(); c.fillStyle = '#ffd24a'; c.fill(); stroke('#a8741c', 1.8); break;
    case 'str': c.beginPath(); c.moveTo(-12, 0); c.lineTo(12, 0); stroke('#9aa3ab', 3); for (const xx of [-12, 12]) { c.beginPath(); c.roundRect(xx - 3, -9, 6, 18, 2); c.fillStyle = '#4a4f55'; c.fill(); stroke('#2a2d31', 1.6); } break;
    case 'agi': c.beginPath(); c.moveTo(-10, 8); c.lineTo(-10, -4); c.lineTo(0, -8); c.lineTo(8, 0); c.lineTo(13, 3); c.lineTo(13, 9); c.closePath(); c.fillStyle = '#8a5a30'; c.fill(); stroke('#4a3322', 2); for (const yy of [-12, -8]) { c.beginPath(); c.moveTo(-16, yy + 1); c.lineTo(-12, yy + 1); stroke('#cfd6dc', 2); } break;
    case 'vit': c.beginPath(); c.moveTo(0, 12); c.bezierCurveTo(-18, -2, -8, -14, 0, -5); c.bezierCurveTo(8, -14, 18, -2, 0, 12); c.fillStyle = '#d0483a'; c.fill(); stroke('#7a1c14', 2); break;
    case 'end': c.beginPath(); c.arc(-5, 0, 7, 0, 7); c.arc(5, 0, 7, 0, 7); c.fillStyle = '#e8a0a8'; c.fill(); stroke('#a45a68', 2); c.beginPath(); c.moveTo(0, -12); c.lineTo(0, -2); stroke('#cfd6dc', 2.4); break;
    case 'tec': c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fillStyle = '#f1e6d0'; c.fill(); stroke('#7a1c14', 2); c.beginPath(); c.arc(0, 0, 7, 0, 7); c.fillStyle = '#c4513a'; c.fill(); c.beginPath(); c.arc(0, 0, 2.6, 0, 7); c.fillStyle = '#f1e6d0'; c.fill(); break;
    case 'skull': c.beginPath(); c.arc(0, -3, 10, 0, 7); c.fillStyle = '#f1ead6'; c.fill(); stroke('#6a604c', 2); c.fillStyle = '#1d1511'; c.beginPath(); c.arc(-4, -3, 2.6, 0, 7); c.arc(4, -3, 2.6, 0, 7); c.fill(); break;
    case 'trainer': c.beginPath(); c.arc(0, -6, 6, 0, 7); c.fillStyle = '#d9a67a'; c.fill(); stroke('#6b4a2e', 1.6); c.beginPath(); c.moveTo(-9, 13); c.lineTo(-7, 2); c.lineTo(7, 2); c.lineTo(9, 13); c.closePath(); c.fillStyle = '#9a4636'; c.fill(); stroke('#4a1f18', 2); break;
    case 'coliseum': c.beginPath(); c.ellipse(0, 4, 14, 8, 0, 0, 7); c.fillStyle = '#c4a47a'; c.fill(); stroke('#6e523f', 2); for (const xx of [-8, -2, 4, 10]) { c.beginPath(); c.roundRect(xx - 2, 1, 4, 8, 2); c.fillStyle = '#1b1218'; c.fill(); } break;
    case 'shop': c.beginPath(); c.moveTo(-13, -4); c.lineTo(13, -4); c.lineTo(10, -12); c.lineTo(-10, -12); c.closePath(); c.fillStyle = '#c4513a'; c.fill(); stroke('#6a241a', 2); c.beginPath(); c.roundRect(-11, -4, 22, 16, 2); c.fillStyle = '#8a5a30'; c.fill(); stroke('#4a3322', 2); break;
    case 'ground': c.beginPath(); c.moveTo(-12, 12); c.lineTo(-12, -4); c.lineTo(12, -4); c.lineTo(12, 12); stroke('#8a5a30', 3); c.beginPath(); c.arc(0, -8, 6, 0, 7); c.fillStyle = '#d8b878'; c.fill(); stroke('#8a6a3a', 1.8); break;
  }
  c.restore();
}
export function iconCanvas(k: IconKind, size = 28): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = cv.height = size * 2; cv.style.width = cv.style.height = size + 'px';
  icon(cv.getContext('2d')!, k, size, size, size * 1.7);
  return cv;
}

/** Wooden sign with a label. `lit` brightens it (hover). */
function sign(c: CanvasRenderingContext2D, text: string, x: number, y: number, lit: boolean, ic?: IconKind) {
  c.font = 'bold 22px system-ui'; c.textAlign = 'center';
  const w = c.measureText(text).width + (ic ? 62 : 36), h = 36;
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,.35)'; rr(c, -w / 2 + 3, -h / 2 + 5, w, h, 8); c.fill();
  c.fillStyle = lit ? '#b98a4e' : '#7a5632'; c.strokeStyle = '#1d1511'; c.lineWidth = 3; rr(c, -w / 2, -h / 2, w, h, 8); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,225,170,.25)'; c.lineWidth = 1.5; rr(c, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 5); c.stroke();
  if (ic) icon(c, ic, -w / 2 + 25, 0, 28);
  c.fillStyle = lit ? '#fff6d8' : '#f1e6d0'; c.strokeStyle = '#2a1a0c'; c.lineWidth = 4; c.lineJoin = 'round';
  const tx = ic ? 14 : 0; c.strokeText(text, tx, 8); c.fillText(text, tx, 8);
  c.restore();
}
function badge(c: CanvasRenderingContext2D, x: number, y: number, n: string, t: number) {
  const pulse = 1 + 0.08 * Math.sin(t * 6);
  c.save(); c.translate(x, y); c.scale(pulse, pulse);
  c.fillStyle = '#d02a22'; c.strokeStyle = '#2a0504'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 14, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#fff'; c.font = 'bold 16px system-ui'; c.textAlign = 'center'; c.fillText(n, 0, 6);
  c.restore();
}

// ---- barracks yard (hub) ---------------------------------------------------------------------
export const YARD_SPOTS: Spot[] = [
  { id: 'coliseum', x: 250, y: 100, w: 460, h: 240 },
  { id: 'shop', x: 12, y: 200, w: 262, h: 260 },
  { id: 'training', x: 686, y: 200, w: 262, h: 260 },
  { id: 'rest', x: 290, y: 392, w: 128, h: 120 },
  { id: 'skills', x: 546, y: 392, w: 128, h: 120 },
];
export function drawYard(c: CanvasRenderingContext2D, t: number, hover: string | null, badges: Record<string, string | undefined> = {}) {
  const sky = c.createLinearGradient(0, 0, 0, 330);
  sky.addColorStop(0, '#2b2142'); sky.addColorStop(0.5, '#7a4a5c'); sky.addColorStop(1, '#e09a5c');
  c.fillStyle = sky; c.fillRect(0, 0, SW, 340);
  const sun = c.createRadialGradient(480, 250, 10, 480, 250, 380);
  sun.addColorStop(0, 'rgba(255,214,140,.55)'); sun.addColorStop(1, 'rgba(255,214,140,0)');
  c.fillStyle = sun; c.fillRect(0, 0, SW, 340);

  // the Coliseum rising behind the yard
  const lit = hover === 'coliseum';
  for (let k = 0; k < 3; k++) {
    const x0 = 270 + k * 34, w = 420 - k * 68, y0 = 300 - (k + 1) * 66, h = 66;
    c.fillStyle = shade('#a58466', -k * 14 + (lit ? 14 : 0)); c.strokeStyle = '#1d1511'; c.lineWidth = 3; c.beginPath(); c.rect(x0, y0, w, h); c.fill(); c.stroke();
    const n = 10 - k * 2; const aw = w / n;
    for (let i = 0; i < n; i++) { c.fillStyle = '#1b1218'; c.beginPath(); c.moveTo(x0 + i * aw + 7, y0 + h); c.lineTo(x0 + i * aw + 7, y0 + h - 30); c.arc(x0 + i * aw + aw / 2, y0 + h - 30, aw / 2 - 7, Math.PI, 0); c.lineTo(x0 + i * aw + aw - 7, y0 + h); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x0, y0 + h - 5, w, 5);
  }
  for (const [bx, col] of [[330, '#9a3b30'], [480, '#d4af4a'], [630, '#2f4d7a']] as [number, string][]) {
    const sway = Math.sin(t * 1.6 + bx) * 4;
    c.fillStyle = col; c.strokeStyle = '#1d1511'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx, 70); c.lineTo(bx + 22, 70); c.lineTo(bx + 22 + sway, 118); c.lineTo(bx + 11 + sway, 108); c.lineTo(bx + sway, 118); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#3a2718'; c.lineWidth = 3; c.beginPath(); c.moveTo(bx - 2, 66); c.lineTo(bx + 24, 66); c.stroke();
  }

  // cobbled yard
  const gr = c.createLinearGradient(0, 330, 0, SH);
  gr.addColorStop(0, '#9a7a58'); gr.addColorStop(1, '#6e5238');
  c.fillStyle = gr; c.fillRect(0, 330, SW, SH - 330);
  c.strokeStyle = 'rgba(40,24,12,.28)'; c.lineWidth = 1.5;
  for (let r = 0; r < 9; r++) { const y = 340 + r * r * 3 + r * 10; c.beginPath(); c.moveTo(0, y); c.lineTo(SW, y); c.stroke(); for (let x = (r % 2) * 30; x < SW; x += 60 + r * 6) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + (x - 480) * 0.06, y + 18 + r * 2); c.stroke(); } }

  // shop stall
  const sl = hover === 'shop';
  c.save(); c.translate(0, sl ? -3 : 0);
  c.fillStyle = '#5a3f28'; c.fillRect(40, 270, 10, 190); c.fillRect(250, 270, 10, 190);
  c.fillStyle = '#3a2a1c'; c.fillRect(50, 300, 200, 130);
  c.fillStyle = '#7a5632'; c.fillRect(30, 400, 240, 60); c.strokeStyle = '#1d1511'; c.lineWidth = 3; c.strokeRect(30, 400, 240, 60);
  c.strokeStyle = 'rgba(255,225,170,.18)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(30, 412 + i * 9); c.lineTo(270, 412 + i * 9); c.stroke(); }
  for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f1e6d0' : sl ? '#e0604a' : '#c4513a'; c.beginPath(); c.moveTo(20 + i * 32, 240); c.lineTo(52 + i * 32, 240); c.lineTo(52 + i * 32, 268); c.arc(36 + i * 32, 268, 16, 0, Math.PI); c.closePath(); c.fill(); c.strokeStyle = '#1d1511'; c.lineWidth = 2; c.stroke(); }
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(20, 232, 256, 10);
  icon(c, 'sword', 80, 345, 52); icon(c, 'shield', 150, 345, 54); icon(c, 'armor', 218, 345, 52); icon(c, 'hammer', 245, 425, 38);
  torch(c, 22, 262, t, 0.8);
  c.restore();

  // training grounds gate
  const tl = hover === 'training';
  c.save(); c.translate(0, tl ? -3 : 0);
  c.fillStyle = '#6b4a2e'; for (let i = 0; i < 7; i++) { c.fillRect(700 + i * 36, 330, 12, 110); c.fillStyle = '#5a3f28'; }
  c.fillStyle = '#8a5a30'; c.fillRect(694, 350, 250, 10); c.fillRect(694, 392, 250, 10);
  c.fillStyle = '#d8b878'; c.fillRect(700, 440, 244, 24);
  // straw dummy
  c.strokeStyle = '#1d1511'; c.lineWidth = 3; c.fillStyle = '#6b4a2e'; c.fillRect(805, 300, 10, 150);
  c.fillStyle = '#d8b878'; c.beginPath(); c.ellipse(810, 340, 26, 34, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(810, 290, 14, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(780, 330); c.lineTo(840, 330); c.stroke();
  icon(c, 'str', 880, 420, 40);
  c.fillStyle = tl ? '#e0604a' : '#c4513a'; c.beginPath(); c.moveTo(724, 250); c.lineTo(724, 330); c.lineTo(738, 322); c.lineTo(752, 330); c.lineTo(752, 250); c.closePath(); c.fill(); c.strokeStyle = '#1d1511'; c.lineWidth = 2; c.stroke();
  torch(c, 934, 280, t, 0.8);
  c.restore();

  // bedroll tent and the scroll lectern (rest and skills)
  const rl = hover === 'rest', kl = hover === 'skills';
  c.save(); c.translate(354, 486 + (rl ? -3 : 0));
  c.fillStyle = rl ? '#d6a672' : '#b8895a'; c.strokeStyle = '#1d1511'; c.lineWidth = 3; c.beginPath(); c.moveTo(-58, 0); c.lineTo(0, -92); c.lineTo(58, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#2a1a0c'; c.beginPath(); c.moveTo(0, -92); c.lineTo(-18, 0); c.lineTo(18, 0); c.closePath(); c.fill();
  c.strokeStyle = '#6b4a2e'; c.beginPath(); c.moveTo(0, -92); c.lineTo(0, -108); c.stroke(); c.restore();
  c.save(); c.translate(610, 486 + (kl ? -3 : 0));
  c.fillStyle = '#6b4a2e'; c.strokeStyle = '#1d1511'; c.lineWidth = 3; c.fillRect(-6, -60, 12, 60); c.strokeRect(-6, -60, 12, 60);
  c.beginPath(); c.moveTo(-40, -58); c.lineTo(40, -58); c.lineTo(30, -86); c.lineTo(-30, -86); c.closePath(); c.fillStyle = kl ? '#a8744a' : '#8a5a30'; c.fill(); c.stroke();
  c.fillStyle = '#efe3c4'; c.beginPath(); c.moveTo(-26, -84); c.lineTo(0, -80); c.lineTo(26, -84); c.lineTo(22, -62); c.lineTo(0, -58); c.lineTo(-22, -62); c.closePath(); c.fill(); c.stroke();
  const glow = c.createRadialGradient(0, -74, 2, 0, -74, 40); glow.addColorStop(0, `rgba(255,220,120,${0.35 + 0.15 * Math.sin(t * 3)})`); glow.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = glow; c.fillRect(-45, -120, 90, 90);
  c.restore();

  torch(c, 236, 296, t, 1); torch(c, 724, 296, t, 1);

  // signs and badges
  sign(c, 'COLISEUM', 480, 96, hover === 'coliseum', 'coliseum');
  sign(c, 'SHOP', 150, 484, sl, 'shop');
  sign(c, 'TRAINING', 818, 484, tl, 'ground');
  sign(c, 'REST', 354, 512, rl, 'tent');
  sign(c, 'SKILLS', 610, 512, kl, 'scroll');
  for (const [id, x, y] of [['coliseum', 640, 110], ['skills', 650, 410], ['shop', 258, 232], ['training', 912, 232], ['rest', 410, 410]] as [string, number, number][]) if (badges[id]) badge(c, x, y, badges[id]!, t);

  // drifting dust in the evening light
  for (let i = 0; i < 18; i++) { const x = ((i * 137 + t * 14) % (SW + 40)) - 20, y = 360 + ((i * 71) % 150) + Math.sin(t + i) * 6; c.fillStyle = 'rgba(255,225,170,.18)'; c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); }
}

// ---- coliseum gate (fight board backdrop) -----------------------------------------------------
export function drawGate(c: CanvasRenderingContext2D, t: number, dark = 0) {
  const sky = c.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, '#2b2142'); sky.addColorStop(1, '#c46a4a');
  c.fillStyle = sky; c.fillRect(0, 0, SW, SH);
  c.fillStyle = '#8a6b52'; c.fillRect(0, 60, SW, 210); c.fillStyle = '#a58466'; c.fillRect(0, 56, SW, 8);
  for (let x = 20; x < SW; x += 80) { c.fillStyle = '#1b1218'; c.beginPath(); c.moveTo(x, 270); c.lineTo(x, 130); c.arc(x + 30, 130, 30, Math.PI, 0); c.lineTo(x + 60, 270); c.fill(); }
  // crowd peeking over the wall
  for (let i = 0; i < 40; i++) { const x = i * 25 + 8, y = 250 + Math.sin(t * 2 + i) * 2; c.fillStyle = ['#b8412f', '#d8c9a6', '#3f6aa0', '#c9a23a', '#6a8f4f'][i % 5]; c.fillRect(x - 7, y, 14, 24); c.fillStyle = '#e3b78f'; c.beginPath(); c.arc(x, y - 6, 7, 0, 7); c.fill(); }
  c.fillStyle = '#5a4130'; c.fillRect(0, 262, SW, 24);
  // great gate
  c.fillStyle = '#17110e'; c.beginPath(); c.moveTo(380, 330); c.lineTo(380, 190); c.arc(480, 190, 100, Math.PI, 0); c.lineTo(580, 330); c.closePath(); c.fill();
  c.strokeStyle = '#6e523f'; c.lineWidth = 8; c.stroke();
  c.strokeStyle = '#3a2a1c'; c.lineWidth = 4; for (let x = 400; x <= 560; x += 20) { c.beginPath(); c.moveTo(x, 330); c.lineTo(x, 150 + Math.abs(x - 480) * 0.2); c.stroke(); }
  torch(c, 350, 232, t, 1.1); torch(c, 610, 232, t, 1.1);
  const gr = c.createLinearGradient(0, 330, 0, SH); gr.addColorStop(0, '#d8b878'); gr.addColorStop(1, '#a8794a');
  c.fillStyle = gr; c.fillRect(0, 330, SW, SH - 330);
  c.strokeStyle = 'rgba(110,75,40,.2)'; c.lineWidth = 1.5; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 350 + i * 26); c.lineTo(SW, 350 + i * 26); c.stroke(); }
  if (dark > 0) { c.fillStyle = `rgba(30,0,8,${0.5 * dark})`; c.fillRect(0, 0, SW, SH); }
}

// ---- shop interior ----------------------------------------------------------------------------
export function drawShopScene(c: CanvasRenderingContext2D, t: number, mid?: () => void) {
  c.fillStyle = '#3a2a1c'; c.fillRect(0, 0, SW, SH);
  for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#43301f' : '#3a2a1c'; c.fillRect(i * 60, 0, 60, 330); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(i * 60 + 58, 0, 2, 330); }
  const warm = c.createRadialGradient(480, 150, 20, 480, 150, 520); warm.addColorStop(0, 'rgba(255,190,110,.28)'); warm.addColorStop(1, 'rgba(0,0,0,.35)'); c.fillStyle = warm; c.fillRect(0, 0, SW, SH);
  // shelves with wares
  for (const sy of [118, 232]) { c.fillStyle = '#6b4a2e'; c.strokeStyle = '#1d1511'; c.lineWidth = 3; c.fillRect(40, sy, 880, 12); c.strokeRect(40, sy, 880, 12); }
  const row1: IconKind[] = ['sword', 'shield', 'armor', 'hammer', 'sword', 'shield', 'armor', 'leg', 'sword', 'shield'];
  const row2: IconKind[] = ['armor', 'sword', 'hammer', 'shield', 'leg', 'armor', 'sword', 'shield', 'hammer', 'armor'];
  row1.forEach((k, i) => icon(c, k, 110 + i * 82, 92, 54)); row2.forEach((k, i) => icon(c, k, 110 + i * 82, 206, 54));
  torch(c, 22, 150, t, 1); torch(c, 938, 150, t, 1);
  mid?.(); // the shopkeeper stands here, behind the counter
  // counter
  c.fillStyle = '#7a5632'; c.fillRect(0, 392, SW, 148); c.strokeStyle = '#1d1511'; c.lineWidth = 4; c.strokeRect(0, 392, SW, 148);
  c.fillStyle = '#8a6238'; c.fillRect(0, 380, SW, 22); c.strokeRect(0, 380, SW, 22);
  c.strokeStyle = 'rgba(255,225,170,.15)'; c.lineWidth = 1.5; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(0, 412 + i * 16); c.lineTo(SW, 412 + i * 16); c.stroke(); }
  // anvil on the counter
  c.fillStyle = '#4a4f55'; c.strokeStyle = '#1d1511'; c.lineWidth = 3; c.beginPath(); c.moveTo(780, 380); c.lineTo(900, 380); c.lineTo(880, 360); c.lineTo(810, 360); c.closePath(); c.fill(); c.stroke();
}

/** Speech bubble above (x, y). */
export function speech(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW = 300) {
  c.font = '600 17px system-ui'; c.textAlign = 'left';
  const words = text.split(' '); const lines: string[] = []; let cur = '';
  for (const w of words) { const nx = cur ? cur + ' ' + w : w; if (c.measureText(nx).width > maxW) { lines.push(cur); cur = w; } else cur = nx; }
  lines.push(cur);
  const w = Math.min(maxW, Math.max(...lines.map((l) => c.measureText(l).width))) + 28, h = lines.length * 22 + 20;
  c.save(); c.translate(x, y);
  c.fillStyle = '#f6ecd4'; c.strokeStyle = '#1d1511'; c.lineWidth = 3; rr(c, 0, -h, w, h, 12); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(24, 0); c.lineTo(14, 18); c.lineTo(44, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#f6ecd4'; c.fillRect(25, -3, 18, 6);
  c.fillStyle = '#2a1a0c'; lines.forEach((l, i) => c.fillText(l, 14, -h + 29 + i * 22));
  c.restore();
}

// ---- training grounds -------------------------------------------------------------------------
export type StatKey = 'str' | 'agi' | 'vit' | 'end' | 'tec';
export const STATIONS: { id: StatKey; x: number; label: string; what: string }[] = [
  { id: 'str', x: 110, label: 'WEIGHTS', what: 'Lift weights' },
  { id: 'agi', x: 290, label: 'TRACK', what: 'Sprint laps' },
  { id: 'vit', x: 480, label: 'LOGS', what: 'Carry logs' },
  { id: 'end', x: 670, label: 'ROPES', what: 'Skip rope' },
  { id: 'tec', x: 850, label: 'DUMMY', what: 'Sword forms' },
];
export const GROUND_SPOTS: Spot[] = [
  ...STATIONS.map((s) => ({ id: s.id as string, x: s.x - 86, y: 200, w: 172, h: 250 })),
  { id: 'trainer', x: 335, y: 385, w: 100, h: 160 },
];

/** One training station, centered at x with its feet on y. Drawn small for the yard, large for the exercise backdrop. */
export function stationProp(c: CanvasRenderingContext2D, k: StatKey, x: number, y: number, s: number, t: number, hot: boolean) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round'; c.lineCap = 'round';
  const dk = '#1d1511';
  const glow = hot ? 1 : 0;
  if (glow) { c.fillStyle = 'rgba(255,225,150,.16)'; c.beginPath(); c.ellipse(0, -60, 96, 120, 0, 0, 7); c.fill(); }
  switch (k) {
    case 'str': {
      c.fillStyle = '#5a3f28'; c.strokeStyle = dk; c.lineWidth = 3; c.fillRect(-60, -90, 10, 90); c.strokeRect(-60, -90, 10, 90); c.fillRect(50, -90, 10, 90); c.strokeRect(50, -90, 10, 90);
      c.strokeStyle = dk; c.lineWidth = 9; c.beginPath(); c.moveTo(-84, -96); c.lineTo(84, -96); c.stroke(); c.strokeStyle = '#9aa3ab'; c.lineWidth = 5; c.beginPath(); c.moveTo(-84, -96); c.lineTo(84, -96); c.stroke();
      for (const xx of [-78, -64, 64, 78]) { c.fillStyle = '#3d4248'; c.strokeStyle = dk; c.lineWidth = 2.5; c.beginPath(); c.roundRect(xx - 5, -118, 10, 44, 3); c.fill(); c.stroke(); }
      c.fillStyle = '#4a4f55'; c.strokeStyle = dk; c.lineWidth = 3; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(-30 + i * 6, -8 - i * 9, 22, 8, 0, 0, 7); c.fill(); c.stroke(); }
      break;
    }
    case 'agi': {
      c.fillStyle = '#b8895a'; c.strokeStyle = dk; c.lineWidth = 3; c.beginPath(); c.moveTo(-90, 0); c.lineTo(90, 0); c.lineTo(70, -34); c.lineTo(-70, -34); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#f1e6d0'; c.lineWidth = 3; for (const l of [-0.33, 0.33]) { c.beginPath(); c.moveTo(-80 + l * 20, -3); c.lineTo(-60 + l * 20, -31); c.moveTo(80 + l * -20, -3); c.lineTo(60 + l * -20, -31); c.stroke(); }
      for (const xx of [-40, 0, 40]) { c.strokeStyle = dk; c.lineWidth = 3.5; c.beginPath(); c.moveTo(xx - 12, -2); c.lineTo(xx - 12, -36); c.lineTo(xx + 12, -36); c.lineTo(xx + 12, -2); c.stroke(); c.strokeStyle = '#d4af4a'; c.lineWidth = 2; c.beginPath(); c.moveTo(xx - 12, -2); c.lineTo(xx - 12, -36); c.lineTo(xx + 12, -36); c.lineTo(xx + 12, -2); c.stroke(); }
      c.fillStyle = '#c4513a'; for (const xx of [-72, 72]) { c.beginPath(); c.moveTo(xx - 8, -8); c.lineTo(xx, -34); c.lineTo(xx + 8, -8); c.closePath(); c.fill(); c.strokeStyle = dk; c.lineWidth = 2; c.stroke(); }
      break;
    }
    case 'vit': {
      c.fillStyle = '#7a4a22'; c.strokeStyle = dk; c.lineWidth = 3;
      for (const [lx, ly, lw] of [[-70, -14, 120], [-58, -38, 110], [-40, -62, 96]] as [number, number, number][]) { c.beginPath(); c.roundRect(lx, ly, lw, 26, 13); c.fill(); c.stroke(); c.fillStyle = '#c9a56a'; c.beginPath(); c.ellipse(lx + lw - 2, ly + 13, 7, 12, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#7a4a22'; }
      c.fillStyle = '#8a8f96'; c.beginPath(); c.arc(72, -14, 14, 0, 7); c.fill(); c.stroke();
      break;
    }
    case 'end': {
      c.fillStyle = '#5a3f28'; c.strokeStyle = dk; c.lineWidth = 3; c.fillRect(-70, -112, 10, 112); c.strokeRect(-70, -112, 10, 112); c.fillRect(60, -112, 10, 112); c.strokeRect(60, -112, 10, 112);
      const sway = Math.sin(t * 2) * 6;
      c.strokeStyle = dk; c.lineWidth = 7; c.beginPath(); c.moveTo(-62, -100); c.quadraticCurveTo(0, -20 + sway, 62, -100); c.stroke();
      c.strokeStyle = '#e8dcc0'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(-62, -100); c.quadraticCurveTo(0, -20 + sway, 62, -100); c.stroke();
      c.strokeStyle = dk; c.lineWidth = 3; c.fillStyle = '#d4af4a'; for (const xx of [-34, 34]) { c.beginPath(); c.arc(xx, -98, 14, 0, 7); c.stroke(); }
      break;
    }
    case 'tec': {
      c.fillStyle = '#6b4a2e'; c.strokeStyle = dk; c.lineWidth = 3; c.fillRect(-6, -130, 12, 130); c.strokeRect(-6, -130, 12, 130);
      c.fillStyle = '#d8b878'; c.beginPath(); c.ellipse(0, -82, 30, 38, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(0, -134, 16, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-46, -92); c.lineTo(46, -92); c.stroke();
      c.strokeStyle = '#b89a5a'; c.lineWidth = 1.6; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 10, -112); c.lineTo(i * 10 + 3, -50); c.stroke(); }
      c.fillStyle = '#f1e6d0'; c.beginPath(); c.arc(72, -72, 22, 0, 7); c.fill(); c.strokeStyle = dk; c.stroke(); c.fillStyle = '#c4513a'; c.beginPath(); c.arc(72, -72, 13, 0, 7); c.fill(); c.fillStyle = '#f1e6d0'; c.beginPath(); c.arc(72, -72, 5, 0, 7); c.fill();
      break;
    }
  }
  c.restore();
}

export function drawGrounds(c: CanvasRenderingContext2D, t: number, hover: string | null, canTrain: boolean, vals: Record<StatKey, number>) {
  const sky = c.createLinearGradient(0, 0, 0, 240); sky.addColorStop(0, '#3a3a6a'); sky.addColorStop(1, '#e8a868'); c.fillStyle = sky; c.fillRect(0, 0, SW, SH);
  c.fillStyle = '#5a4130'; c.fillRect(0, 150, SW, 60); c.fillStyle = '#7a5a40'; c.fillRect(0, 144, SW, 8);
  for (let x = 10; x < SW; x += 60) { c.fillStyle = '#2a1a14'; c.beginPath(); c.moveTo(x, 210); c.lineTo(x, 168); c.arc(x + 20, 168, 20, Math.PI, 0); c.lineTo(x + 40, 210); c.fill(); }
  const sand = c.createLinearGradient(0, 210, 0, SH); sand.addColorStop(0, '#d8b878'); sand.addColorStop(1, '#a8794a'); c.fillStyle = sand; c.fillRect(0, 210, SW, SH - 210);
  c.strokeStyle = 'rgba(110,75,40,.18)'; c.lineWidth = 1.5; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(0, 240 + i * 36); c.lineTo(SW, 240 + i * 36); c.stroke(); }
  for (const st of STATIONS) {
    const hot = hover === st.id && canTrain;
    c.save(); c.translate(0, hot ? -4 : 0);
    stationProp(c, st.id, st.x, 400, 1, t, hot);
    c.restore();
    c.globalAlpha = canTrain ? 1 : 0.55;
    sign(c, st.label, st.x, 440, hot, st.id);
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(20,10,5,.75)'; rr(c, st.x - 34, 462, 68, 30, 8); c.fill();
    icon(c, st.id, st.x - 16, 477, 22); c.fillStyle = '#ffe9a8'; c.font = 'bold 18px system-ui'; c.textAlign = 'left'; c.fillText(String(vals[st.id]), st.x - 2, 484);
  }
  torch(c, 20, 220, t, 1); torch(c, 940, 220, t, 1);
}

/** The master trainer NPC (arms folded). */
export function trainerSpec(): FighterSpec {
  const base = CLASSES.brute;
  return {
    name: 'Master Trainer', classId: 'brute', level: 5, stats: { ...base.base }, weapon: { name: 'Bare Hands', dmg: 3, reach: 3.6, speed: 0.9, edged: false }, armor: { head: 0, torso: 0, armW: 0, armS: 0, legL: 0, legR: 0 },
    personality: 'balanced',
  };
}
export const TRAINER_POSE: Pose = pose({ lean: 0, wU: 52, wL: 128, sU: 52, sL: 128, fU: 12, fL: 3, bU: -12, bL: -3 });
export const SHOPKEEPER_LOOK = (spec: FighterSpec): Look => ({ ...lookFor(spec, 0), skin: '#d9a67a', hair: '#8a8a8a', main: '#6b4a2e', trim: '#c9a23a', metal: '#8a8f96', cloth: '#c4513a', helm: 'retiarius' });
export function shopkeeperSpec(): FighterSpec {
  return { ...trainerSpec(), name: 'Shopkeeper', classId: 'retiarius', stats: { ...CLASSES.retiarius.base } };
}
