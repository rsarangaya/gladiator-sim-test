// A very brief, unique training animation for each stat. The character performs it in front of the right station.
import { ACTIONS } from '../data/actions';
import type { FighterSpec, InjuryTier, Zone } from '../sim/types';
import { poseFor } from './anim';
import { IDLE, lerp, pose, type Pose } from './rig';
import { SW, SH, drawCharacter, icon, stationProp, type StatKey } from './scenes';

export const EXERCISE_MS = 1900;
const D2R = Math.PI / 180;
const ease = (p: number) => Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.12); // quick ramp in and out

interface Inj { injuries?: Partial<Record<Zone, InjuryTier>>; prosthetics?: Partial<Record<Zone, boolean>> }

function backdrop(c: CanvasRenderingContext2D, t: number, scroll = 0) {
  const sky = c.createLinearGradient(0, 0, 0, 260); sky.addColorStop(0, '#3a3a6a'); sky.addColorStop(1, '#e8a868'); c.fillStyle = sky; c.fillRect(0, 0, SW, SH);
  c.fillStyle = '#5a4130'; c.fillRect(0, 150, SW, 70);
  for (let x = 10; x < SW; x += 60) { c.fillStyle = '#2a1a14'; c.beginPath(); c.moveTo(x, 220); c.lineTo(x, 178); c.arc(x + 20, 178, 20, Math.PI, 0); c.lineTo(x + 40, 220); c.fill(); }
  const sand = c.createLinearGradient(0, 220, 0, SH); sand.addColorStop(0, '#d8b878'); sand.addColorStop(1, '#a8794a'); c.fillStyle = sand; c.fillRect(0, 220, SW, SH - 220);
  c.strokeStyle = 'rgba(110,75,40,.2)'; c.lineWidth = 2;
  for (let i = 0; i < 12; i++) { const x = ((i * 120 - scroll) % (SW + 120) + SW + 120) % (SW + 120) - 60; c.beginPath(); c.moveTo(x, 232); c.lineTo(x - 70, SH); c.stroke(); }
  void t;
}

const CX = 440, CY = 478, SC = 2.3;

export function drawExercise(c: CanvasRenderingContext2D, stat: StatKey, p: number, t: number, fullSpec: FighterSpec, inj: Inj = {}) {
  const spec: FighterSpec = { ...fullSpec, shield: undefined }; // no shield strapped on while training
  const e = ease(p);
  const opts = { t, injuries: inj.injuries, prosthetics: inj.prosthetics, armed: false };
  switch (stat) {
    case 'str': { // overhead press, three reps
      backdrop(c, t);
      stationProp(c, 'str', 760, 470, 1.5, t, false);
      const u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * 3 * p);
      const a = lerp(30, 176, u) * e + 30 * (1 - e);
      const drop = (1 - u) * 8;
      const pz = pose({ lean: 0, drop, wU: a, wL: a, sU: a, sL: a, fU: 22, fL: 4, bU: -22, bL: -4, head: 0 });
      drawCharacter(c, spec, CX, CY, SC, { ...opts, pose: pz });
      c.save(); c.translate(CX, CY); c.scale(SC, SC);
      const hip = 30 * Math.cos(22 * D2R) + 30 * Math.cos(4 * D2R) - drop, sy = -hip - 39;
      const bx = 46 * Math.sin(a * D2R) + 2, by = sy + 46 * Math.cos(a * D2R);
      c.strokeStyle = '#1d1511'; c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.moveTo(bx - 66, by); c.lineTo(bx + 66, by); c.stroke();
      c.strokeStyle = '#cfd6dc'; c.lineWidth = 4.5; c.beginPath(); c.moveTo(bx - 66, by); c.lineTo(bx + 66, by); c.stroke();
      for (const sx of [-52, -42, 42, 52]) { c.fillStyle = '#3d4248'; c.strokeStyle = '#1d1511'; c.lineWidth = 2.5; c.beginPath(); c.roundRect(bx + sx - 4, by - 20, 8, 40, 3); c.fill(); c.stroke(); }
      c.restore();
      if (u > 0.92) for (let i = 0; i < 3; i++) { c.fillStyle = 'rgba(200,230,255,.7)'; c.beginPath(); c.arc(CX - 30 + i * 12, CY - 330 + Math.sin(t * 9 + i) * 3, 3, 0, 7); c.fill(); }
      break;
    }
    case 'strL': { // off-arm curls with a dumbbell, three reps
      backdrop(c, t);
      stationProp(c, 'strL', 760, 470, 1.6, t, false);
      const u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * 3 * p);
      const fl = 18 + 150 * u * e;
      const pz = pose({ lean: 1, drop: 0, wU: 14, wL: 20, sU: 12, sL: fl, fU: 20, fL: 4, bU: -20, bL: -4, head: -2 * u });
      drawCharacter(c, spec, CX, CY, SC, { ...opts, pose: pz });
      c.save(); c.translate(CX, CY); c.scale(SC, SC);
      const hip = 30 * Math.cos(20 * D2R) + 30 * Math.cos(4 * D2R), sy = -hip - 39;
      const hx = -13 + 23 * Math.sin(12 * D2R) + 23 * Math.sin(fl * D2R), hy = sy + 23 * Math.cos(12 * D2R) + 23 * Math.cos(fl * D2R);
      c.strokeStyle = '#1d1511'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(hx - 9, hy); c.lineTo(hx + 9, hy); c.stroke();
      for (const dx of [-10, 10]) { c.fillStyle = '#c4713a'; c.strokeStyle = '#1d1511'; c.lineWidth = 2.2; c.beginPath(); c.roundRect(hx + dx - 4, hy - 8, 8, 16, 3); c.fill(); c.stroke(); }
      c.restore();
      break;
    }
    case 'agi': { // sprinting on the spot while the track streams past
      const speed = 0.35 + 0.65 * Math.sin(Math.PI * p) ** 0.6;
      backdrop(c, t, t * 900 * speed);
      for (let i = 0; i < 9; i++) { const x = ((i * 170 - t * 1100 * speed) % 1100 + 1100) % 1100 - 100, y = 300 + (i % 4) * 46; c.strokeStyle = `rgba(255,255,255,${0.12 + 0.2 * speed})`; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 120 * speed + 40, y); c.stroke(); }
      const ph = t * 19 * (0.6 + 0.6 * speed);
      const s = Math.sin(ph), co = Math.cos(ph);
      const pz = pose({ lean: 16, drop: 6, x: 4, fU: 22 + 42 * s, fL: 22 + 42 * s - 52 * Math.max(0, co), bU: -22 - 42 * s, bL: -22 - 42 * s - 52 * Math.max(0, -co), wU: 30 - 55 * s, wL: 30 - 55 * s + 55, sU: 20 + 55 * s, sL: 20 + 55 * s + 55, head: -4 });
      drawCharacter(c, spec, CX, CY - Math.abs(Math.sin(ph)) * 8, SC, { ...opts, pose: pz });
      for (let i = 0; i < 5; i++) { const k = (t * 3 + i * 0.2) % 1; c.fillStyle = `rgba(216,184,120,${0.5 * (1 - k)})`; c.beginPath(); c.arc(CX - 70 - k * 120, CY - 6 - k * 24, 8 + k * 14, 0, 7); c.fill(); }
      break;
    }
    case 'vit': { // squats with a log across the shoulders
      backdrop(c, t);
      stationProp(c, 'vit', 760, 470, 1.5, t, false);
      const u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * 3 * p);
      const d = u * e;
      const drop = d * 20;
      const pz = pose({ lean: 4 + 6 * d, drop, wU: 158, wL: 168, sU: 158, sL: 168, fU: 20 + 26 * d, fL: 4 - 22 * d, bU: -20 - 26 * d, bL: -4 + 22 * d, head: 0 });
      drawCharacter(c, spec, CX, CY, SC, { ...opts, pose: pz });
      c.save(); c.translate(CX, CY); c.scale(SC, SC);
      const hip = 30 * Math.cos((20 + 26 * d) * D2R) + 30 * Math.cos((4 - 22 * d) * D2R) - drop;
      const ly = -hip - 39 - 40, lx = 4 + 6 * d;
      c.strokeStyle = '#1d1511'; c.lineWidth = 17; c.lineCap = 'round'; c.beginPath(); c.moveTo(lx - 62, ly + 4); c.lineTo(lx + 62, ly - 4); c.stroke();
      c.strokeStyle = '#8a5a30'; c.lineWidth = 12; c.beginPath(); c.moveTo(lx - 62, ly + 4); c.lineTo(lx + 62, ly - 4); c.stroke();
      c.fillStyle = '#c9a56a'; c.strokeStyle = '#1d1511'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(lx + 62, ly - 4, 5, 8, 0, 0, 7); c.fill(); c.stroke();
      c.restore();
      if (d > 0.85) { c.fillStyle = 'rgba(216,184,120,.45)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(CX - 90 + i * 36 + Math.sin(t * 20 + i) * 4, CY - 4, 6, 0, 7); c.fill(); } }
      break;
    }
    case 'end': { // jump rope, four jumps
      backdrop(c, t);
      stationProp(c, 'end', 760, 470, 1.5, t, false);
      const ph = Math.PI * 2 * 4 * p;
      const hop = (1 - Math.cos(ph)) / 2 * 22 * e;
      const pz = pose({ lean: 0, drop: -2, wU: 52 + 16 * Math.sin(ph), wL: 72, sU: 52 - 16 * Math.sin(ph), sL: 72, fU: 8, fL: 2, bU: -8, bL: -2, head: 0 });
      drawCharacter(c, spec, CX, CY - hop, SC, { ...opts, pose: pz });
      const hy = CY - 150 * (SC / 2.3) - hop;
      const ctrl = hy + 20 - 260 * Math.cos(ph);
      c.strokeStyle = '#1d1511'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(CX - 62, hy + 8); c.quadraticCurveTo(CX, ctrl, CX + 62, hy + 8); c.stroke();
      c.strokeStyle = '#f1e6d0'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(CX - 62, hy + 8); c.quadraticCurveTo(CX, ctrl, CX + 62, hy + 8); c.stroke();
      c.fillStyle = 'rgba(40,20,10,.3)'; c.beginPath(); c.ellipse(CX, CY + 4, 70 - hop * 0.8, 12, 0, 0, 7); c.fill();
      break;
    }
    case 'spi': { // meditation before a brazier: breathe in, hold, the flame and aura swell
      backdrop(c, t);
      stationProp(c, 'spi', 760, 470, 1.6, t, false);
      const k = Math.sin(Math.PI * p), br = Math.sin(p * Math.PI * 4);
      const pz = pose({ lean: 3, head: 10 * k, drop: 14 * e, wU: 38 + 20 * k, wL: 150 + 10 * br, sU: 38 + 20 * k, sL: 150 + 10 * br, fU: 18, fL: 6, bU: -18, bL: -6 });
      for (let i = 0; i < 3; i++) { const q = (p * 1.4 + i / 3) % 1; c.strokeStyle = `rgba(255,200,90,${0.5 * (1 - q) * e})`; c.lineWidth = 5 * (1 - q) + 1; c.beginPath(); c.ellipse(CX, CY - 120, 70 + q * 190, 90 + q * 190, 0, 0, 7); c.stroke(); }
      const glow = c.createRadialGradient(CX, CY - 120, 10, CX, CY - 120, 200); glow.addColorStop(0, `rgba(255,190,90,${0.35 * e})`); glow.addColorStop(1, 'rgba(255,190,90,0)'); c.fillStyle = glow; c.fillRect(0, 0, SW, SH);
      drawCharacter(c, spec, CX, CY, SC, { ...opts, pose: pz });
      for (let i = 0; i < 6; i++) { const q = (t * 0.7 + i / 6) % 1; c.fillStyle = `rgba(255,220,130,${0.8 * (1 - q) * e})`; c.beginPath(); c.arc(CX - 60 + i * 24 + Math.sin(t * 4 + i) * 6, CY - 80 - q * 240, 3.5, 0, 7); c.fill(); }
      break;
    }
    case 'tec': { // sword forms against a straw dummy
      backdrop(c, t);
      const per = 0.55, k = ((p * 1.9) % per) / per, tick = k * 11;
      const pz = poseFor({
        act: ACTIONS.light, age: tick, dur: { su: 4, ac: 1, rc: 5 }, weapon: spec.weapon, phase: 0, hitAge: 99, stunned: false, t, fallAge: -1,
        yielded: false, victory: false, tiers: { legL: 'ok', legR: 'ok' },
      });
      const hit = tick > 4 && tick < 7;
      const dx = 600, wob = hit ? Math.sin((tick - 4) * 3) * 0.12 : Math.sin(t * 40) * 0.015 * (1 - k);
      c.save(); c.translate(dx, 470); c.rotate(wob); c.translate(-dx, -470); stationProp(c, 'tec', dx, 470, 1.9, t, false); c.restore();
      drawCharacter(c, spec, CX - 40, CY, SC, { t, injuries: inj.injuries, prosthetics: inj.prosthetics, armed: true, pose: pz });
      if (hit) { c.fillStyle = '#fff2c0'; c.beginPath(); for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283, r = i % 2 ? 10 : 30; c.lineTo(540 + Math.cos(a) * r, 380 + Math.sin(a) * r); } c.closePath(); c.fill(); for (let i = 0; i < 6; i++) { c.fillStyle = '#d8b878'; c.beginPath(); c.arc(540 + (i - 2.5) * 12, 380 - ((tick - 4) * 12) + i * 4, 3, 0, 7); c.fill(); } }
      break;
    }
  }
  // stat icon pops in the corner while you train
  icon(c, stat, 70, 70, 74 + 8 * Math.sin(t * 10));
}

/** "+1 STR" rising text after the set. */
export function drawGain(c: CanvasRenderingContext2D, text: string, color: string, p: number, stat: StatKey) {
  const y = 250 - 50 * Math.min(1, p * 1.5), a = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  c.save(); c.globalAlpha = Math.max(0, a); c.textAlign = 'center';
  icon(c, stat, SW / 2 - 130, y - 14, 70);
  c.font = 'bold 76px system-ui'; c.lineWidth = 12; c.lineJoin = 'round'; c.strokeStyle = '#1d1511'; c.strokeText(text, SW / 2 + 20, y + 12); c.fillStyle = color; c.fillText(text, SW / 2 + 20, y + 12);
  c.restore();
}
export const POSE_IDLE: Pose = IDLE;
