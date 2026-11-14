import { ACTIONS, TUNING, type ActionDef } from '../data/actions';
import { compileMods, type Mods } from '../data/skills';
import { WEAPONS } from '../data/classes';
import { clamp, type Rng } from './rng';
import { ZONES, type ActionId, type FighterSpec, type WeaponDef, type Zone, type ZoneTier } from './types';

export interface Runtime {
  id: 0 | 1;
  spec: FighterSpec;
  x: number;
  dir: 1 | -1;
  hp: Record<Zone, number>;
  max: Record<Zone, number>;
  tier: Record<Zone, ZoneTier>;
  stam: number;
  maxStam: number;
  act: ActionDef | null;
  frame: number;
  target: Zone;
  stun: number;
  snare: number;
  bleed: number;      // remaining bleed ticks
  bleedStacks: number;
  exhaust: number;
  grace: number;      // stun immunity window after being interrupted
  cd: Partial<Record<ActionId, number>>;
  weapon: WeaponDef;
  disarmed: boolean;
  dealt: number;
  form: number;       // per-fight lognormal form factor
  yielded: boolean;
  dead: boolean;
  mods: Mods;         // skills and gear perks compiled into combat modifiers
  windUsed: boolean;  // Second Wind spent
}

export function tierOf(hp: number, max: number): ZoneTier {
  if (hp <= 0) return 'disabled';
  const p = hp / max;
  return p > 0.66 ? 'ok' : p > 0.33 ? 'hurt' : 'crippled';
}

export function zoneMax(vit: number): Record<Zone, number> {
  return {
    head: 24 + vit * 0.8,
    torso: 58 + vit * 1.8,
    armW: 16 + vit * 0.6,
    armS: 16 + vit * 0.6,
    legL: 20 + vit * 0.7,
    legR: 20 + vit * 0.7,
  };
}

function normal(r: Rng): number {
  let a = 0, b = 0;
  while (a === 0) a = r();
  while (b === 0) b = r();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

export function makeRuntime(spec: FighterSpec, id: 0 | 1, rng: Rng): Runtime {
  const mods = compileMods(spec.skills ?? []);
  const max = zoneMax(spec.stats.vit);
  for (const z of ZONES) max[z] *= mods.hp;
  const hp = { ...max };
  for (const z of ZONES) {
    const loss = spec.carriedHpLoss?.[z] ?? 0;
    hp[z] = spec.missing?.[z] ? 0 : Math.max(1, max[z] - loss);
  }
  const tier = {} as Record<Zone, ZoneTier>;
  for (const z of ZONES) tier[z] = tierOf(hp[z], max[z]);
  const maxStam = (60 + spec.stats.end * 1.4) * mods.stamina;
  return {
    id, spec,
    x: TUNING.startPos[id],
    dir: id === 0 ? 1 : -1,
    hp, max, tier,
    stam: maxStam, maxStam,
    act: null, frame: 0, target: 'torso',
    stun: 0, snare: 0, bleed: 0, bleedStacks: 0, exhaust: 0, grace: 0,
    cd: {},
    weapon: spec.weapon,
    disarmed: false,
    dealt: 0,
    form: Math.exp(TUNING.formSigma * normal(rng)),
    yielded: false,
    dead: false,
    mods,
    windUsed: false,
  };
}

const frac = (f: Runtime, z: Zone) => f.hp[z] / f.max[z];

export const legFrac = (f: Runtime) => (frac(f, 'legL') + frac(f, 'legR')) / 2;
export const legsDown = (f: Runtime) => f.hp.legL <= 0 && f.hp.legR <= 0;
export const anyLegDisabled = (f: Runtime) => f.hp.legL <= 0 || f.hp.legR <= 0 || f.snare > 0;
export const moveMod = (f: Runtime) =>
  (0.4 + 0.6 * legFrac(f)) * (f.snare > 0 ? TUNING.snareMoveMult : 1) * (legsDown(f) ? 0.3 : 1);
export const accMod = (f: Runtime) =>
  (0.85 + 0.15 * frac(f, 'head')) * (f.stam / f.maxStam < 0.3 ? 0.9 : 1) * (f.snare > 0 ? 0.8 : 1);
export const evaMod = (f: Runtime) => (0.4 + 0.6 * legFrac(f)) * (legsDown(f) ? 0.3 : 1) * (f.snare > 0 ? 0.5 : 1);
export const canBlock = (f: Runtime) => !!f.spec.shield && f.hp.armS > 0;
export const blockMod = (f: Runtime) => 0.4 + 0.6 * frac(f, 'armS');
export const weaponArmMod = (f: Runtime) => 0.65 + 0.35 * frac(f, 'armW'); // damage
export const weaponSpeedMod = (f: Runtime) => 1 + 0.35 * (1 - frac(f, 'armW')) + (f.stam / f.maxStam < 0.3 ? 0.15 : 0) + (f.snare > 0 ? 0.25 : 0);

export const moveSpeed = (f: Runtime) => (TUNING.moveBase + f.spec.stats.agi * TUNING.moveAgi) * moveMod(f);
export const reachOf = (f: Runtime, a?: ActionDef) => a?.reach ?? f.weapon.reach + f.mods.reach;

export const bleedDmgPerTick = (f: Runtime) => (TUNING.bleedPerSec * f.bleedStacks) / 20;

export function disarm(f: Runtime) {
  f.disarmed = true;
  f.weapon = WEAPONS.fists;
}

export function actionDuration(f: Runtime, a: ActionDef) {
  const s = a.weaponSpeed ? f.weapon.speed * weaponSpeedMod(f) * f.mods.speed : 1;
  const startup = Math.max(1, Math.round(a.startup * s));
  const recovery = Math.round(a.recovery * (a.weaponSpeed ? s : 1));
  return { startup, active: a.active, recovery };
}

export function startAction(f: Runtime, id: ActionId, target: Zone) {
  f.act = ACTIONS[id];
  f.frame = 0;
  f.target = target;
  f.stam = clamp(f.stam - f.act.stamina, 0, f.maxStam);
  if (f.act.cooldown) f.cd[id] = Math.round(f.act.cooldown * f.mods.sigCd);
}

export const clampAction = (v: number) => clamp(v, 0, 1);
