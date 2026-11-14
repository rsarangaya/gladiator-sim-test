import type { ArmorSet, ClassId, FighterSpec, Personality, ShieldDef, Stats, WeaponDef } from '../sim/types';

export const WEAPONS: Record<string, WeaponDef> = {
  gladius:    { name: 'Gladius',         dmg: 14.8, reach: 6,   speed: 1.0,  edged: true },
  scimitar:   { name: 'Hooked Scimitar', dmg: 17.5, reach: 5.5, speed: 0.95, edged: true },
  spear:      { name: 'Long Spear',      dmg: 14.3, reach: 10,  speed: 1.1,  edged: true },
  trident:    { name: 'Trident',         dmg: 17.6, reach: 9,   speed: 0.95, edged: true },
  twinBlades: { name: 'Twin Blades',     dmg: 12.5,  reach: 5,   speed: 0.8,  edged: true, dual: true },
  greataxe:   { name: 'Great Axe',       dmg: 15, reach: 7.5, speed: 1.5,  edged: true, twoHanded: true },
  fists:      { name: 'Bare Hands',      dmg: 3,  reach: 3.6,  speed: 0.9,  edged: false },
};

export const SHIELDS: Record<string, ShieldDef> = {
  scutum: { name: 'Large Shield', absorb: 0.5, block: 1.0 },
  parma:  { name: 'Small Shield', absorb: 0.45, block: 0.85 },
  hoplon: { name: 'Round Shield', absorb: 0.55, block: 0.9 },
};

const armor = (head: number, torso: number, arms: number, legs: number): ArmorSet =>
  ({ head, torso, armW: arms, armS: arms, legL: legs, legR: legs });

export interface ClassDef {
  id: ClassId;
  label: string;
  blurb: string;
  base: Stats;          // level-1 stats (60 points total)
  weapon: keyof typeof WEAPONS;
  shield?: keyof typeof SHIELDS;
  armor: ArmorSet;
  signature: string;
  personality: Personality;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  murmillo:    { id: 'murmillo', label: 'Murmillo', blurb: 'Tank. Sword, big shield, heavy armor.',
                 base: { str: 14, agi: 8, vit: 15, end: 12, tec: 11, spi: 12 }, weapon: 'gladius', shield: 'scutum',
                 armor: armor(22, 22, 14, 10), signature: 'Shield Bash', personality: 'defensive' },
  thraex:      { id: 'thraex', label: 'Thraex', blurb: 'Skirmisher. Curved blade, small shield.',
                 base: { str: 11, agi: 14, vit: 11, end: 10, tec: 14, spi: 11 }, weapon: 'scimitar', shield: 'parma',
                 armor: armor(18, 18, 10, 6), signature: 'Hook Strike', personality: 'balanced' },
  hoplomachus: { id: 'hoplomachus', label: 'Hoplomachus', blurb: 'Reach. Spear and shield.',
                 base: { str: 12, agi: 10, vit: 12, end: 12, tec: 14, spi: 12 }, weapon: 'spear', shield: 'hoplon',
                 armor: armor(18, 20, 10, 8), signature: 'Spear Wall', personality: 'balanced' },
  retiarius:   { id: 'retiarius', label: 'Retiarius', blurb: 'Control. Net and trident, light armor.',
                 base: { str: 9, agi: 16, vit: 10, end: 12, tec: 13, spi: 8 }, weapon: 'trident',
                 armor: armor(6, 12, 20, 4), signature: 'Net Throw', personality: 'balanced' },
  dimachaerus: { id: 'dimachaerus', label: 'Dimachaerus', blurb: 'Glass cannon. Dual blades.',
                 base: { str: 15, agi: 16, vit: 8, end: 8, tec: 13, spi: 9 }, weapon: 'twinBlades',
                 armor: armor(8, 8, 4, 2), signature: 'Whirlwind', personality: 'aggressive' },
  brute:       { id: 'brute', label: 'Brute', blurb: 'Power. Two-handed axe, slow heavy hits.',
                 base: { str: 17, agi: 6, vit: 14, end: 13, tec: 10, spi: 10 }, weapon: 'greataxe',
                 armor: armor(11, 15, 7, 5), signature: 'Cleave', personality: 'aggressive' },
};

/** Stats scale with level in proportion to the class's starting spread. Cap 100, diminishing near top. */
export function statsAtLevel(base: Stats, level: number): Stats {
  return scaleStats(base, 1 + 0.35 * (level - 1));
}

/** Scale a class spread by a point multiplier k. Half the growth is proportional, half uniform,
 *  so class identity fades gently with level instead of widening the gaps (flat formula constants shrink). */
export function scaleStats(base: Stats, k: number): Stats {
  const total = base.str + base.agi + base.vit + base.end + base.tec;
  const f = (v: number) => {
    const raw = v * (1 + 0.5 * (k - 1)) + 0.5 * (k - 1) * (total / 5);
    return Math.min(100, Math.round(raw > 70 ? 70 + (raw - 70) * 0.5 : raw));
  };
  return { str: f(base.str), agi: f(base.agi), vit: f(base.vit), end: f(base.end), tec: f(base.tec), spi: Math.round(base.spi + 0.8 * (k - 1)) };
}

export function makeSpec(classId: ClassId, level = 1, name?: string, personality?: Personality): FighterSpec {
  const c = CLASSES[classId];
  return {
    name: name ?? c.label,
    classId,
    level,
    stats: statsAtLevel(c.base, level),
    weapon: WEAPONS[c.weapon],
    shield: c.shield ? SHIELDS[c.shield] : undefined,
    armor: { ...c.armor },
    personality: personality ?? c.personality,
  };
}
