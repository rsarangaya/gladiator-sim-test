// Pose selection: a pure function of (what the fighter is doing, how long ago it started).
import type { ActionDef } from '../data/actions';
import { IDLE, lerp, mix, pose, type Pose } from './rig';
import type { ActionId, WeaponDef } from '../sim/types';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

type Style = 'thrust' | 'slash' | 'swing' | 'dual' | 'punch';

const LUNGE = { fU: 42, fL: 12, bU: -30, bL: -8 };

// [windup, strike] pairs per style
const STYLES: Record<Style, [Partial<Pose>, Partial<Pose>]> = {
  thrust: [pose({ wU: -30, wL: -8, lean: 2, x: -4, sU: 10, sL: 40 }), pose({ wU: 82, wL: 88, lean: 14, x: 14, drop: 6, ...LUNGE })],
  slash:  [pose({ wU: 140, wL: 165, lean: -2, x: -4 }), pose({ wU: 58, wL: 72, lean: 16, x: 10, drop: 4, ...LUNGE })],
  swing:  [pose({ wU: 215, wL: 238, lean: -10, x: -6, drop: 2 }), pose({ wU: 55, wL: 70, lean: 24, x: 12, drop: 8, ...LUNGE })],
  dual:   [pose({ wU: 120, wL: 145, sU: -25, sL: 0, lean: 0, x: -3 }), pose({ wU: 72, wL: 86, sU: 55, sL: 80, lean: 16, x: 12, drop: 5, ...LUNGE })],
  punch:  [pose({ wU: -25, wL: -10, lean: 4, x: -3 }), pose({ wU: 80, wL: 88, lean: 14, x: 10, ...LUNGE })],
};

// Alternate wind-ups/strikes so consecutive attacks of the same kind do not look copy-pasted.
const VARIANTS: Record<Style, [Partial<Pose>, Partial<Pose>][]> = {
  thrust: [
    STYLES.thrust as [Partial<Pose>, Partial<Pose>],
    [pose({ wU: 10, wL: 30, lean: 4, x: -5, drop: 8, sU: 20, sL: 50 }), pose({ wU: 64, wL: 72, lean: 18, x: 16, drop: 12, ...LUNGE })],
    [pose({ wU: -10, wL: 10, lean: 0, x: -2, sU: 15, sL: 45 }), pose({ wU: 90, wL: 92, lean: 10, x: 9, drop: 3, fU: 34, fL: 8, bU: -26, bL: -6 })],
  ],
  slash: [
    STYLES.slash as [Partial<Pose>, Partial<Pose>],
    [pose({ wU: 105, wL: 125, lean: -6, x: -6, head: 4 }), pose({ wU: 38, wL: 56, lean: 20, x: 12, drop: 3, ...LUNGE })],
    [pose({ wU: 10, wL: 40, lean: 6, x: -3 }), pose({ wU: 120, wL: 130, lean: 12, x: 10, drop: 5, ...LUNGE })],
  ],
  swing: [
    STYLES.swing as [Partial<Pose>, Partial<Pose>],
    [pose({ wU: 120, wL: 190, lean: -14, x: -8, drop: 4 }), pose({ wU: 30, wL: 40, lean: 26, x: 14, drop: 10, ...LUNGE })],
  ],
  dual: [
    // right blade strikes, left guards
    [pose({ wU: 125, wL: 150, sU: 30, sL: 70, lean: 0, x: -3 }), pose({ wU: 75, wL: 88, sU: 20, sL: 60, lean: 14, x: 12, drop: 5, ...LUNGE })],
    // left blade strikes, right guards
    [pose({ sU: 130, sL: 155, wU: 30, wL: 70, lean: 0, x: -3 }), pose({ sU: 78, sL: 90, wU: 22, wL: 60, lean: 14, x: 12, drop: 5, ...LUNGE })],
    // double cross-cut
    [pose({ wU: 140, wL: 165, sU: 110, sL: 150, lean: -4, x: -5 }), pose({ wU: 60, wL: 80, sU: 80, sL: 96, lean: 18, x: 14, drop: 6, ...LUNGE })],
    // quick low jabs
    [pose({ wU: 10, wL: 30, sU: 10, sL: 30, lean: 4, x: -3, drop: 4 }), pose({ wU: 70, wL: 80, sU: 50, sL: 78, lean: 12, x: 10, drop: 8, ...LUNGE })],
  ],
  punch: [STYLES.punch as [Partial<Pose>, Partial<Pose>], [pose({ wU: 30, wL: 120, lean: 2, x: -4 }), pose({ wU: 75, wL: 60, lean: 14, x: 10, ...LUNGE })]],
};

const hash = (n: number) => { let x = Math.imul(n + 1, 2654435761) >>> 0; x ^= x >>> 15; return x >>> 0; };
/** Pseudo-random but never the same variant twice in a row. */
function pick(n: number, seq: number): number {
  if (n <= 1) return 0;
  const cur = hash(seq) % n, prev = seq > 0 ? hash(seq - 1) % n : -1;
  return cur === prev ? (cur + 1 + (hash(seq + 99) % (n - 1))) % n : cur;
}
VARIANTS.thrust.push(
  [pose({ wU: 40, wL: 20, lean: -2, x: -6, drop: 2, sU: 20, sL: 50 }), pose({ wU: 76, wL: 80, lean: 16, x: 18, drop: 7, fU: 46, fL: 14, bU: -32, bL: -9 })],
  [pose({ wU: 130, wL: 110, lean: -4, x: -4 }), pose({ wU: 70, wL: 84, lean: 20, x: 14, drop: 9, ...LUNGE })],
);
VARIANTS.slash.push([pose({ wU: -10, wL: 20, lean: 8, x: -4, drop: 6 }), pose({ wU: 150, wL: 160, lean: 10, x: 8, drop: 2, ...LUNGE })]);
VARIANTS.swing.push([pose({ wU: 170, wL: 205, lean: -18, x: -9, drop: 0 }), pose({ wU: 70, wL: 55, lean: 28, x: 16, drop: 12, ...LUNGE })]);
VARIANTS.punch.push([pose({ wU: 100, wL: 150, lean: -2, x: -4 }), pose({ wU: 55, wL: 75, lean: 18, x: 12, drop: 4, ...LUNGE })]);
const SPECIAL: Partial<Record<ActionId, [Partial<Pose>, Partial<Pose>][]>> = {
  net: [
    [pose({ sU: 215, sL: 238, lean: -8, x: -4, wU: 25, wL: 55 }), pose({ sU: 80, sL: 86, lean: 18, x: 10, drop: 5, ...LUNGE, wU: 25, wL: 55 })],
    [pose({ sU: 20, sL: 150, lean: -12, x: -6, wU: 25, wL: 55, drop: 4 }), pose({ sU: 95, sL: 100, lean: 20, x: 12, drop: 8, ...LUNGE, wU: 25, wL: 55 })],
    [pose({ sU: 170, sL: 120, lean: 4, x: -8, wU: 30, wL: 60 }), pose({ sU: 60, sL: 70, lean: 16, x: 12, drop: 4, ...LUNGE, wU: 30, wL: 60 })],
  ],
  bash: [
    [pose({ sU: -12, sL: 18, lean: -2, x: -6, wU: 25, wL: 55 }), pose({ sU: 86, sL: 94, lean: 18, x: 14, drop: 5, ...LUNGE, wU: 25, wL: 55 })],
    [pose({ sU: 40, sL: 120, lean: -8, x: -8, wU: 25, wL: 55 }), pose({ sU: 70, sL: 80, lean: 22, x: 16, drop: 8, ...LUNGE, wU: 25, wL: 55 })],
  ],
  hook: [
    [pose({ wU: 150, wL: 175, lean: -6, x: -5 }), pose({ wU: 30, wL: 60, lean: 20, x: 12, drop: 6, ...LUNGE })],
    [pose({ wU: 60, wL: 140, lean: 2, x: -8, drop: 4 }), pose({ wU: 110, wL: 50, lean: 14, x: 14, drop: 8, ...LUNGE })],
    [pose({ wU: 90, wL: 200, lean: -10, x: -6 }), pose({ wU: 65, wL: 40, lean: 22, x: 10, drop: 5, ...LUNGE })],
  ],
  cleave: [
    [pose({ wU: 215, wL: 238, lean: -10, x: -6, drop: 2 }), pose({ wU: 55, wL: 70, lean: 24, x: 12, drop: 8, ...LUNGE })],
    [pose({ wU: 150, wL: 235, lean: -16, x: -10 }), pose({ wU: 40, wL: 60, lean: 30, x: 16, drop: 12, ...LUNGE })],
    [pose({ wU: 120, wL: 60, lean: -8, x: -12, drop: 0 }), pose({ wU: 100, wL: 120, lean: 26, x: 14, drop: 10, ...LUNGE })],
  ],
};

function styleFor(w: WeaponDef, id: ActionId): Style {
  if (id === 'heavy' || id === 'cleave') return 'swing';
  if (id === 'hook') return 'slash';
  if (w.dual) return 'dual';
  if (w.name.includes('Bare')) return 'punch';
  if (w.name.includes('Scimitar')) return 'slash';
  if (w.name.includes('Axe')) return 'swing';
  return 'thrust';
}

export interface Dur { su: number; ac: number; rc: number }

export interface AnimIn {
  act: ActionDef | null;
  age: number;                 // ticks since action started (fractional)
  dur: Dur;
  weapon: WeaponDef;
  phase: number;               // walking phase from distance travelled
  hitAge: number;              // ticks since last hit taken (large = none)
  stunned: boolean;
  t: number;                   // seconds
  fallAge: number;             // ticks since death, <0 = alive
  yielded: boolean;
  victory: boolean;
  tiers: { legL: string; legR: string };
  seq?: number;                // how many attacks this fighter has started (picks a variant)
}

const walk = (phase: number, dir: 1 | -1): Partial<Pose> => {
  const s = Math.sin(phase * dir), c = Math.cos(phase * dir);
  const lf = Math.max(0, c), lb = Math.max(0, -c);
  return {
    fU: 18 + 26 * s, fL: 18 + 26 * s - 38 * lf, bU: -16 - 26 * s, bL: -16 - 26 * s - 38 * lb,
    wU: 28 - 10 * s, sU: 18 + 10 * s, lean: 7 * (dir > 0 ? 1 : -0.4),
  };
};

export function poseFor(a: AnimIn): Pose {
  let p: Pose = { ...IDLE };
  const bob = Math.sin(a.t * 3.1) * 1.4;
  const act = a.act;
  const { su, ac, rc } = a.dur;
  const age = a.age;

  if (a.fallAge >= 0) {
    // knocked back and down: arms flung out
    return pose({ lean: -20, head: -25, wU: 110, wL: 130, sU: 95, sL: 120, fU: 24, fL: 10, bU: -26, bL: -14 });
  }
  if (a.yielded) {
    return pose({ lean: 4, head: -10, drop: 26, wU: 170, wL: 176, sU: 20, sL: 40, fU: 80, fL: 5, bU: -10, bL: -88, x: 0 });
  }
  if (a.victory) {
    const hop = Math.abs(Math.sin(a.t * 4)) * 6;
    return pose({ lean: -4, head: -8, drop: -hop, wU: 175 + Math.sin(a.t * 5) * 6, wL: 182, sU: 150, sL: 170 });
  }

  if (act && act.id !== 'rest') {
    switch (act.id) {
      case 'advance': case 'retreat':
        p = pose(walk(a.phase, act.id === 'advance' ? 1 : -1)); break;
      case 'block': {
        const t = clamp01(age / 2);
        p = mix(IDLE, pose({ sU: 70, sL: 96, wU: 30, wL: 60, lean: -2, drop: 6, x: -3, fU: 24, fL: 12 }), easeOut(t));
        if (age > su + ac) p = mix(p, IDLE, clamp01((age - su - ac) / Math.max(1, rc)));
        break;
      }
      case 'dodge': {
        const t = clamp01(age / 3);
        p = mix(IDLE, pose({ lean: -16, head: -6, x: -10, drop: 12, fU: 36, fL: 24, bU: -38, bL: -20, wU: 40, wL: 70 }), easeOut(t));
        if (age > ac) p = mix(p, IDLE, clamp01((age - ac) / Math.max(1, rc)));
        break;
      }
      case 'wall': {
        const hold = pose({ wU: 74, wL: 82, sU: 42, sL: 82, lean: 10, drop: 8, x: 8, fU: 40, fL: 14, bU: -32, bL: -10 });
        const t = clamp01(age / 3);
        p = age < ac ? mix(IDLE, hold, easeOut(t)) : mix(hold, IDLE, clamp01((age - ac) / Math.max(1, rc)));
        break;
      }
      case 'whirl': {
        // arms flung wide, the body drives the turn: a short sweeping arc instead of spinning limbs
        const tot = su + ac + rc, f = clamp01(age / tot);
        const sweep = Math.sin(f * Math.PI);
        p = pose({ lean: 8 + 6 * sweep, drop: 3 + 4 * sweep, x: 4, head: -6 * sweep, wU: 70 + 70 * sweep, wL: 80 + 70 * sweep, sU: 110 - 40 * sweep, sL: 120 - 30 * sweep, fU: 26, fL: 8, bU: -26, bL: -8 });
        break;
      }
      default: {
        const sp = SPECIAL[act.id], seq = a.seq ?? 0;
        const vs = sp ?? VARIANTS[styleFor(a.weapon, act.id)];
        const [W, S] = vs[pick(vs.length, seq)];
        const Wp = pose(W), Sp = pose(S);
        p = swingMix(Wp, Sp, age, su, ac, rc);
      }
    }
  } else if (act && act.id === 'rest') {
    p = mix(IDLE, pose({ lean: 14, head: 8, drop: 6, wU: 12, wL: 30, sU: 10, sL: 30 }), 0.9);
  }

  // idle breathing / guard sway
  if (!act || act.id === 'rest') { p.drop += bob * 0.6; p.wL += Math.sin(a.t * 2.3) * 3; }

  if (a.stunned) { p = mix(p, pose({ lean: -8, head: Math.sin(a.t * 14) * 10, wU: 15, wL: 30, sU: 12, sL: 30, drop: 6 }), 0.8); }

  // hit reaction (additive, decays)
  const h = a.hitAge >= 0 ? Math.exp(-a.hitAge * 0.4) : 0;
  if (h > 0.02) { p.lean -= 22 * h; p.head -= 18 * h; p.x -= 8 * h; p.wU = lerp(p.wU, p.wU - 25, h); }

  // crippled legs: limp / shortened stance
  if (a.tiers.legL === 'crippled' || a.tiers.legR === 'crippled') { p.drop += 4; p.lean += 3; }
  return p;
}

function swingMix(W: Pose, S: Pose, age: number, su: number, ac: number, rc: number): Pose {
  if (age < su) return mix(IDLE, W, easeIn(clamp01(age / Math.max(1, su))) ** 0.7);
  const strikeLen = Math.max(1.6, ac);
  if (age < su + strikeLen) return mix(W, S, easeOut(clamp01((age - su) / strikeLen)));
  const hold = rc * 0.25;
  const rt = clamp01((age - su - strikeLen - hold) / Math.max(1, rc * 0.75));
  return mix(S, IDLE, easeIO(rt));
}
