// Skills and gear perks. Both compile into one set of combat modifiers (Mods) that the sim reads.
// Every number lives here so tuning never touches combat logic.
import type { ClassId } from '../sim/types';

export interface Mods {
  dmg: number; light: number; heavy: number; sig: number;      // damage multipliers (all / light / heavy / signature move)
  crit: number; critMult: number;                               // added crit chance / added crit multiplier
  hit: number; eva: number;                                     // added hit chance / evasion multiplier
  block: number; absorb: number;                                // added block chance / added shield absorb
  pierce: number;                                               // added armor piercing (fraction)
  hp: number; armor: number; stamina: number; regen: number;    // multipliers
  speed: number;                                                // < 1 = faster attacks
  reach: number;                                                // added weapon reach (units)
  bleed: number;                                                // added bleed chance
  headDmg: number; legDmg: number;                              // zone damage multipliers
  execute: number; lastStand: number;                           // bonus damage vs weak targets / when weak
  riposte: number;                                              // chance a blocked blow is answered
  bashStun: number; snare: number; sigCd: number;               // signature move tweaks
  leech: number; thorns: number;                                // heal on hit / reflect damage
  secondWind: boolean; legSlow: boolean;                        // unlocks
}

export const NEUTRAL: Mods = {
  dmg: 1, light: 1, heavy: 1, sig: 1, crit: 0, critMult: 0, hit: 0, eva: 1, block: 0, absorb: 0, pierce: 0,
  hp: 1, armor: 1, stamina: 1, regen: 1, speed: 1, reach: 0, bleed: 0, headDmg: 1, legDmg: 1, execute: 0, lastStand: 0,
  riposte: 0, bashStun: 0, snare: 0, sigCd: 1, leech: 0, thorns: 0, secondWind: false, legSlow: false,
};

export type SkillKind = 'common' | 'class' | 'perk';
export interface SkillDef {
  id: string; name: string; desc: string; cost: number; kind: SkillKind;
  cls?: ClassId; slot?: 'weapon' | 'armor'; req?: string;
  apply: (m: Mods) => void;
}

const list: SkillDef[] = [];
const add = (id: string, name: string, desc: string, cost: number, kind: SkillKind, extra: Partial<SkillDef>, apply: (m: Mods) => void) =>
  list.push({ id, name, desc, cost, kind, apply, ...extra });

// ---- common skills (every class) ------------------------------------------------------
add('tough', 'Tough Hide', '+4% health.', 1, 'common', {}, (m) => { m.hp *= 1.04; });
add('lungs', 'Iron Lungs', '+10% stamina and 6% faster recovery.', 1, 'common', {}, (m) => { m.stamina *= 1.1; m.regen *= 1.06; });
add('eye', 'Keen Eye', '+3.5% chance to hit.', 1, 'common', {}, (m) => { m.hit += 0.035; });
add('edge', 'Sharpened Edge', '+5% damage.', 1, 'common', {}, (m) => { m.dmg *= 1.05; });
add('instinct', 'Killer Instinct', '+7% critical chance.', 1, 'common', {}, (m) => { m.crit += 0.07; });
add('foot', 'Footwork', '+15% evasion.', 1, 'common', {}, (m) => { m.eva *= 1.15; });
add('wind', 'Second Wind', 'Once per fight, recover a chunk of stamina when exhausted.', 2, 'common', { req: 'lungs' }, (m) => { m.secondWind = true; });
add('hamstring', 'Hamstring', 'Leg strikes hit 20% harder and slow the target for two seconds.', 2, 'common', { req: 'eye' }, (m) => { m.legDmg *= 1.2; m.legSlow = true; });
add('exec', 'Executioner', '+25% damage against enemies below 35% health.', 2, 'common', { req: 'edge' }, (m) => { m.execute += 0.25; });
add('last', 'Last Stand', '+35% damage when you are below 25% health.', 2, 'common', { req: 'tough' }, (m) => { m.lastStand += 0.35; });

// ---- class skills (3 each, each needs the one before) ---------------------------------------
add('bulwark', 'Bulwark', '+9% shield absorption.', 1, 'class', { cls: 'murmillo' }, (m) => { m.absorb += 0.09; });
add('bashm', 'Crushing Bash', 'Shield Bash staggers longer, hits harder and is ready sooner.', 1, 'class', { cls: 'murmillo', req: 'bulwark' }, (m) => { m.bashStun += 6; m.sig *= 1.4; m.sigCd *= 0.8; });
add('riposte', 'Riposte', '30% chance to answer a blocked blow with a counter.', 2, 'class', { cls: 'murmillo', req: 'bashm' }, (m) => { m.riposte += 0.3; });

add('duelist', 'Duelist', '+3% to hit and +3% critical chance.', 1, 'class', { cls: 'thraex' }, (m) => { m.hit += 0.03; m.crit += 0.03; });
add('hookm', 'Hook Mastery', 'Hook Strike deals +18% damage.', 1, 'class', { cls: 'thraex', req: 'duelist' }, (m) => { m.sig *= 1.18; });
add('flurry', 'Flurry', 'Attacks are 6% faster.', 2, 'class', { cls: 'thraex', req: 'hookm' }, (m) => { m.speed *= 0.94; });

add('reach', 'Long Reach', '+1.1 reach: strike before they can.', 1, 'class', { cls: 'hoplomachus' }, (m) => { m.reach += 1.1; });
add('wallm', 'Spear Wall Mastery', 'Spear Wall hits 40% harder and recovers sooner.', 1, 'class', { cls: 'hoplomachus', req: 'reach' }, (m) => { m.sig *= 1.4; m.sigCd *= 0.8; });
add('phalanx', 'Phalanx', '+18% armor.', 2, 'class', { cls: 'hoplomachus', req: 'wallm' }, (m) => { m.armor *= 1.18; });

add('netm', 'Net Mastery', 'Nets hold the enemy three seconds longer.', 1, 'class', { cls: 'retiarius' }, (m) => { m.snare += 60; });
add('quick', 'Quick Hands', 'The net is ready 45% sooner.', 1, 'class', { cls: 'retiarius', req: 'netm' }, (m) => { m.sigCd *= 0.55; });
add('barbs', 'Trident Barbs', '+10% bleed chance and +3% damage.', 2, 'class', { cls: 'retiarius', req: 'quick' }, (m) => { m.bleed += 0.1; m.dmg *= 1.03; });

add('twin', 'Twin Fury', '+6% light attack damage.', 1, 'class', { cls: 'dimachaerus' }, (m) => { m.light *= 1.06; });
add('whirlm', 'Whirlwind Mastery', 'Whirlwind deals +25% damage.', 1, 'class', { cls: 'dimachaerus', req: 'twin' }, (m) => { m.sig *= 1.25; });
add('dancer', 'Dancer', '+14% evasion.', 2, 'class', { cls: 'dimachaerus', req: 'whirlm' }, (m) => { m.eva *= 1.14; });

add('cleavem', 'Cleave Mastery', 'Cleave deals +10% damage and ignores more armor.', 1, 'class', { cls: 'brute' }, (m) => { m.sig *= 1.1; m.pierce += 0.08; });
add('over', 'Overpower', 'Heavy attacks deal +16% damage.', 1, 'class', { cls: 'brute', req: 'cleavem' }, (m) => { m.heavy *= 1.16; });
add('rage', 'Berserker', '+30% damage when you are below 25% health.', 2, 'class', { cls: 'brute', req: 'over' }, (m) => { m.lastStand += 0.3; });

// ---- gear perks (rolled on weapons and armor, never bought) ----------------------------------
add('keen', 'Keen', '+5% critical chance.', 0, 'perk', { slot: 'weapon' }, (m) => { m.crit += 0.05; });
add('vicious', 'Vicious', '+5% damage.', 0, 'perk', { slot: 'weapon' }, (m) => { m.dmg *= 1.05; });
add('serrated', 'Serrated', '+15% bleed chance.', 0, 'perk', { slot: 'weapon' }, (m) => { m.bleed += 0.15; });
add('swift', 'Swift', 'Attacks are 10% faster.', 0, 'perk', { slot: 'weapon' }, (m) => { m.speed *= 0.9; });
add('piercing', 'Piercing', 'Ignores 18% of armor.', 0, 'perk', { slot: 'weapon' }, (m) => { m.pierce += 0.18; });
add('reaching', 'Reaching', '+0.9 reach.', 0, 'perk', { slot: 'weapon' }, (m) => { m.reach += 0.9; });
add('headhunter', 'Headhunter', '+15% damage to the head.', 0, 'perk', { slot: 'weapon' }, (m) => { m.headDmg *= 1.15; });
add('vampiric', 'Vampiric', 'Heals you for 6% of the damage you deal.', 0, 'perk', { slot: 'weapon' }, (m) => { m.leech += 0.06; });

add('reinforced', 'Reinforced', '+15% armor.', 0, 'perk', { slot: 'armor' }, (m) => { m.armor *= 1.15; });
add('fortified', 'Fortified', '+4% health.', 0, 'perk', { slot: 'armor' }, (m) => { m.hp *= 1.04; });
add('featherlight', 'Featherlight', '+10% stamina.', 0, 'perk', { slot: 'armor' }, (m) => { m.stamina *= 1.1; m.regen *= 1.05; });
add('warding', 'Warding', '+8% shield absorption.', 0, 'perk', { slot: 'armor' }, (m) => { m.absorb += 0.08; });
add('nimble', 'Nimble', '+10% evasion.', 0, 'perk', { slot: 'armor' }, (m) => { m.eva *= 1.1; });
add('thorned', 'Thorned', 'Reflects 6% of damage taken back at the attacker.', 0, 'perk', { slot: 'armor' }, (m) => { m.thorns += 0.06; });
add('stalwart', 'Stalwart', 'Grants Second Wind.', 0, 'perk', { slot: 'armor' }, (m) => { m.secondWind = true; });

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(list.map((s) => [s.id, s]));
export const PERKS = {
  weapon: list.filter((s) => s.kind === 'perk' && s.slot === 'weapon').map((s) => s.id),
  armor: list.filter((s) => s.kind === 'perk' && s.slot === 'armor').map((s) => s.id),
};

export function compileMods(ids: readonly string[]): Mods {
  const m: Mods = { ...NEUTRAL };
  for (const id of ids) SKILLS[id]?.apply(m);
  return m;
}

/** Skills a class can learn, in tree order. */
export const skillsFor = (cls: ClassId) => ({
  common: list.filter((s) => s.kind === 'common'),
  tree: list.filter((s) => s.kind === 'class' && s.cls === cls),
});

export function canLearn(owned: readonly string[], points: number, id: string, cls: ClassId): string | null {
  const s = SKILLS[id];
  if (!s || s.kind === 'perk') return 'Unknown skill.';
  if (s.kind === 'class' && s.cls !== cls) return 'That belongs to another class.';
  if (owned.includes(id)) return 'Already learned.';
  if (s.req && !owned.includes(s.req)) return `Requires ${SKILLS[s.req].name}.`;
  if (points < s.cost) return `Needs ${s.cost} skill point${s.cost > 1 ? 's' : ''}.`;
  return null;
}

const hash = (s: string) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
export const nameKey = hash;

/** AI opponents know skills in proportion to how strong they are (bosses know more). Deterministic per name. */
export function enemySkills(cls: ClassId, budget: number, key: number, boss = false, count?: number): string[] {
  const n = Math.max(0, Math.min(9, count ?? Math.round((budget - 60) / 28) + (boss ? 2 : 0)));
  if (n === 0) return [];
  const pool = [...skillsFor(cls).common, ...skillsFor(cls).tree];
  let x = key >>> 0;
  const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  pool.sort(() => rnd() - 0.5);
  const out: string[] = [];
  for (let pass = 0; pass < 4 && out.length < n; pass++) {
    for (const s of pool) {
      if (out.length >= n) break;
      if (out.includes(s.id)) continue;
      if (s.req && !out.includes(s.req)) continue;
      out.push(s.id);
    }
  }
  return out;
}
