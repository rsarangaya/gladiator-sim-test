// Static fighter portraits for menus: the creator's class cards and the hub's character panel
// (which shows real gear, wounds, bandages and lost limbs).
import { CLASSES } from '../data/classes';
import { ZONES, type FighterSpec, type InjuryTier, type Zone, type ZoneTier } from '../sim/types';
import { IDLE, drawFighter, lookFor, type Mark } from './rig';

export interface PortraitOpts {
  injuries?: Partial<Record<Zone, InjuryTier>>;
  prosthetics?: Partial<Record<Zone, boolean>>;
}

export function drawPortrait(cv: HTMLCanvasElement, spec: FighterSpec, opts: PortraitOpts = {}) {
  const c = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3a2130'); bg.addColorStop(0.62, '#7a4a3c'); bg.addColorStop(0.63, '#b8895a'); bg.addColorStop(1, '#8c6240');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W * 0.5, H * 0.35, 4, W * 0.5, H * 0.35, H * 0.7);
  glow.addColorStop(0, 'rgba(255,190,120,.35)'); glow.addColorStop(1, 'rgba(255,190,120,0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);

  const tiers = Object.fromEntries(ZONES.map((z) => [z, 'ok'])) as Record<Zone, ZoneTier>;
  const severed: Partial<Record<Zone, boolean>> = {};
  const marks: Mark[] = [];
  for (const z of ZONES) {
    const t = opts.injuries?.[z];
    if (!t) continue;
    if (t === 'bruised') { tiers[z] = 'hurt'; marks.push({ zone: z, kind: 'bruise', t: 0.45, o: 0, a: 0.3, s: 1.3 }); }
    else if (t === 'wounded') { tiers[z] = 'crippled'; marks.push({ zone: z, kind: 'cut', t: 0.4, o: 0.2, a: 0.4, s: 1.2 }); }
    else if (opts.prosthetics?.[z]) tiers[z] = 'crippled'; // fitted prosthetic: wrapped, partly restored
    else if (z === 'head' || z === 'torso') tiers[z] = 'crippled';
    else { tiers[z] = 'disabled'; severed[z] = true; } // maimed limb: gone
  }

  const sc = Math.min(H / 150, W / 80);
  c.fillStyle = 'rgba(30,10,5,.35)'; c.beginPath(); c.ellipse(W / 2, H - 14, 26 * sc * 0.7, 6 * sc * 0.7, 0, 0, 7); c.fill();
  c.save(); c.translate(W / 2 - 4 * sc, H - 14); c.scale(sc, sc);
  drawFighter(c, {
    spec, look: lookFor(spec, 0), pose: { ...IDLE, lean: 3 }, tiers, carried: {}, armed: true, flash: 0, fall: 0, stunned: false, snared: false, t: 0,
    trimGold: spec.armor.torso > CLASSES[spec.classId].armor.torso + 3, netArm: spec.classId === 'retiarius', severed, marks, bloody: false,
  });
  c.restore();
  const v = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,4,8,.5)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}
